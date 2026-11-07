// Bounded stress test against disposable local fixtures only. No remote URL accepted.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import WebSocket from 'ws';
const base='http://127.0.0.1:8791/api',origin='http://localhost:3000';
const {users}=JSON.parse(readFileSync('.wrangler/integration-20261103/sessions.json'));
const indices=Array.from({length:52},(_,i)=>i).filter(i=>![5,7].includes(i));
const samples=[],failures=[],sockets=[],closures=[];let expectedClose=false;
const headers=i=>({Origin:origin,Cookie:`duty_session=${users[i].raw}; duty_csrf=${users[i].csrf}`,'X-CSRF-Token':users[i].csrf,'Content-Type':'application/json'});
async function req(i,path,method='GET',data,expected=[200]){
 const at=performance.now();let status=0;
 try{const r=await fetch(base+path,{method,headers:headers(i),body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});status=r.status;const body=await r.json();if(!expected.includes(status))failures.push({path,status});return {status,body};}
 catch(e){failures.push({path,error:e.message});throw e;}
 finally{samples.push({path,method,status,ms:Math.round(performance.now()-at)});}
}
async function open(i,expected=101){return new Promise((resolve,reject)=>{
 const ws=new WebSocket(base.replace('http','ws')+'/ws',{headers:headers(i),handshakeTimeout:15000});ws.events=[];ws.on('message',data=>{if(String(data)==='pong'){ws.pongAt=performance.now();return;}ws.events.push({at:performance.now(),...JSON.parse(String(data))});});
 ws.once('open',()=>{if(expected!==101){ws.terminate();reject(new Error('Missing connection limit'));return;}sockets.push(ws);resolve(ws);});
 ws.once('unexpected-response',(_,r)=>{r.resume();if(r.statusCode===expected)resolve(null);else reject(new Error('WS status '+r.statusCode));});
 ws.once('error',reject);ws.on('close',(code)=>{if(!expectedClose&&sockets.includes(ws))closures.push(code);});
});}
const waitFor=async(fn)=>{const end=Date.now()+15000;while(!fn()){if(Date.now()>end)throw new Error('Timed out waiting for realtime');await new Promise(r=>setTimeout(r,20));}};
const summary=values=>{const v=[...values].sort((a,b)=>a-b);return {count:v.length,p50:v[Math.floor(v.length*.5)]||0,p95:v[Math.min(v.length-1,Math.floor(v.length*.95))]||0,max:v.at(-1)||0};};
let report;
try{
 let state=(await req(0,'/state')).body;const data=structuredClone(state.data),teachers=data.employees.filter(e=>e.id.startsWith('it-person-'));
 const start=Date.now()+2*86400000;
 data.shifts=Array.from({length:730},(_,n)=>({id:'stress-'+n,date:new Date(start+n*86400000).toISOString().slice(0,10),dayOfWeek:new Date(start+n*86400000).getUTCDay(),startTime:'07:00',endTime:'07:00 ngày hôm sau',teacher1Id:teachers[(2*n)%teachers.length].id,teacher2Id:teachers[(2*n+1)%teachers.length].id,adminId:n%2===0?'it-m':null,guardId:n%2===0?'it-g':null,status:n%2===0?'COMPLETE':'INCOMPLETE',isLocked:false}));
 assert.equal((await req(0,'/state','PUT',{expectedRevision:state.revision,data})).status,200);console.log('Prepared 730 local shifts; production untouched.');
 await Promise.all(indices.map(i=>open(i)));console.log('Opened 50 authenticated WebSockets.');
 for(let round=0;round<20;round++){
  await Promise.all(indices.map(i=>req(i,round%3===0?'/leaves':'/state')));
  if(round%5===4)console.log('Completed HTTP requests:',(round+1)*50);
 }
 const pingStart=performance.now();sockets.forEach(ws=>ws.send('ping'));await waitFor(()=>sockets.every(ws=>ws.pongAt));const heartbeat=summary(sockets.map(ws=>Math.round(ws.pongAt-pingStart)));
 state=(await req(0,'/state')).body;
 const writes=await Promise.all(Array.from({length:10},(_,n)=>req(0,'/state','PUT',{expectedRevision:state.revision,data:{...state.data,settings:{...state.data.settings,schoolName:'LOCAL STRESS '+n}}},[200,409])));
 assert.equal(writes.filter(r=>r.status===200).length,1);assert.equal(writes.filter(r=>r.status===409).length,9);console.log('10 competing saves: 1 committed, 9 rejected safely.');
 const revision=state.revision+1;await waitFor(()=>sockets.every(ws=>ws.events.some(e=>e.revision===revision)));
 const mutationEnd=performance.now();
 // Measure event receipt against completion of a single successful HTTP write. Negative means received before HTTP returned, not before commit.
 state=(await req(0,'/state')).body;const saveStart=performance.now();const saved=await req(0,'/state','PUT',{expectedRevision:state.revision,data:{...state.data,settings:{...state.data.settings,schoolName:'LOCAL REALTIME MEASURE'}}});const saveEnd=performance.now();
 await waitFor(()=>sockets.every(ws=>ws.events.some(e=>e.revision===saved.body.revision)));
 const realtime=summary(sockets.map(ws=>Math.max(0,Math.round(ws.events.find(e=>e.revision===saved.body.revision).at-saveEnd))));
 const realtimeFromStart=summary(sockets.map(ws=>Math.round(ws.events.find(e=>e.revision===saved.body.revision).at-saveStart)));
 expectedClose=true;sockets.splice(0,25).forEach(ws=>ws.terminate());await Promise.all(indices.slice(0,25).map(i=>open(i)));await Promise.all(indices.slice(0,25).map(i=>req(i,'/state')));expectedClose=false;
 console.log('25 devices reconnected and reloaded current data.');
 const beforeBad=(await req(0,'/state')).body.revision;
 for(const value of [null,[],{},'bad',123,{expectedRevision:beforeBad,data:null}])await req(0,'/state','PUT',value,[400,409]);
 await req(0,'/state','PUT',{padding:'x'.repeat(5*1024*1024+1)},[413]);
 const afterBad=(await req(0,'/state')).body;assert.equal(afterBad.revision,beforeBad);assert.equal(afterBad.data.shifts.length,730);console.log('Malformed/oversized writes rejected without data changes.');
 // Three tabs per account: 150 sockets, the configured room boundary.
 for(let tabs=0;tabs<2;tabs++)await Promise.all(indices.map(i=>open(i)));
 assert.equal(sockets.length,150);await open(indices[1],429);console.log('150 sockets remain connected; excess connection rejected with 429.');
 assert.equal((await req(0,'/health')).status,200);assert.equal(failures.length,0);assert.equal(closures.length,0);
 report={environment:'local workerd/D1/DO only',at:new Date().toISOString(),accounts:50,shifts:730,httpRequests:samples.length,readMs:summary(samples.filter(s=>s.method==='GET'&&s.path==='/state').map(s=>s.ms)),writeMs:summary(samples.filter(s=>s.method==='PUT'&&s.status===200).map(s=>s.ms)),heartbeatMs:heartbeat,realtimeAfterHttpResponseMs:realtime,realtimeFromRequestStartMs:realtimeFromStart,unexpectedFailures:failures,unexpectedSocketClosures:closures,concurrentSaves:{committed:1,conflicts:9},connections:{accepted:150,overflowStatus:429},productionDataTouched:false};
 console.log(JSON.stringify(report,null,2));
} catch(e){report={environment:'local only',error:e.message,failures,closures,httpRequests:samples.length,productionDataTouched:false};console.error(e);process.exitCode=1;}
finally{expectedClose=true;sockets.forEach(ws=>ws.terminate());writeFileSync('STABILITY-LOCAL.json',JSON.stringify(report,null,2));}
