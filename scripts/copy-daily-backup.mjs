import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {verifyBackup} from '../worker/backup.mjs';

// Run on the school computer with its own Wrangler login. Never print the archive.
const work=resolve('../../work'),dir=join(work,'private-backups');
mkdirSync(dir,{recursive:true});
const key=JSON.parse(readFileSync(join(work,'cloudflare-production-secrets.json'),'utf8')).BACKUP_SIGNING_KEY;
const statement="SELECT body FROM backup_object_chunks WHERE object_key=(SELECT object_key FROM backup_logs WHERE status='SUCCESS' ORDER BY created_at DESC LIMIT 1) ORDER BY part";
const cli=resolve('node_modules/wrangler/bin/wrangler.js');
const result=execFileSync(process.execPath,[cli,'d1','execute','DB','--remote','--command',statement,'--json'],{env:{...process.env,XDG_CONFIG_HOME:join(work,'cloudflare-config'),WRANGLER_SEND_METRICS:'false'},maxBuffer:12*1024*1024,stdio:['ignore','pipe','inherit']});
const archive=JSON.parse(JSON.parse(result.toString())[0].results.map(r=>r.body).join(''));
const verified=await verifyBackup({BACKUP_SIGNING_KEY:key},archive);
const stamp=Date.parse(verified.createdAt);
if(!Number.isFinite(stamp)||stamp>Date.now()||Date.now()-stamp>26*3600000)throw Error('Không có bản sao lưu mới hợp lệ trong 26 giờ.');
const file=join(dir,'backup-'+stamp+'.json');
const {existsSync,renameSync}=await import('node:fs');
if(!existsSync(file)){writeFileSync(file+'.tmp',JSON.stringify(archive));await verifyBackup({BACKUP_SIGNING_KEY:key},JSON.parse(readFileSync(file+'.tmp')));renameSync(file+'.tmp',file);}
await verifyBackup({BACKUP_SIGNING_KEY:key},JSON.parse(readFileSync(file)));
for(const name of readdirSync(dir)){const match=/^backup-(\d+)\.json$/.exec(name);if(match&&Number(match[1])<Date.now()-21*86400000)unlinkSync(join(dir,name));}
console.log('Verified separate backup:',verified.createdAt);
// Record one verified restore and one real capacity reading per calendar month.
const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date());
const report=join(work,'capacity-'+month+'.json');
if(!existsSync(report)){
  execFileSync(process.execPath,['scripts/check-private-restore.mjs'],{stdio:'inherit'});
  const info=JSON.parse(execFileSync(process.execPath,[cli,'d1','info','DB','--json'],{
    env:{...process.env,XDG_CONFIG_HOME:join(work,'cloudflare-config'),WRANGLER_SEND_METRICS:'false'},encoding:'utf8'
  }));
  if(!(info.database_size>0))throw Error('Không đo được dung lượng D1.');
  const metrics={checkedAt:new Date().toISOString(),verifiedBackup:verified.createdAt,databaseBytes:info.database_size,reads24h:info.rows_read_24h??null,writes24h:info.rows_written_24h??null};
  writeFileSync(report+'.tmp',JSON.stringify(metrics,null,2));renameSync(report+'.tmp',report);
}
