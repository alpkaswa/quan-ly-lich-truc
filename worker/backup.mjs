import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { digest,sign,equal } from './crypto.mjs';
import { query,commit,nowISO } from './database.mjs';
const columns={
  login_history:['id','user_id','session_id','login_at','logout_at','last_activity_at','duration_seconds','logout_reason','device'],
  app_meta:['id','revision','settings'],
  employees:['id','code','name','role','active','payload'],
  users:['id','username','display_name','password_hash','role','employee_id','active','created_at'],
  google_identities:['id','user_id','email','created_at'],
  account_leave_requests:['id','user_id','date','status','payload','created_at'],
  shifts:['id','date','locked','payload'],
  shift_assignments:['id','shift_id','employee_id','position'],
  unavailable_dates:['id','employee_id','date','status','payload'],
  shift_history:['id','payload'],compensatory_duties:['id','payload'],
  shift_change_requests:['id','requester_id','target_id','source_date','target_date','reason','status','requested_by','responded_by','created_at','responded_at','before_json','after_json'],
  notifications:['id','user_id','message','created_at','read_at'],
  audit_logs:['id','actor_id','operation','revision','created_at','payload'],
};
const ordered=Object.keys(columns);
const deletion=['account_leave_requests','google_identities','used_google_nonces','notifications','shift_change_requests','shift_assignments','unavailable_dates','shift_history','compensatory_duties','shifts','sessions','users','employees','audit_logs'];
function requireBackup(env) { if(!env.BACKUP_SIGNING_KEY || env.BACKUP_SIGNING_KEY.length<32) throw new Error('Sao lưu chưa được cấu hình BACKUP_SIGNING_KEY.'); }
// Bounds apply equally to creation and restore. Parts avoid a multi-megabyte D1 binding.
const MAX_RAW=24*1024*1024, MAX_FILE=4*1024*1024, PART_BYTES=512*1024;
const encoding='gzip-json-parts-v1';
const bytes=text=>Buffer.byteLength(text,'utf8');
export function rowParts(rows) {
  const parts=[];let current=[],size=2;
  for(const row of rows) {
    const text=JSON.stringify(row),n=bytes(text)+1;
    if(n>1900000) throw new Error('Một bản ghi quá lớn để khôi phục an toàn; cần sao lưu SQL riêng.');
    if(current.length&&size+n>PART_BYTES){parts.push('['+current.join(',')+']');current=[];size=2;}
    current.push(text);size+=n;
  }
  if(current.length)parts.push('['+current.join(',')+']');
  return parts;
}
async function transform(input,stream,limit) {
  const reader=new Blob([input]).stream().pipeThrough(stream).getReader();
  const chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new Error('Bản sao lưu vượt giới hạn giải nén an toàn.');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(chunks,size);
}
export async function encodeBackup(env,backup) {
  requireBackup(env);
  validateBackup(backup);
  const tables={};let total=0;
  for(const table of ordered) {
    tables[table]=[];
    for(const part of rowParts(backup.tables[table])) {
      total+=bytes(part);if(total>MAX_RAW)throw new Error('Dữ liệu vượt 24 MiB; cần sao lưu SQL hoặc cấu hình lưu trữ lớn hơn.');
      const packed=await transform(part,new CompressionStream('gzip'),MAX_FILE);
      tables[table].push({bytes:bytes(part),data:packed.toString('base64')});
    }
  }
  const body=JSON.stringify({...backup,tables}),signed=encoding+'\n'+body;
  const envelope={encoding,body,checksum:digest(signed),signature:sign(signed,env.BACKUP_SIGNING_KEY)};
  if(bytes(JSON.stringify(envelope))>MAX_FILE)throw new Error('Bản sao lưu sau nén vượt 4 MiB; cần sao lưu SQL hoặc cấu hình lưu trữ lớn hơn.');
  return envelope;
}
export function backupStorage(env) {
  if(env.BACKUPS){
    const fallback=backupStorage({...env,BACKUPS:null});
    return {put:(...args)=>env.BACKUPS.put(...args),get:async key=>(await env.BACKUPS.get(key))||fallback.get(key),delete:async key=>{await env.BACKUPS.delete(key);await fallback.delete(key);}};
  }
  return {
    async put(key,text) {const statements=[];for(let i=0;i<text.length;i+=50000)statements.push(query(env.DB,'INSERT INTO backup_object_chunks VALUES (?,?,?,?)',`${key}:${i/50000}`,key,i/50000,text.slice(i,i+50000)));await env.DB.batch(statements);},
    async get(key) {const rows=(await query(env.DB,'SELECT body FROM backup_object_chunks WHERE object_key=? ORDER BY part',key).all()).results;if(!rows.length)return null;return {body:new Blob(rows.map(r=>r.body),{type:'application/json'}).stream()};},
    async delete(key) {await query(env.DB,'DELETE FROM backup_object_chunks WHERE object_key=?',key).run();},
  };
}
export async function createBackup(env) {
  const id=randomUUID(), at=nowISO();
  try {
    requireBackup(env);
    let tables,revision;
    for(let attempt=0;attempt<3;attempt++) {
      revision=(await query(env.DB,'SELECT revision FROM app_meta WHERE id=1').first()).revision;
      tables={};let rawBytes=0,rowCount=0;
      // Batch table pages together to stay within the Free plan's invocation query limit.
      let pending=ordered.map(table=>({table,last:''}));
      for(const table of ordered)tables[table]=[];
      while(pending.length) {
        const pages=await env.DB.batch(pending.map(({table,last})=>query(env.DB,`SELECT * FROM ${table} WHERE CAST(id AS TEXT)>? ORDER BY CAST(id AS TEXT) LIMIT 500`,last)));
        const next=[];
        for(let i=0;i<pending.length;i++) {
          const {table}=pending[i],rows=pages[i].results;
          rawBytes+=bytes(JSON.stringify(rows));rowCount+=rows.length;
          if(rawBytes>MAX_RAW||rowCount>15000)throw new Error('Dữ liệu vượt giới hạn sao lưu an toàn (24 MiB / 15.000 bản ghi); cần sao lưu SQL riêng.');
          tables[table].push(...rows);
          if(rows.length===500)next.push({table,last:String(rows.at(-1).id)});
        }
        pending=next;
      }
      if((await query(env.DB,'SELECT revision FROM app_meta WHERE id=1').first()).revision===revision) break;
      tables=null;
    }
    if(!tables) throw new Error('Dữ liệu đang thay đổi liên tục; chưa tạo được bản sao lưu nhất quán.');
    const packed=await encodeBackup(env,{schemaVersion:4,createdAt:at,revision,tables});
    const checksum=packed.checksum,envelope=JSON.stringify(packed);
    const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','_').replace(':','-');
    const objectKey=`backup_${stamp}_${id.slice(0,8)}.json`;
    await backupStorage(env).put(objectKey,envelope,{httpMetadata:{contentType:'application/json'},customMetadata:{checksum,revision:String(revision)}});
    await query(env.DB,'INSERT INTO backup_logs VALUES (?,?,?,?,?,?,?)',id,objectKey,'SUCCESS',at,null,checksum,revision).run();
    // Bounded retention: keep 21 days. Bucket stays private.
    const older=await query(env.DB,"SELECT id,object_key FROM backup_logs WHERE status='SUCCESS' AND created_at<? LIMIT 40",new Date(Date.now()-21*86400000).toISOString()).all();
    for(const item of older.results) { await backupStorage(env).delete(item.object_key); await query(env.DB,'DELETE FROM backup_logs WHERE id=?',item.id).run(); }
    return {id,objectKey,createdAt:at,revision};
  } catch(e) {
    await query(env.DB,'INSERT OR REPLACE INTO backup_logs VALUES (?,?,?,?,?,?,?)',id,null,'FAILED',at,String(e.message).slice(0,500),null,null).run();
    throw e;
  }
}
export async function verifyBackup(env,envelope) {
  requireBackup(env);
  if(!envelope || typeof envelope.body!=='string' || bytes(JSON.stringify(envelope))>5*1024*1024 || (envelope.encoding!==undefined&&envelope.encoding!==encoding))throw new Error('Định dạng hoặc kích thước bản sao lưu không hợp lệ.');
  const signed=envelope.encoding?encoding+'\n'+envelope.body:envelope.body;
  if(!equal(digest(signed),envelope.checksum)||!equal(sign(signed,env.BACKUP_SIGNING_KEY),envelope.signature))throw new Error('Bản sao lưu hỏng, bị sửa đổi hoặc không thuộc hệ thống này.');
  const backup=JSON.parse(envelope.body);
  if(envelope.encoding) {
    if(!backup.tables || Object.keys(backup.tables).sort().join()!==ordered.slice().sort().join())throw new Error('Cấu trúc bản sao lưu không hợp lệ.');
    let total=0;
    for(const table of ordered) {
      const parts=backup.tables[table],rows=[];
      if(!Array.isArray(parts)||parts.length>15000)throw new Error('Phân đoạn sao lưu không hợp lệ.');
      for(const part of parts) {
        if(!part||!Number.isSafeInteger(part.bytes)||part.bytes<2||part.bytes>1900000||typeof part.data!=='string')throw new Error('Phân đoạn sao lưu không hợp lệ.');
        total+=part.bytes;if(total>MAX_RAW)throw new Error('Bản sao lưu vượt giới hạn giải nén an toàn.');
        const raw=await transform(Buffer.from(part.data,'base64'),new DecompressionStream('gzip'),part.bytes);
        if(raw.length!==part.bytes)throw new Error('Kích thước phân đoạn sao lưu không khớp.');
        const decoded=JSON.parse(raw.toString('utf8'));
        if(!Array.isArray(decoded)||rows.length+decoded.length>15000)throw new Error('Phân đoạn sao lưu quá lớn.');
        rows.push(...decoded);
      }
      backup.tables[table]=rows;
    }
  }
  return validateBackup(backup);
}
function validateBackup(backup) {
  if(backup.schemaVersion===1&&backup.tables&&!backup.tables.google_identities)backup.tables.google_identities=[];
  if([1,2].includes(backup.schemaVersion)&&backup.tables&&!backup.tables.account_leave_requests)backup.tables.account_leave_requests=[];
  if([1,2,3].includes(backup.schemaVersion)&&backup.tables)backup.tables.login_history=[];
  if(![1,2,3,4].includes(backup.schemaVersion) || !Number.isSafeInteger(backup.revision) || !backup.tables || Object.keys(backup.tables).sort().join()!==ordered.slice().sort().join()) throw new Error('Cấu trúc bản sao lưu không hợp lệ.');
  let count=0;
  for(const table of ordered) {
    if(!Array.isArray(backup.tables[table])) throw new Error(`Bảng ${table} không hợp lệ`);
    for(const row of backup.tables[table]) { if(Object.keys(row).sort().join()!==columns[table].slice().sort().join()) throw new Error(`Cột của ${table} không hợp lệ`); count++; }
  }
  if(count>15000 || backup.tables.app_meta.length!==1 || !backup.tables.users.some(u=>u.role==='ADMIN'&&u.active===1)) throw new Error('Bản sao lưu quá lớn hoặc không có Admin hoạt động.');
  return backup;
}
export async function restoreBackup(env,envelope,actor) {
  const backup=await verifyBackup(env,envelope);
  const current=await createBackup(env);
  const sql=deletion.map(table=>query(env.DB,`DELETE FROM ${table}`));
  for(const table of ordered.filter(t=>t!=='app_meta')) {
    const cols=columns[table];
    // Small UTF-8 bindings, all within the SAME atomic D1 batch (never partial commits).
    const expressions=cols.map(c=>`json_extract(value,'$.${c}')`).join(',');
    for(const part of rowParts(backup.tables[table]))sql.push(query(env.DB,`INSERT ${table==='login_history'?'OR IGNORE ':''}INTO ${table} (${cols.join(',')}) SELECT ${expressions} FROM json_each(?)`,part));
  }
  sql.push(query(env.DB,"UPDATE login_history SET logout_at=?,logout_reason='restore',duration_seconds=MAX(0,CAST((?-login_at)/1000 AS INTEGER)) WHERE logout_at IS NULL",Date.now(),Date.now()));
  sql.push(query(env.DB,'UPDATE app_meta SET settings=? WHERE id=1',backup.tables.app_meta[0].settings));
  await commit(env.DB,current.revision,sql,actor,'RESTORE',{sourceCreatedAt:backup.createdAt,safetyBackup:current.objectKey});
  return {success:true,safetyBackup:current.objectKey,loginRequired:true};
}
