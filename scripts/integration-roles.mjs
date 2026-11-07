// Isolated local server only. Never use production credentials or endpoints.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base='http://127.0.0.1:8791/api',origin='http://localhost:3000';
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS',label);};
async function req(path,method='GET',data,auth){const r=await fetch(base+path,{method,headers:{Origin:origin,...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json(),cookies:r.headers.getSetCookie()};}
async function login(username,password='1'){const r=await req('/auth/password','POST',{username,password});assert.equal(r.status,200,JSON.stringify(r.data));return {cookie:r.cookies.map(c=>c.split(';')[0]).join('; '),csrf:r.data.csrf,profile:r.data.profile};}
async function socket(auth){const ws=new WebSocket(base.replace('http','ws')+'/ws',{headers:{Origin:origin,Cookie:auth.cookie}});ws.ended=false;ws.on('message',raw=>{if(JSON.parse(String(raw)).type==='session-ended')ws.ended=true;});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;}
async function ended(ws){const end=Date.now()+5000;while(!ws.ended&&Date.now()<end)await new Promise(r=>setTimeout(r,20));const result=ws.ended;ws.terminate();return result;}
let admin=await login('it-u0','local-admin-test-password');
const account=(await req('/accounts','GET',null,admin)).data.find(p=>p.username==='security-test');assert.ok(account);
let a=await login('security-test');
const role=(auth,uid,oldRole,newRole,confirm=true)=>req('/accounts/role','POST',{uid,expectedRole:oldRole,role:newRole,confirm},auth);
check((await role(admin,'it-u0','ADMIN','USER')).status===409,'last active Admin cannot be demoted');
check((await role(a,account.id,'USER','ADMIN')).status===403,'User cannot self-promote through API');
check((await req('/accounts/activity','GET',null,a)).status===403,'User cannot read activity audit');
check((await role(admin,account.id,'USER','ADMIN',false)).status===400,'role change requires explicit confirmation');
check((await role(admin,account.id,'ADMIN','USER')).status===409,'stale role rejected');
const firstSocket=await socket(a);
check((await role(admin,account.id,'USER','ADMIN')).status===200,'Admin grants personnel full Admin role');
check(await ended(firstSocket),'promotion revokes existing WebSocket');
check((await req('/accounts','GET',null,a)).status===401,'old session rejected after promotion');
a=await login('security-test');check(a.profile.role==='ADMIN','new login receives Admin role');
for(const path of ['/accounts','/accounts/history','/accounts/activity','/accounts/role-history','/backups'])check((await req(path,'GET',null,a)).status===200,'promoted Admin can access '+path);
const fresh=(await req('/accounts','GET',null,admin)).data.find(p=>p.id===account.id);check(fresh.roleGrantedBy==='it-u0'&&Boolean(fresh.roleGrantedAt),'Admin list shows granting actor and time');
const proposed=await req('/leaves','POST',{date:'2035-01-15',reason:'Local role test personal leave'},a);check(proposed.status===200&&proposed.data.leave.status==='PENDING','Admin retains personal leave submission');
const secondSocket=await socket(a);
check((await role(admin,account.id,'ADMIN','USER')).status===200,'Admin revokes granted role');
check(await ended(secondSocket),'demotion revokes realtime connection');
check((await req('/accounts','GET',null,a)).status===401,'demoted old session rejected');
a=await login('security-test');check(a.profile.role==='EMPLOYEE','new session returns to User');
check((await req('/state','GET',null,a)).status===200,'demoted User still views common schedule');
check((await req('/accounts','GET',null,a)).status===403,'demoted User cannot call Admin API');
const log=(await req('/accounts/role-history','GET',null,admin)).data.items;
check(log.filter(r=>r.details.recipientId===account.id).length===2&&log.some(r=>r.details.oldRole==='USER'&&r.details.newRole==='ADMIN'&&r.details.actorId==='it-u0'&&r.created_at),'both role transitions have complete audit records');
check((await role(admin,account.id,'USER','ADMIN')).status===200,'Admin can grant again');a=await login('security-test');
const created=await req('/accounts','POST',{username:'role-second',employeeId:'it-g'},admin);check(created.status===200,'create second personnel account');const secondId=created.data.id;
check((await role(admin,secondId,'USER','ADMIN')).status===200,'multiple personnel may hold Admin');let b=await login('role-second');
const bSocket=await socket(b);
check((await req('/accounts/active','POST',{uid:secondId,active:false,confirm:true},a)).status===200,'Admin can lock another Admin');check(await ended(bSocket),'locking Admin revokes WebSocket');
check((await req('/accounts','GET',null,b)).status===401,'locked Admin cannot use old session');
await req('/accounts/active','POST',{uid:secondId,active:true,confirm:true},a);b=await login('role-second');
check((await req('/accounts/active','POST',{uid:'it-u0',active:false,confirm:true},a)).status===200,'lock initial Admin only when replacement Admins exist');
const results=await Promise.all([role(a,account.id,'ADMIN','USER'),role(b,secondId,'ADMIN','USER')]);
check(results.map(r=>r.status).sort().join(',')==='200,409','concurrent removals cannot eliminate every active Admin');
a=await login('security-test');b=await login('role-second');const survivor=a.profile.role==='ADMIN'?a:b;
check((await req('/accounts/active','POST',{uid:survivor.profile.id,active:false,confirm:true},survivor)).status===409,'last remaining active Admin cannot be locked');
check((await role(survivor,survivor.profile.id,'ADMIN','USER')).status===409,'last remaining active Admin cannot self-demote');
await req('/accounts/active','POST',{uid:'it-u0',active:true,confirm:true},survivor);admin=await login('it-u0','local-admin-test-password');
check((await req('/accounts','GET',null,admin)).data.some(p=>p.id==='it-u0'&&p.active&&p.role==='ADMIN'),'original Admin preserved and usable');
console.log(JSON.stringify({roleIntegration:'PASS',checks,productionDataTouched:false}));
