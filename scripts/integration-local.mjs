import {hashPassword} from '../worker/password.mjs';
// Local-only integration fixtures. Never use --remote or production credentials here.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base='http://127.0.0.1:8791',origin='http://localhost:3000';
const dir='.wrangler/integration-20261103';
const sha=v=>createHash('sha256').update(v).digest('hex');
const sqlString=v=>v===null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
const insert=(table,values)=>`INSERT INTO ${table} VALUES (${values.map(sqlString).join(',')});`;
if(process.argv.includes('--prepare')){
 const pepperLine=readFileSync('.dev.vars','utf8').split(/\r?\n/).find(line=>line.startsWith('PASSWORD_PEPPER='));if(!pepperLine)throw new Error('Missing local test PASSWORD_PEPPER');const localPepper=pepperLine.slice('PASSWORD_PEPPER='.length).trim().replace(/^['"]|['"]$/g,'');const adminHash=hashPassword('local-admin-test-password',localPepper);
 mkdirSync(dir,{recursive:true});const users=Array.from({length:52},(_,i)=>({id:`it-u${i}`,raw:randomBytes(32).toString('base64url'),csrf:randomBytes(32).toString('base64url')}));
 const tables=['login_history','account_leave_requests','google_identities','used_google_nonces','notifications','shift_change_requests','shift_assignments','unavailable_dates','shift_history','compensatory_duties','shifts','sessions','users','employees','audit_logs','backup_logs','backup_object_chunks','login_limits','mutation_guard'];
 const sql=[...tables.map(t=>`DELETE FROM ${t};`),'UPDATE app_meta SET revision=0 WHERE id=1;'],now=Date.now(),at=new Date().toISOString();
 const day=offset=>new Date(now+offset*86400000).toISOString().slice(0,10);
 const employees=[['it-e1','TEACHER'],['it-e2','TEACHER'],['it-e3','TEACHER'],['it-e5','TEACHER'],['it-e6','TEACHER'],['it-duplicate','TEACHER'],['it-m','ADMIN'],['it-g','GUARD']].map(([id,role])=>({id,code:id,name:id,role,email:id==='it-e3'?'u3@example.invalid':['it-e5','it-duplicate'].includes(id)?'u5@example.invalid':id==='it-e1'?'u7@example.invalid':id+'@example.invalid',isActive:true}));
 for(let i=4;i<52;i++)if(![5,6,7].includes(i))employees.push({id:`it-person-${i}`,code:`IT${i}`,name:`Local staff ${i}`,role:'TEACHER',email:`u${i}@example.invalid`,isActive:true});
 for(const e of employees)sql.push(insert('employees',[e.id,e.code,e.name,e.role,1,JSON.stringify(e)]));
 for(let i=0;i<52;i++){const u=users[i];sql.push(insert('users',[u.id,u.id,u.id,i===0?adminHash:'GOOGLE_ONLY',i===0?'ADMIN':'EMPLOYEE',i===1?'it-e1':i===2?'it-e2':i===6?'it-e6':i>=4&&![5,7].includes(i)?`it-person-${i}`:null,1,at]),insert('google_identities',[`local-only-google-${i}`,u.id,`u${i}@example.invalid`,at]),insert('sessions',[sha(u.raw),u.id,sha(u.csrf),now+3600000,now]));}
 const shifts=[[day(3),'it-e1','it-e5'],[day(7),'it-e2','it-e6']].map(([date,t1,t2],i)=>({id:`it-s${i}`,date,startTime:'07:00',endTime:'07:00 ngày hôm sau',isLocked:false,status:'COMPLETE',teacher1Id:t1,teacher2Id:t2,adminId:'it-m',guardId:'it-g'}));
 for(const s of shifts){const p={...s};for(const key of ['teacher1Id','teacher2Id','adminId','guardId'])delete p[key];sql.push(insert('shifts',[s.id,s.date,0,JSON.stringify(p)]));for(const pos of ['teacher1','teacher2','admin','guard'])sql.push(insert('shift_assignments',[s.id+':'+pos,s.id,s[pos+'Id'],pos]));}
 const leave={id:'it-before-match',userId:'it-u3',date:day(3),reason:'local fixture before automatic matching',status:'APPROVED',createdAt:at};sql.push(insert('account_leave_requests',[leave.id,leave.userId,leave.date,leave.status,JSON.stringify(leave),at]));
 const existingLeave={...leave,id:'it-existing-link',userId:'it-u6',date:day(12)};sql.push(insert('account_leave_requests',[existingLeave.id,existingLeave.userId,existingLeave.date,existingLeave.status,JSON.stringify(existingLeave),at]));
 const expiredId=sha('local-only-expired-session');sql.push(insert('sessions',[expiredId,users[0].id,sha('expired-csrf'),now-1000,now-61000]),insert('login_history',['local-expired-history',users[0].id,expiredId,now-61000,null,now-31000,null,null,'Local expiry test']));
 writeFileSync(dir+'/seed.sql',sql.join('\n'));writeFileSync(dir+'/sessions.json',JSON.stringify({users,shifts,day:day(10)}));console.log('Prepared 50 local-only sessions and isolated fixtures.');process.exit(0);
}
const fixture=JSON.parse(readFileSync(dir+'/sessions.json','utf8'));
const cookie=i=>`duty_session=${fixture.users[i].raw}; duty_csrf=${fixture.users[i].csrf}`;
const timings=[];
async function request(i,path,method='GET',data,headers={}){
 const started=performance.now();
 const response=await fetch(base+'/api'+path,{method,headers:{Origin:origin,...(i!==null?{Cookie:cookie(i),'X-CSRF-Token':fixture.users[i].csrf}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
 const result={status:response.status,data:await response.json()};timings.push({method,path,status:result.status,ms:Math.round(performance.now()-started)});return result;
}
async function open(i){return await new Promise((resolve,reject)=>{const socket=new WebSocket(base.replace('http','ws')+'/api/ws',{headers:{Origin:origin,Cookie:cookie(i)},handshakeTimeout:15000});socket.events=[];socket.on('message',raw=>{if(String(raw)!=='pong')socket.events.push(JSON.parse(String(raw)));});socket.once('open',()=>resolve(socket));socket.once('error',reject);});}
async function waitFor(check,label){const end=Date.now()+10000;while(Date.now()<end){if(check())return;await new Promise(r=>setTimeout(r,25));}assert.fail('Timed out: '+label);}
const sockets=[];let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS',label);};
try{
 check((await request(null,'/state')).status===401,'anonymous cannot read private state');
 check((await request(1,'/state','PUT',{})).status===403,'employee cannot modify shared schedule');
 check((await request(1,'/accounts')).status===403,'employee cannot list all accounts');
 check((await request(1,'/leaves','POST',{date:fixture.day,reason:'test'},{'X-CSRF-Token':'wrong'})).status===403,'CSRF rejected');
 check((await request(1,'/leaves','POST',{date:fixture.day,reason:'test'},{Origin:'https://wrong.invalid'})).status===403,'foreign origin rejected');
 check((await request(5,'/auth/session')).status===403,'duplicate personnel email is not guessed');
 check((await request(7,'/auth/session')).status===403,'another user cannot claim already owned personnel');
 check((await request(4,'/leaves','POST',null)).status===400,'JSON null request rejected cleanly');
 check((await request(3,'/auth/session')).data.profile.employeeId==='it-e3','verified email auto-matches existing session');
 check((await request(6,'/leaves')).data.some(l=>l.id==='it-existing-link'&&l.employeeId==='it-e6'),'previously matched users also migrate earlier account leave');
 const migrated=await request(3,'/leaves');check(migrated.data.some(l=>l.id==='it-before-match'&&l.employeeId==='it-e3'&&l.status==='APPROVED'),'approved account leave follows personnel after matching');
 const blocked=await request(1,'/swaps','POST',{shiftDate:fixture.shifts[0].date,targetEmployeeId:'it-e3',reason:'local leave check'});check(blocked.status!==200&&blocked.data.error.includes('nghỉ'),'migrated approved leave blocks swap');
 for(let i=0;i<52;i++)if(![5,7].includes(i))sockets.push(await open(i));check(sockets.length===50,'50 real local WebSocket connections opened');
 let result=await request(4,'/leaves','POST',{date:fixture.day,reason:'local-only leave',userId:'it-u1',status:'APPROVED'});check(result.status===200&&result.data.leave.employeeId==='it-person-4'&&result.data.leave.status==='PENDING','authorized employee submits own pending leave');check(result.data.leave.submittedByName==='it-u4','sender recorded from authenticated account');const leaveId=result.data.leave.id;
 check((await request(8,'/leaves')).data.some(l=>l.id===leaveId&&l.status==='PENDING'&&!l.canWithdraw&&l.submittedByName==='it-u4'),'all employees see pending leave without authority to withdraw it');
 await waitFor(()=>sockets.every(s=>s.events.some(e=>e.kind==='leave')),'50 realtime notifications');check(true,'all 50 real sockets receive post-commit change');
 check((await request(8,'/leaves/withdraw','POST',{id:leaveId})).status===403,'another account cannot withdraw leave');
 check((await request(4,'/leaves/respond','POST',{id:leaveId,status:'APPROVED'})).status===403,'employee cannot approve leave');
 check((await request(4,'/leaves','POST',{date:fixture.day,reason:'duplicate'})).status!==200,'duplicate leave rejected');
 check((await request(4,'/leaves/withdraw','POST',{id:leaveId})).status===200,'owner can withdraw pending leave');
 result=await request(1,'/swaps','POST',{shiftDate:fixture.shifts[0].date,targetEmployeeId:'it-e2',targetShiftDate:fixture.shifts[1].date,reason:'local integration swap'});check(result.status===200,'swap proposal created without changing roster');const requestId=result.data.id;
 check((await request(1,'/swaps/respond','POST',{requestId,accept:true})).status===403,'sender cannot accept on recipient behalf');
 const concurrent=await Promise.all([request(0,'/swaps/respond','POST',{requestId,accept:true}),request(2,'/swaps/respond','POST',{requestId,accept:true})]);
 check(concurrent.map(r=>r.status).sort().join(',')==='200,409','simultaneous acceptance commits exactly once');
 const state=(await request(1,'/state')).data;
 check(state.data.shifts.find(s=>s.id==='it-s0').teacher1Id==='it-e2'&&state.data.shifts.find(s=>s.id==='it-s1').teacher1Id==='it-e1','both shift assignments persisted atomically');
 check(state.data.history.length===2,'one accepted swap produces exactly two history entries');
 const reversed=await request(2,'/swaps','POST',{shiftDate:fixture.shifts[0].date,targetEmployeeId:'it-e1',targetShiftDate:fixture.shifts[1].date,reason:'reverse by B, approved by Admin'});check(reversed.status===200,'B may propose reciprocal swap to A');
 const waiting=(await request(1,'/state')).data;check(waiting.data.shifts.find(s=>s.id==='it-s0').teacher1Id==='it-e2','proposal alone never updates the roster');
 check((await request(0,'/swaps/respond','POST',{requestId:reversed.data.id,accept:true})).status===200,'Admin may approve reciprocal swap');

 await waitFor(()=>sockets.every(s=>s.events.some(e=>e.kind==='swap')),'all swap recipients');check(true,'50 listeners receive swap update');
 sockets[10].terminate();const fresh=(await request(0,'/state')).data;const before=fresh.revision;
 const a=structuredClone(fresh.data),b=structuredClone(fresh.data);a.settings.schoolName='Local integration A';b.settings.schoolName='Local integration B';
 const saves=await Promise.all([request(0,'/state','PUT',{expectedRevision:before,data:a}),request(0,'/state','PUT',{expectedRevision:before,data:b})]);check(saves.map(r=>r.status).sort().join(',')==='200,409','stale concurrent Admin save rejected without overwrite');
 sockets[10]=await open(10);check((await request(10,'/state')).data.revision>before,'reconnected client reads latest committed revision');
 const staffing=(await request(0,'/state')).data;
 for(let i=0;i<50;i++)staffing.data.employees.push({id:'bulk-'+i,code:'bulk-'+i,name:'Local bulk '+i,role:i<40?'TEACHER':i<45?'ADMIN':'GUARD',isActive:true,email:'bulk-'+i+'@example.invalid'});
 const day=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
 for(let i=0;i<20;i++)staffing.data.shifts.push({id:'bulk-shift-'+i,date:day(20+i*2),startTime:'07:00',endTime:'07:00 ngày hôm sau',isLocked:false,status:'INCOMPLETE',teacher1Id:null,teacher2Id:null,adminId:null,guardId:null});
 const allocated=await request(0,'/state','PUT',{expectedRevision:staffing.revision,data:staffing.data});check(allocated.status===200&&allocated.data.automatic.filled===80,'bulk 50 new staff automatically fill 80 missing positions atomically');
 const balanced=(await request(1,'/state')).data.data,roles=new Map(balanced.employees.map(e=>[e.id,e.role]));
 check(balanced.shifts.filter(s=>s.id.startsWith('bulk-shift')).every(s=>roles.get(s.teacher1Id)==='TEACHER'&&roles.get(s.teacher2Id)==='TEACHER'&&roles.get(s.adminId)==='ADMIN'&&roles.get(s.guardId)==='GUARD'&&s.teacher1Id!==s.teacher2Id),'teachers BGH and guards automatically occupy correct positions');
 for(const role of ['TEACHER','ADMIN','GUARD']){const counts=balanced.employees.filter(e=>e.isActive&&e.role===role).map(e=>balanced.shifts.reduce((n,s)=>n+['teacher1Id','teacher2Id','adminId','guardId'].filter(f=>s[f]===e.id).length,0));check(Math.max(...counts)-Math.min(...counts)<=1,'bulk workloads balanced within one shift for '+role);}
 const backup=await request(0,'/backups','POST',{});check(backup.status===200,'real local D1 backup created');
 const snapshot=await request(0,'/backups/download?id='+encodeURIComponent(backup.data.id));check(snapshot.status===200&&typeof snapshot.data.signature==='string','signed backup downloadable by Admin');
 check((await request(1,'/backups')).status===403,'employee cannot access backups');
 check((await request(0,'/accounts/active','POST',{uid:'it-u51',active:false})).status===200,'Admin locks user');
 await waitFor(()=>sockets[49].events.some(e=>e.type==='session-ended'),'immediate revocation notification');
 check(true,'locked device receives immediate session-ended event before transport cleanup');
 check((await request(51,'/auth/session')).status===401,'locked account session cannot continue');
 const reads=await Promise.all(Array.from({length:52},(_,i)=>i).filter(i=>![5,7,51].includes(i)).map(i=>request(i,'/state')));check(reads.every(r=>r.status===200),'49 concurrent authenticated state reads');
 writeFileSync('PERFORMANCE-LOCAL.json',JSON.stringify({environment:'local workerd/D1, not production',at:new Date().toISOString(),timings},null,2));
 console.log(JSON.stringify({localIntegration:'PASS',checks,realWebSockets:50,productionDataTouched:false}));
}finally{for(const socket of sockets)socket.terminate();}
