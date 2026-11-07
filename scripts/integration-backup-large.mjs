// Large-backup regression, local workerd only. Run after integration:prepare.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {verifyBackup} from '../worker/backup.mjs';
import {digest,sign} from '../worker/crypto.mjs';
const dir='.wrangler/integration-20261103';
if(process.argv.includes('--prepare')){
 const statements=Array.from({length:100},(_,i)=>`INSERT INTO audit_logs VALUES ('backup-large-${i}','it-u0','LOCAL_BACKUP_TEST',0,'2026-01-01',json_object('note',replace(hex(zeroblob(4500)),'00','Lịch trực quản sinh Na Rì ')));`);
 writeFileSync(dir+'/backup-large.sql',statements.join('\n'));console.log('Prepared local large-backup fixture only.');process.exit(0);
}
const env={BACKUP_SIGNING_KEY:readFileSync('.dev.vars','utf8').match(/^BACKUP_SIGNING_KEY=(.+)$/m)[1].trim().replace(/^['"]|['"]$/g,'')};
let auth={};const samples=[];
async function req(path,method='GET',data){const at=performance.now();const r=await fetch('http://127.0.0.1:8791/api'+path,{method,headers:{Origin:'http://localhost:3000',...auth,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(90000)});const result=await r.json();samples.push({path,ms:Math.round(performance.now()-at),status:r.status});return {status:r.status,data:result,cookies:r.headers.getSetCookie()};}
async function login(){const r=await req('/auth/password','POST',{username:'it-u0',password:'local-admin-test-password'});assert.equal(r.status,200);auth={Cookie:r.cookies.map(c=>c.split(';')[0]).join('; '),'X-CSRF-Token':r.data.csrf};}
async function backup(){const r=await req('/backups','POST',{});assert.equal(r.status,200,JSON.stringify(r.data));const file=(await req('/backups/download?id='+r.data.id)).data;return {file,decoded:await verifyBackup(env,file)};}
const normalized=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Array.isArray(v)?[...v].sort((a,b)=>String(a.id).localeCompare(String(b.id))):v]));
await login();const saved=(await req('/state')).data;
const {file,decoded}=await backup();const rawBytes=Buffer.byteLength(JSON.stringify(decoded)),fileBytes=Buffer.byteLength(JSON.stringify(file));assert.ok(rawBytes>8*1024*1024);assert.ok(fileBytes<4*1024*1024);assert.equal(decoded.tables.audit_logs.filter(r=>r.operation==='LOCAL_BACKUP_TEST').length,100);
assert.equal((await req('/backups/restore','POST',{confirm:'KHOI PHUC',backup:{...file,body:file.body+' '}})).status,400);assert.equal((await req('/state')).data.revision,saved.revision);
const restore=await req('/backups/restore','POST',{confirm:'KHOI PHUC',backup:file});assert.equal(restore.status,200,JSON.stringify(restore.data));assert.ok(restore.data.safetyBackup);assert.equal((await req('/auth/session')).status,401);
await login();const after=await backup();assert.deepEqual(after.decoded.tables.audit_logs.filter(r=>r.operation==='LOCAL_BACKUP_TEST'),decoded.tables.audit_logs.filter(r=>r.operation==='LOCAL_BACKUP_TEST'));assert.deepEqual(normalized((await req('/state')).data.data),normalized(saved.data));
// Existing uncompressed v4 format is restored through the real API as well.
const legacy=structuredClone(after.decoded);legacy.tables.audit_logs=legacy.tables.audit_logs.filter(r=>r.operation!=='LOCAL_BACKUP_TEST');const body=JSON.stringify(legacy);const old={body,checksum:digest(body),signature:sign(body,env.BACKUP_SIGNING_KEY)};
assert.equal((await req('/backups/restore','POST',{confirm:'KHOI PHUC',backup:old})).status,200);await login();assert.deepEqual(normalized((await req('/state')).data.data),normalized(saved.data));
const report={environment:'local workerd/D1 only',rawBytes,fileBytes,largeAuditRowsPreserved:100,tamperedRejected:true,legacyRestore:true,atomicRestore:true,safetyBackup:true,productionDataTouched:false,samples};writeFileSync('BACKUP-TEST-RESULTS.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
