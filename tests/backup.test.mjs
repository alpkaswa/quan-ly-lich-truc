import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeBackup,verifyBackup,rowParts} from '../worker/backup.mjs';
import {digest,sign} from '../worker/crypto.mjs';
const env={BACKUP_SIGNING_KEY:'local-test-only-backup-key-not-for-production'};
const empty=()=>({schemaVersion:4,createdAt:new Date().toISOString(),revision:1,tables:Object.fromEntries(['login_history','app_meta','employees','users','google_identities','account_leave_requests','shifts','shift_assignments','unavailable_dates','shift_history','compensatory_duties','shift_change_requests','notifications','audit_logs'].map(t=>[t,t==='app_meta'?[{id:1,revision:1,settings:'{}'}]:t==='users'?[{id:'admin',username:'admin',display_name:'Test Admin',password_hash:'TEST',role:'ADMIN',employee_id:null,active:1,created_at:'2026-01-01'}]:[]]))});
const signedLegacy=backup=>{const body=JSON.stringify(backup);return {body,checksum:digest(body),signature:sign(body,env.BACKUP_SIGNING_KEY)};};
test('compressed backup preserves Unicode and over 8 MiB of history with small SQL bindings',async()=>{
 const original=empty();original.tables.audit_logs=Array.from({length:100},(_,i)=>({id:String(i),actor_id:'admin',operation:'TEST',revision:i,created_at:'2026-01-01',payload:JSON.stringify({name:'Lịch trực quản sinh '.repeat(5000)})}));
 assert.ok(Buffer.byteLength(JSON.stringify(original))>8*1024*1024);
 const envelope=await encodeBackup(env,original);assert.ok(Buffer.byteLength(JSON.stringify(envelope))<4*1024*1024);
 assert.deepEqual(await verifyBackup(env,envelope),original);
 const parts=rowParts(original.tables.audit_logs);assert.ok(parts.length>1);assert.ok(parts.every(p=>Buffer.byteLength(p)<1900000));
});
test('legacy schemas 1 to 4 remain readable',async()=>{for(const version of [1,2,3,4]){const original=empty();original.schemaVersion=version;if(version===1)delete original.tables.google_identities;if(version<=2)delete original.tables.account_leave_requests;if(version<=3)delete original.tables.login_history;assert.equal((await verifyBackup(env,signedLegacy(original))).tables.users[0].role,'ADMIN');}});
test('tampering, wrong signing key and encoding downgrade rejected',async()=>{const packed=await encodeBackup(env,empty());await assert.rejects(verifyBackup(env,{...packed,body:packed.body+' '}));await assert.rejects(verifyBackup({...env,BACKUP_SIGNING_KEY:'another-local-only-key-of-at-least-32-characters'},packed));const downgraded={...packed};delete downgraded.encoding;await assert.rejects(verifyBackup(env,downgraded));});
test('authenticated malformed gzip and decompression size mismatch rejected',async()=>{const packed=await encodeBackup(env,empty());for(const alter of [p=>p.bytes=2,p=>p.data='bm90LWd6aXA=']){const manifest=JSON.parse(packed.body);alter(manifest.tables.users[0]);const body=JSON.stringify(manifest),value=packed.encoding+'\n'+body;await assert.rejects(verifyBackup(env,{...packed,body,checksum:digest(value),signature:sign(value,env.BACKUP_SIGNING_KEY)}));}});
test('creation rejects data that cannot safely be restored',async()=>{const original=empty();original.tables.audit_logs=[{id:'1',actor_id:'admin',operation:'TEST',revision:1,created_at:'2026-01-01',payload:'x'.repeat(2000000)}];await assert.rejects(encodeBackup(env,original));original.tables.audit_logs=[];original.tables.users[0].active=0;await assert.rejects(encodeBackup(env,original));});
