// Simulates browser events against an actual disposable local HTTP/WebSocket server.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import WebSocket from 'ws';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:8791',origin='http://localhost:3000';
const logged=await fetch(base+'/api/auth/password',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'security-test',password:'1'})});assert.equal(logged.status,200);
const cookie=logged.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const realFetch=globalThis.fetch;
globalThis.fetch=(url,options={})=>{if(typeof url==='string'&&url.startsWith('/api')){const headers=new Headers(options.headers);headers.set('Cookie',cookie);headers.set('Origin',origin);return realFetch(base+url,{...options,headers});}return realFetch(url,options);};
globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.visibilityState='visible';globalThis.location=new URL(origin);Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
globalThis.WebSocket=class extends WebSocket{constructor(url){super(base.replace('http','ws')+new URL(url).pathname,{headers:{Origin:origin,Cookie:cookie}});}};
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {getSession}=await vite.ssrLoadModule('/src/services/api.ts');const {StorageService,storageEvents}=await vite.ssrLoadModule('/src/services/storage.ts');
let connected=false,ready=false,disconnected=false,hasConnected=false,stop;
storageEvents.addEventListener('connection',e=>{connected=e.detail;if(connected)hasConnected=true;else if(hasConnected)disconnected=true;});storageEvents.addEventListener('ready',()=>{ready=true;});
const wait=async fn=>{const end=Date.now()+120000;while(!fn()){if(Date.now()>end)throw new Error('Restart recovery timed out');await new Promise(r=>setTimeout(r,100));}};
const state=()=>JSON.stringify({shifts:StorageService.getShifts(),employees:StorageService.getEmployees(),settings:StorageService.getSettings()});
try{await getSession();stop=StorageService.listen(false);await wait(()=>ready&&connected);const before=state();console.log('READY_TO_RESTART_LOCAL_SERVER');await wait(()=>disconnected);ready=false;console.log('Detected local server interruption; preserving cached view.');assert.equal(state(),before);await wait(()=>connected&&ready);assert.equal(state(),before);const result={environment:'local only',serverRestartRecovery:'PASS',dataPreserved:true,automaticReconnect:true,productionDataTouched:false};writeFileSync('RECOVERY-LOCAL.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
finally{stop?.();await vite.close();globalThis.fetch=realFetch;}
