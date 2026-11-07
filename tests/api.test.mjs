import test,{before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let vite,api,getSession;
const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalSetTimeout=globalThis.setTimeout;
before(async()=>{vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});({api,getSession}=await vite.ssrLoadModule('/src/services/api.ts'));});
afterEach(()=>{globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.setTimeout=originalSetTimeout;});
after(async()=>{await vite?.close();});
test('expired API session dispatches session-ended and reports error',async()=>{
 globalThis.window=new EventTarget();let ended=false;window.addEventListener('session-ended',()=>{ended=true;});globalThis.fetch=async()=>Response.json({error:'Phiên hết hạn'}, {status:401});
 await assert.rejects(()=>api('/state'),/Phiên hết hạn/);assert.equal(ended,true);
});
test('authenticated writes send CSRF token obtained from session, with same-origin cookies',async()=>{
 globalThis.fetch=async()=>Response.json({profile:{id:'test-user'},csrf:'test-only-csrf'});await getSession();
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/leaves');assert.equal(options.credentials,'same-origin');assert.equal(options.headers['X-CSRF-Token'],'test-only-csrf');assert.equal(options.body,JSON.stringify({date:'2030-01-01',reason:'test'}));return Response.json({success:true});};
 assert.equal((await api('/leaves','POST',{date:'2030-01-01',reason:'test'})).success,true);
});
test('unresponsive writes abort with uncertain-result message rather than inviting duplicate submission',async()=>{
 globalThis.setTimeout=(fn,ms,...args)=>originalSetTimeout(fn,ms===25000?0:ms,...args);
 globalThis.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));
 await assert.rejects(()=>api('/leaves','POST',{}),/Đồng bộ lại để kiểm tra trước khi gửi lại/);
});
