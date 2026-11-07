// Read-only, on-demand probes. No API tokens or object names leave the Worker.
const day=86400000;
export function quota(value,limit){if(!Number.isFinite(value)||value<0||!(limit>0))return null;const percent=value*100/limit;return {percent,level:[95,85,70].find(n=>percent>=n)??null};}
async function analytics(env,now){
 const unknown={usage:null,errors:null,events:[],note:'Chưa cấu hình quyền đọc Cloudflare Analytics.'};
 if(!env.CF_ANALYTICS_TOKEN||!env.MONITOR_ACCOUNT_ID||!env.MONITOR_DATABASE_ID)return unknown;
 const request=async(query,variables)=>{const res=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(5500)});if(!res.ok)throw Error();const json=await res.json();if(json.errors?.length||!json.data?.viewer?.accounts?.[0])throw Error();return json.data.viewer.accounts[0];};
 const utc=new Date(now).toISOString().slice(0,10),account=env.MONITOR_ACCOUNT_ID;
 const [usage,failures]=await Promise.allSettled([
 request(`query($account:string!,$date:Date!,$db:string!){viewer{accounts(filter:{accountTag:$account}){db:d1AnalyticsAdaptiveGroups(limit:1,filter:{date:$date,databaseId:$db}){sum{readQueries writeQueries}} all:d1AnalyticsAdaptiveGroups(limit:1,filter:{date:$date}){sum{rowsRead rowsWritten}}}}}`,{account,date:utc,db:env.MONITOR_DATABASE_ID}),
 request(`query($account:string!,$start:Time!,$end:Time!,$script:string!){viewer{accounts(filter:{accountTag:$account}){faults:workersInvocationsAdaptive(limit:1,filter:{datetime_geq:$start,datetime_lt:$end,scriptName:$script}){sum{errors}} events:workersInvocationsAdaptive(limit:20,filter:{datetime_geq:$start,datetime_lt:$end,scriptName:$script,status_neq:"ok"},orderBy:[datetimeHour_DESC]){dimensions{datetimeHour status} sum{errors}}}}}`,{account,start:new Date(now-day).toISOString(),end:new Date(now).toISOString(),script:'lich-truc-na-ri-api'})]);
 const u=usage.status==='fulfilled'?usage.value:null,f=failures.status==='fulfilled'?failures.value:null;
 return {usage:u?.db?.[0]?.sum||u?.all?.[0]?.sum?{...u.db?.[0]?.sum,...u.all?.[0]?.sum}:null,errors:f?.faults?.[0]?.sum?.errors??null,events:(f?.events||[]).filter(e=>e.sum.errors>0).map(e=>({at:e.dimensions.datetimeHour,reason:e.dimensions.status,count:e.sum.errors})),note:!u||!f?'Một số số liệu Analytics chưa đọc được.':null};
}
export async function systemMonitor(env){
 const now=Date.now(),limits={size:500000000,read:5000000,write:100000};
 const [db,room,r2,metrics]=await Promise.allSettled([
 env.DB.batch([env.DB.prepare('SELECT 1 AS ping'),env.DB.prepare("SELECT created_at FROM backup_logs WHERE status='SUCCESS' ORDER BY created_at DESC LIMIT 1"),env.DB.prepare("SELECT created_at,error FROM backup_logs WHERE status='FAILED' ORDER BY created_at DESC LIMIT 10")]),
 env.ROOM.get(env.ROOM.idFromName('school')).fetch('https://internal/status').then(async r=>{if(!r.ok)throw Error();const n=(await r.json()).connections;if(!Number.isSafeInteger(n)||n<0)throw Error();return n;}),
 env.BACKUPS?env.BACKUPS.list({limit:1}).then(()=>'Đã kiểm tra truy cập đọc') : Promise.resolve('Chưa cấu hình; sao lưu vào D1'), analytics(env,now)]);
 const rows=db.status==='fulfilled'?db.value:null, size=rows?.[0]?.meta?.size_after||null,m=metrics.status==='fulfilled'?metrics.value:{usage:null,errors:null,events:[],note:'Không đọc được Analytics.'};
 return {checkedAt:new Date(now).toISOString(),worker:'Đã phản hồi',d1:rows?.[0]?.results?.[0]?.ping===1?'Đã kiểm tra':'Không kiểm tra được',connections:room.status==='fulfilled'?room.value:null,size,r2:r2.status==='fulfilled'?r2.value:'Không kiểm tra được quyền đọc R2',backup:rows?.[1]?.results?.[0]?.created_at??null,backupKnown:!!rows,backupErrors:(rows?.[2]?.results||[]).map(r=>({at:r.created_at,reason:/vượt|quá lớn/i.test(r.error)?'Vượt giới hạn dung lượng sao lưu':/cấu hình/i.test(r.error)?'Thiếu cấu hình sao lưu':'Không hoàn tất sao lưu; xem nhật ký sao lưu.'})),...m,quotas:{size:quota(size,limits.size),read:quota(m.usage?.rowsRead,limits.read),write:quota(m.usage?.rowsWritten,limits.write)}};
}
