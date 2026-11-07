import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {verifyBackup,restoreBackup} from '../worker/backup.mjs';
const memory=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').sort())memory.exec(readFileSync('migrations/'+file,'utf8'));
const DB={prepare(sql){return {bind(...args){const s=memory.prepare(sql);return {first:()=>s.get(...args),all:()=>({results:s.all(...args)}),run:()=>s.run(...args),execute:()=>({results:s.all(...args)})};}};},batch(statements){memory.exec('BEGIN');try{const r=statements.map(s=>s.execute());memory.exec('COMMIT');return r;}catch(e){memory.exec('ROLLBACK');throw e;}}};
const dir='../../work/private-backups/';
const archive=JSON.parse(readFileSync(dir+readdirSync(dir).filter(s=>/^backup-\d+\.json$/.test(s)).sort().at(-1)));
const env={DB,BACKUP_SIGNING_KEY:JSON.parse(readFileSync('../../work/cloudflare-production-secrets.json')).BACKUP_SIGNING_KEY};
const original=await verifyBackup(env,archive);
const admin=original.tables.users.find(u=>u.role==='ADMIN'&&u.active===1);
memory.prepare('INSERT INTO users VALUES(?,?,?,?,?,NULL,1,?)').run(admin.id,admin.username,admin.display_name,admin.password_hash,admin.role,admin.created_at);
await restoreBackup(env,archive,admin.id);
for(const table of ['employees','shifts','shift_assignments','account_leave_requests','unavailable_dates','users']){
 const rows=memory.prepare('SELECT * FROM '+table+' ORDER BY id').all();
 assert.deepEqual(JSON.parse(JSON.stringify(rows)),[...original.tables[table]].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));
}
console.log('Isolated restore verified',original.createdAt);
memory.close();
