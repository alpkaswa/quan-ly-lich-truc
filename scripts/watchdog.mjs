// Run from Windows Task Scheduler under the school administrator's session.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
const work=resolve('../../work');
const statusFile=join(work,'watchdog-status.json');
const previous=existsSync(statusFile)?JSON.parse(readFileSync(statusFile,'utf8')):{};
const site='https://lich-truc-na-ri.pages.dev';
async function checkPage(path){
  const r=await fetch(site+path,{signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  if(path==='/api/health')return (await r.json()).ok===true;
  return (await r.text()).includes('id="root"');
}
async function check(name,action){
  try{return [name,Boolean(await action())];}catch{return [name,false];}
}
const checks=Object.fromEntries(await Promise.all([
  check('website',()=>checkPage('/')),check('worker',()=>checkPage('/api/health')),
  check('backup48h',()=>readdirSync(join(work,'private-backups')).some(name=>{
    const m=/^backup-(\d+)\.json$/.exec(name);
    if(!m)return false;
    const age=Date.now()-Number(m[1]);
    return age>=0 && age<=48*3600000;
  })),
  check('d1',()=>{
    const output=execFileSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--remote','--command','SELECT 1 AS ping','--json'],{
      timeout:30000,encoding:'utf8',stdio:['ignore','pipe','pipe'],
      env:{...process.env,XDG_CONFIG_HOME:join(work,'cloudflare-config'),WRANGLER_SEND_METRICS:'false'}
    });
    return JSON.parse(output)[0]?.results?.[0]?.ping===1;
  })
]));
const labels={website:'Trang web',worker:'Worker',d1:'Kiểm tra D1 từ máy trường (gồm quyền Wrangler)',backup48h:'Bản sao riêng trong 48 giờ'};
const counts={},notified={};
for(const [name,ok] of Object.entries(checks)){
  counts[name]=ok?0:(previous.counts?.[name]||0)+1;
  notified[name]=!ok && previous.notified?.[name]===true;
  if(counts[name]>=(name==='backup48h'?1:2) && !notified[name]){
    try{
      execFileSync('msg.exe',[process.env.USERNAME,'/TIME:120','Lịch trực Na Rì: cần kiểm tra '+labels[name]+'.'],{timeout:5000,windowsHide:true,stdio:'ignore'});
      notified[name]=true;
    }catch{/* Try delivery again on the next check. */}
  }
}
const state={at:new Date().toISOString(),checks,counts,notified};
writeFileSync(statusFile+'.tmp',JSON.stringify(state,null,2));renameSync(statusFile+'.tmp',statusFile);
console.log(JSON.stringify(state));
if(Object.values(checks).includes(false))process.exitCode=1;
