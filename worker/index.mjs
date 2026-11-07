import {systemMonitor} from './monitor.mjs';
import {hashPassword,verifyPassword} from './password.mjs';
import {endHistory,expireHistory} from './loginHistory.mjs';
import {staffingChanged,balanceRoster} from '../shared/autoRoster.mjs';
import {recognizeEmployee} from './identity.mjs';
import {makeGoogleNonce,checkGoogleNonce,verifyGoogleToken,requireGoogleProvisioning} from './google.mjs';
import {employeeLeave,canWithdrawLeave,accountLeave,canWithdrawAccountLeave} from '../shared/leave.mjs';
import { randomUUID } from 'node:crypto';
import { digest,token,equal } from './crypto.mjs';
import { snapshot,query,commit,dataStatements,shiftStatements,requestView,nowISO } from './database.mjs';
import { applySwap,id,validateData } from '../shared/domain.mjs';
import { createBackup,restoreBackup,backupStorage } from './backup.mjs';
import { pruneOldData, getCutoff } from './retention.mjs';
export { ScheduleRoom } from './room.mjs';
const json=(data,status=200,headers={})=>{const h=new Headers(headers);h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');return Response.json(data,{status,headers:h});};
const cookies=request=>Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
const names=env=>env.ALLOW_LOCAL_HTTP==='true'?['duty_session','duty_csrf']:['__Host-duty_session','__Host-duty_csrf'];
const sessionCookie=(env,name,value,maxAge)=>`${name}=${value}; Path=/; ${name.endsWith('session')?'HttpOnly; ':''}${env.ALLOW_LOCAL_HTTP==='true'?'':'Secure; '}SameSite=Strict; Max-Age=${maxAge}`;
function error(message,status=400) { const e=new Error(message); e.status=status; throw e; }
async function body(request,max=5*1024*1024) {
  if(!request.headers.get('Content-Type')?.includes('application/json')) error('Cần gửi JSON.',415);
  if(Number(request.headers.get('Content-Length'))>max) error('Tệp quá lớn.',413);
  const reader=request.body?.getReader(); if(!reader) error('Thiếu nội dung.');
  let size=0; const chunks=[];
  while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length;if(size>max){await reader.cancel();error('Tệp quá lớn.',413);}chunks.push(value); }
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{error('JSON không hợp lệ.');}
  if(!data||typeof data!=='object'||Array.isArray(data))error('Nội dung phải là một đối tượng JSON.');
  return data;
}
function publicUser(user) { const grant=user.role_grant_payload?JSON.parse(user.role_grant_payload):null;return {id:user.id,employeeId:user.employee_id,role:user.role,displayName:user.display_name,username:user.username,email:user.google_email||null,active:Boolean(user.active),roleGrantedBy:user.role==='ADMIN'?grant?.actorName||null:null,roleGrantedAt:user.role==='ADMIN'?user.role_grant_at||null:null}; }
function admin(user) { if(user.role!=='ADMIN') error('Chỉ Admin được thực hiện.',403); }
async function session(request,env,mutation=false) {
  const c=cookies(request),[name,csrfName]=names(env),raw=c[name];
  if(!raw) error('Cần đăng nhập.',401);
  const row=await query(env.DB,'SELECT s.id AS session_id,s.csrf_hash,s.expires_at,u.*,(SELECT email FROM google_identities gi WHERE gi.user_id=u.id) AS google_email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? AND u.active=1',digest(raw),Date.now()).first();
  if(!row) error('Phiên hết hạn hoặc tài khoản đã khóa.',401);
  if(mutation && (!c[csrfName] || !equal(c[csrfName],request.headers.get('X-CSRF-Token')) || !equal(digest(c[csrfName]),row.csrf_hash)))error('Phiên xác thực không hợp lệ. Đăng nhập lại.',403);
  const matchedRevision=await recognizeEmployee(env.DB,row);
  if(matchedRevision!==null)await publish(env,{revision:matchedRevision,kind:'accounts'});
  if(row.role!=='ADMIN'&&!row.employee_id)error('Tài khoản chưa được Admin gắn hồ sơ nhân sự. Vui lòng liên hệ Admin để cấp quyền.',403);
  if(row.employee_id&&row.role!=='ADMIN') { const e=await query(env.DB,'SELECT active FROM employees WHERE id=?',row.employee_id).first();if(!e?.active)error('Nhân sự đã ngừng hoạt động.',403); }
  await query(env.DB,'UPDATE login_history SET last_activity_at=? WHERE session_id=? AND logout_at IS NULL',Date.now(),row.session_id).run();
  return row;
}
async function publish(env,event) {
  for(let attempt=0;attempt<3;attempt++) {
    try { const response=await env.ROOM.get(env.ROOM.idFromName('school')).fetch('https://internal/broadcast',{method:'POST',body:JSON.stringify(event)});if(response.ok)return; } catch {}
  }
  // Never roll back or report an already-committed mutation as unsaved.
  console.error('Realtime broadcast unavailable after committed D1 mutation');
}
async function rateLimit(env,key,max=5,window=900000) {
  const now=Date.now();
  const result=await query(env.DB,'INSERT INTO login_limits(id,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END RETURNING attempts',digest(key),now+window,now,now,now+window).first();
  if(result.attempts>max)error('Quá nhiều lần thử. Vui lòng đợi 15 phút.',429);
}
const sessionSeconds=400*86400;
async function issueSession(request,env,u) {
 const raw=token(),csrf=token(),sid=digest(raw),at=Date.now(),expiry=at+sessionSeconds*1000;
 const issued=await env.DB.batch([query(env.DB,"INSERT INTO sessions SELECT ?,id,?,?,? FROM users WHERE id=? AND active=1 AND password_hash=? AND role=? AND (role='ADMIN' OR EXISTS (SELECT 1 FROM employees WHERE employees.id=users.employee_id AND active=1))",sid,digest(csrf),expiry,at,u.id,u.password_hash,u.role),query(env.DB,'INSERT INTO login_history SELECT ?,?,?,?,NULL,?,NULL,NULL,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=?)',randomUUID(),u.id,sid,at,at,(request.headers.get('User-Agent')||'').slice(0,300),sid)]);
 if(!issued[0].meta.changes)error('Tài khoản vừa thay đổi hoặc bị khóa. Vui lòng đăng nhập lại.',401);
 const h=new Headers();const [name,csrfName]=names(env);h.append('Set-Cookie',sessionCookie(env,name,raw,sessionSeconds));h.append('Set-Cookie',sessionCookie(env,csrfName,csrf,sessionSeconds));
 return json({profile:publicUser(u),csrf},200,h);
}
async function accountRoute(request,env,path,user) {
  admin(user);
  if(path==='/api/accounts' && request.method==='GET') return json((await query(env.DB,"SELECT u.id,u.username,u.display_name,u.role,u.employee_id,u.active,gi.email AS google_email,(SELECT payload FROM audit_logs a WHERE a.operation='ACCOUNT_ROLE' AND json_extract(a.payload,'$.recipientId')=u.id AND json_extract(a.payload,'$.newRole')='ADMIN' ORDER BY a.revision DESC LIMIT 1) AS role_grant_payload,(SELECT created_at FROM audit_logs a WHERE a.operation='ACCOUNT_ROLE' AND json_extract(a.payload,'$.recipientId')=u.id AND json_extract(a.payload,'$.newRole')='ADMIN' ORDER BY a.revision DESC LIMIT 1) AS role_grant_at FROM users u LEFT JOIN google_identities gi ON gi.user_id=u.id ORDER BY u.display_name").all()).results.map(publicUser));
  if(['/api/accounts/role-history','/api/accounts/activity'].includes(path)&&request.method==='GET'){
    const value=new URL(request.url).searchParams.get('before');
    const before=value===null?Number.MAX_SAFE_INTEGER:Number(value);
    if(!Number.isSafeInteger(before)||before<1)error('Mốc nhật ký không hợp lệ.');
    const rolesOnly=path.endsWith('/role-history');
    const rows=(await query(env.DB,`SELECT a.id,a.actor_id,a.operation,a.revision,a.created_at,u.display_name AS actor_name,${rolesOnly?'a.payload':"'{}' AS payload"} FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.revision<? ${rolesOnly?"AND a.operation='ACCOUNT_ROLE'":''} ORDER BY a.revision DESC LIMIT 51`,before).all()).results;
    return json({items:rows.slice(0,50).map(r=>({...r,details:JSON.parse(r.payload),payload:undefined})),nextBefore:rows.length>50?rows[49].revision:null});
  }
  if(path==='/api/accounts/history'&&request.method==='GET'){
    await expireHistory(env.DB);
    const params=new URL(request.url).searchParams,uid=params.get('user')||'',day=params.get('date')||'',month=params.get('month')||'';
    if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)||month&&!/^\d{4}-\d{2}$/.test(month))error('Ngày tháng không hợp lệ.');
    return json((await query(env.DB,"SELECT h.*,u.display_name FROM login_history h LEFT JOIN users u ON u.id=h.user_id WHERE (?='' OR h.user_id=?) AND (?='' OR date(h.login_at/1000,'unixepoch','+7 hours')=?) AND (?='' OR strftime('%Y-%m',h.login_at/1000,'unixepoch','+7 hours')=?) ORDER BY h.login_at DESC LIMIT 200",uid,uid,day,day,month,month).all()).results);
  }
  if(request.method!=='POST')error('Phương thức không hợp lệ.',405);
  const data=await body(request,20000), state=await query(env.DB,'SELECT revision FROM app_meta WHERE id=1').first();
  if(path==='/api/accounts'){
    const username=String(data.username||'').trim().toLowerCase();
    if(!/^[a-z0-9._-]{3,64}$/.test(username))error('Tên đăng nhập từ 3–64 ký tự: chữ không dấu, số, dấu chấm, gạch ngang.');
    const employee=await query(env.DB,'SELECT * FROM employees WHERE id=? AND active=1',id(data.employeeId)).first();
    if(!employee)error('Chọn nhân sự đang hoạt động.');
    if(await query(env.DB,'SELECT id FROM users WHERE username=? OR employee_id=?',username,employee.id).first())error('Tên đăng nhập hoặc nhân sự đã có tài khoản.',409);
    const initialPassword=data.password?String(data.password).trim():'1';
    if(initialPassword.length<1||initialPassword.length>128)error('Mật khẩu từ 1 đến 128 ký tự.');
    const uid=randomUUID(),hash=hashPassword(initialPassword,env.PASSWORD_PEPPER);
    const revision=await commit(env.DB,state.revision,[query(env.DB,'INSERT INTO users VALUES (?,?,?,?,?,?,1,?)',uid,username,employee.name,hash,'EMPLOYEE',employee.id,nowISO())],user.id,'ACCOUNT_CREATE',{uid,employeeId:employee.id});
    await publish(env,{revision,kind:'accounts'});return json({success:true,id:uid});
  }
  if(path==='/api/accounts/batch'){
    const initialPassword=data.password?String(data.password).trim():'1';
    if(initialPassword.length<1||initialPassword.length>128)error('Mật khẩu từ 1 đến 128 ký tự.');
    const unprovisioned=(await query(env.DB,'SELECT e.* FROM employees e WHERE e.active=1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id=e.id)').all()).results;
    if(!unprovisioned.length)return json({success:true,count:0,message:'Tất cả nhân sự đang hoạt động đều đã có tài khoản.'});
    const sql=[],created=[];
    for(const emp of unprovisioned){
      const baseName=String(emp.code||emp.name||'user').toLowerCase().replace(/[^a-z0-9._-]/g,'');
      let candidate=baseName.length>=3?baseName:`user_${emp.id.replace(/[^a-z0-9]/gi,'').slice(0,6).toLowerCase()}`;
      const exists=await query(env.DB,'SELECT id FROM users WHERE username=?',candidate).first();
      if(exists)candidate=`${candidate}_${randomUUID().slice(0,4)}`;
      const uid=randomUUID(),hash=hashPassword(initialPassword,env.PASSWORD_PEPPER);
      sql.push(query(env.DB,'INSERT INTO users VALUES (?,?,?,?,?,?,1,?)',uid,candidate,emp.name,hash,'EMPLOYEE',emp.id,nowISO()));
      created.push({id:uid,name:emp.name,code:emp.code,username:candidate});
    }
    const revision=await commit(env.DB,state.revision,sql,user.id,'ACCOUNT_CREATE_BATCH',{count:created.length});
    await publish(env,{revision,kind:'accounts'});
    return json({success:true,count:created.length,created});
  }
  if(path==='/api/accounts/role'){
    if(data.confirm!==true)error('Cần xác nhận thay đổi quyền.');
    if(!['ADMIN','USER'].includes(data.role)||!['ADMIN','USER'].includes(data.expectedRole))error('Vai trò không hợp lệ.');
    const target=await query(env.DB,'SELECT * FROM users WHERE id=?',id(data.uid)).first();
    if(!target)error('Không tìm thấy tài khoản.',404);
    const oldRole=target.role==='ADMIN'?'ADMIN':'USER',newRole=data.role;
    if(oldRole!==data.expectedRole)error('Quyền vừa thay đổi. Tải lại danh sách trước khi thao tác.',409);
    if(oldRole===newRole)error('Tài khoản đã có quyền này.',409);
    if(newRole==='ADMIN'){
      if(target.id===user.id)error('Không được tự cấp quyền Admin.',403);
      if(!target.active)error('Cần mở khóa tài khoản trước khi cấp quyền.');
      if(!target.employee_id||!(await query(env.DB,'SELECT active FROM employees WHERE id=?',target.employee_id).first())?.active)error('Cần gắn hồ sơ nhân sự đang hoạt động trước khi cấp quyền.');
    }else{
      if(target.active&&(await query(env.DB,"SELECT count(*) AS n FROM users WHERE role='ADMIN' AND active=1").first()).n<=1)error('Không thể thu hồi quyền Admin hoạt động cuối cùng.',409);
      if(!target.employee_id||!(await query(env.DB,'SELECT active FROM employees WHERE id=?',target.employee_id).first())?.active)error('Cần gắn hồ sơ nhân sự đang hoạt động để tài khoản tiếp tục sử dụng quyền User.');
    }
    const details={actorId:user.id,actorName:user.display_name,recipientId:target.id,recipientName:target.display_name,oldRole,newRole,grantedBy:newRole==='ADMIN'?user.id:null};
    const revision=await commit(env.DB,state.revision,[query(env.DB,'UPDATE users SET role=? WHERE id=?',newRole==='ADMIN'?'ADMIN':'EMPLOYEE',target.id),endHistory(env.DB,'user_id',target.id,'role_changed'),query(env.DB,'DELETE FROM sessions WHERE user_id=?',target.id)],user.id,'ACCOUNT_ROLE',details);
    await publish(env,{revision,kind:'accounts',revokeUser:target.id});return json({success:true,loginRequired:true});
  }
  if(path==='/api/accounts/link'){
    const target=await query(env.DB,'SELECT * FROM users WHERE id=?',id(data.uid)).first();
    const employee=await query(env.DB,'SELECT * FROM employees WHERE id=? AND active=1',id(data.employeeId)).first();
    if(!target||!employee)error('Tài khoản hoặc nhân sự không hợp lệ.');
    if(await query(env.DB,'SELECT id FROM users WHERE employee_id=? AND id<>?',employee.id,target.id).first())error('Nhân sự đã liên kết tài khoản khác.',409);
    const revision=await commit(env.DB,state.revision,[query(env.DB,'UPDATE users SET employee_id=? WHERE id=?',employee.id,target.id),endHistory(env.DB,'user_id',target.id,'relinked'),query(env.DB,'DELETE FROM sessions WHERE user_id=?',target.id)],user.id,'ACCOUNT_LINK',{uid:target.id,employeeId:employee.id});
    await publish(env,{revision,kind:'accounts',revokeUser:target.id});return json({success:true});
  }
  if(path==='/api/accounts/reset-password'){
    const target=await query(env.DB,'SELECT * FROM users WHERE id=?',id(data.uid)).first();
    if(!target||target.role==='ADMIN')error('Không cấp lại mật khẩu Admin qua chức năng này.');
    const newPassword=data.newPassword?String(data.newPassword).trim():'1';
    if(newPassword.length<1||newPassword.length>128)error('Mật khẩu từ 1 đến 128 ký tự.');
    const revision=await commit(env.DB,state.revision,[query(env.DB,'UPDATE users SET password_hash=? WHERE id=?',hashPassword(newPassword,env.PASSWORD_PEPPER),target.id),endHistory(env.DB,'user_id',target.id,'password_reset'),query(env.DB,'DELETE FROM sessions WHERE user_id=?',target.id)],user.id,'PASSWORD_RESET',{uid:target.id});
    await publish(env,{revision,kind:'accounts',revokeUser:target.id});return json({success:true});
  }
  if(path==='/api/accounts/active') {
    if(typeof data.active!=='boolean')error('Trạng thái không hợp lệ.');
    const target=await query(env.DB,'SELECT id,role,active FROM users WHERE id=?',id(data.uid)).first();if(!target)error('Không tìm thấy tài khoản.',404);
    if(target.role==='ADMIN'&&target.active&&!data.active&&(await query(env.DB,"SELECT count(*) AS n FROM users WHERE role='ADMIN' AND active=1").first()).n<=1)error('Không thể khóa Admin hoạt động cuối cùng.',409);
    if(target.role==='ADMIN'&&data.confirm!==true)error('Cần xác nhận thay đổi trạng thái Admin.');
    const revision=await commit(env.DB,state.revision,[query(env.DB,'UPDATE users SET active=? WHERE id=?',data.active?1:0,target.id),...(!data.active?[endHistory(env.DB,'user_id',target.id,'revoked'),query(env.DB,'DELETE FROM sessions WHERE user_id=?',target.id)]:[])],user.id,'ACCOUNT_ACTIVE',{uid:target.id,active:data.active});
    await publish(env,{revision,kind:'accounts',...(!data.active?{revokeUser:target.id}:{})});return json({success:true});
  }
  if(path==='/api/accounts/delete') {
    const target=await query(env.DB,'SELECT id,role,active,display_name FROM users WHERE id=?',id(data.uid)).first();
    if(!target)error('Không tìm thấy tài khoản.',404);
    if(target.id===user.id)error('Không thể tự xóa tài khoản của chính mình.',403);
    if(target.role==='ADMIN'&&(await query(env.DB,"SELECT count(*) AS n FROM users WHERE role='ADMIN' AND active=1").first()).n<=1)error('Không thể xóa Admin hoạt động cuối cùng.',409);
    const sql=[
      endHistory(env.DB,'user_id',target.id,'account_deleted'),
      query(env.DB,'DELETE FROM sessions WHERE user_id=?',target.id),
      query(env.DB,'DELETE FROM notifications WHERE user_id=?',target.id),
      query(env.DB,'DELETE FROM google_identities WHERE user_id=?',target.id),
      query(env.DB,'DELETE FROM account_leave_requests WHERE user_id=?',target.id),
      query(env.DB,'DELETE FROM shift_change_requests WHERE requested_by=? OR responded_by=?',target.id,target.id),
      query(env.DB,'DELETE FROM users WHERE id=?',target.id)
    ];
    const revision=await commit(env.DB,state.revision,sql,user.id,'ACCOUNT_DELETE',{uid:target.id,name:target.display_name});
    await publish(env,{revision,kind:'accounts',revokeUser:target.id});
    return json({success:true});
  }
  error('Không tìm thấy chức năng.',404);
}
function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (origin === env.APP_ORIGIN) return true;
  if (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.split(',').map(s=>s.trim()).includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  return false;
}
async function route(request,env,ctx) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  const mutation=!['GET','HEAD','OPTIONS'].includes(method);
  const origin=request.headers.get('Origin');
  if(method==='OPTIONS') {
    const h=new Headers();
    if(isAllowedOrigin(origin, env)) {
      h.set('Access-Control-Allow-Origin', origin);
      h.set('Access-Control-Allow-Credentials','true');
      h.set('Access-Control-Allow-Headers','Content-Type,X-CSRF-Token,X-Bootstrap-Token');
      h.set('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
      h.set('Vary','Origin');
    }
    return new Response(null,{status:204, headers: h});
  }
  if(((mutation || path==='/api/ws') && !isAllowedOrigin(origin, env))||(origin && !isAllowedOrigin(origin, env)))error('Nguồn truy cập không hợp lệ.',403);
  if(path==='/api/health') return json({ok:true,storage:'D1',realtime:'Durable Objects WebSocket'});
  if(path==='/api/auth/google/config'&&method==='GET') {
    if(!env.GOOGLE_CLIENT_ID)return json({configured:false,clientId:null});
    const name=env.ALLOW_LOCAL_HTTP==='true'?'duty_google_nonce':'__Host-duty_google_nonce';
    const existing=cookies(request)[name];
    try{
      const nonce=checkGoogleNonce(existing,env.PASSWORD_PEPPER);
      const expires=Number(existing.split('.')[1]);
      const used=await query(env.DB,'SELECT id FROM used_google_nonces WHERE id=?',digest(nonce)).first();
      if(!used && expires>Date.now()+120000)return json({configured:true,clientId:env.GOOGLE_CLIENT_ID,nonce,expiresAt:expires});
    }catch{}
    const state=makeGoogleNonce(env.PASSWORD_PEPPER);
    return json({configured:true,clientId:env.GOOGLE_CLIENT_ID,nonce:state.nonce,expiresAt:Number(state.cookie.split('.')[1])},200,{'Set-Cookie':`${name}=${state.cookie}; Path=/; HttpOnly; ${env.ALLOW_LOCAL_HTTP==='true'?'':'Secure; '}SameSite=Strict; Max-Age=600`});
  }
  if(path==='/api/auth/password'&&method==='POST'){
    await rateLimit(env,`password-ip:${request.headers.get('CF-Connecting-IP')||'local'}`,120);
    const input=await body(request,20000),username=String(input.username||'').trim().toLowerCase();
    await rateLimit(env,`password-user:${username}`,5);
    const u=await query(env.DB,'SELECT u.* FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE lower(u.username)=? OR (u.employee_id IS NOT NULL AND lower(e.code)=?)',username,username).first();
    if(!u||!verifyPassword(input.password,u.password_hash,env.PASSWORD_PEPPER))error('Tên đăng nhập hoặc mật khẩu không đúng.',401);
    if(!u.active)error('Tài khoản đã bị khóa.',403);
    if(u.role!=='ADMIN'&&!u.employee_id)error('Tài khoản chưa được Admin gắn hồ sơ nhân sự.',403);
    if(u.role!=='ADMIN'&&u.employee_id&&!(await query(env.DB,'SELECT active FROM employees WHERE id=?',u.employee_id).first())?.active)error('Nhân sự đã ngừng hoạt động.',403);
    await query(env.DB,'DELETE FROM login_limits WHERE id=?',digest(`password-user:${username}`)).run();
    return issueSession(request,env,u);
  }
  if(path==='/api/auth/google'&&method==='POST') {
    if(!env.GOOGLE_CLIENT_ID)error('Đăng nhập Google chưa được cấu hình.',503);
    await rateLimit(env,`google:${request.headers.get('CF-Connecting-IP')||'local'}`,120);
    const input=await body(request,20000),nonceName=env.ALLOW_LOCAL_HTTP==='true'?'duty_google_nonce':'__Host-duty_google_nonce';
    let identity,nonce;
    try{nonce=checkGoogleNonce(cookies(request)[nonceName],env.PASSWORD_PEPPER);}catch{error('Phiên xác minh Google đã hết hạn. Bấm Thử lại để lấy phiên mới.',409);}
    try{identity=await verifyGoogleToken(input.credential,env.GOOGLE_CLIENT_ID,nonce);}catch(e){
      if(e.code==='ERR_JWKS_TIMEOUT'||e instanceof TypeError)error('Chưa kết nối được máy chủ xác minh Google. Vui lòng thử lại.',503);
      error('Không xác minh được đăng nhập Google. Bấm Thử lại để lấy phiên mới.',401);
    }
    let u;
    for(let attempt=0;attempt<3;attempt++){
      const state=await query(env.DB,'SELECT revision FROM app_meta WHERE id=1').first();
      const linked=await query(env.DB,'SELECT u.* FROM users u JOIN google_identities gi ON gi.user_id=u.id WHERE gi.id=?',identity.sub).first();
      const sql=[];
      if(linked){u=linked;if(!u.active)error('Tài khoản đã bị khóa.',403);}
      else {
        // Only the deployment-controlled, verified owner email can link the initial Admin.
        const owner=identity.email===String(env.ADMIN_GOOGLE_EMAIL||'').toLowerCase();
        const existing=owner?await query(env.DB,"SELECT u.* FROM users u LEFT JOIN google_identities gi ON gi.user_id=u.id WHERE u.role='ADMIN' AND gi.id IS NULL ORDER BY u.created_at LIMIT 1").first():null;
        if(existing){u=existing;if(!u.active)error('Tài khoản đã bị khóa.',403);}
        else {
          const allowed=(await query(env.DB,"SELECT e.id FROM employees e WHERE e.active=1 AND lower(trim(json_extract(e.payload,'$.email')))=? ",identity.email).all()).results;
          requireGoogleProvisioning(allowed);
          const provisioned=await query(env.DB,'SELECT u.* FROM users u WHERE u.employee_id=? AND NOT EXISTS (SELECT 1 FROM google_identities gi WHERE gi.user_id=u.id)',allowed[0].id).first();
          requireGoogleProvisioning(allowed,provisioned);
          if(provisioned){u=provisioned;}
          else {u={id:randomUUID(),username:`google-${identity.sub}`,display_name:identity.name,password_hash:'GOOGLE_ONLY',role:'EMPLOYEE',employee_id:allowed[0].id,active:1,created_at:nowISO()};sql.push(query(env.DB,'INSERT INTO users(id,username,display_name,password_hash,role,employee_id,active,created_at) VALUES (?,?,?,?,?,?,?,?)',u.id,u.username,u.display_name,u.password_hash,u.role,u.employee_id,u.active,u.created_at));}}
        sql.push(query(env.DB,'INSERT INTO google_identities VALUES (?,?,?,?)',identity.sub,u.id,identity.email,nowISO()));
      }
      if(u.role!=='ADMIN'&&!u.employee_id){u.google_email=identity.email;await recognizeEmployee(env.DB,u);if(!u.employee_id)error('Tài khoản chưa được Admin gắn hồ sơ nhân sự. Vui lòng liên hệ Admin để cấp quyền.',403);}
      if(u.role!=='ADMIN'&&u.employee_id && !(await query(env.DB,'SELECT active FROM employees WHERE id=?',u.employee_id).first())?.active)error('Nhân sự đã ngừng hoạt động.',403);
      sql.push(query(env.DB,'INSERT INTO used_google_nonces VALUES (?,?)',digest(nonce),Date.now()+600000));
      try{await commit(env.DB,state.revision,sql,u.id,'GOOGLE_LOGIN',{userId:u.id});break;}catch(e){if(e.status===409&&attempt<2)continue;throw e;}
    }
    await publish(env,{kind:'accounts'});
    return issueSession(request,env,{...u,google_email:identity.email});
  }

  if(path==='/api/auth/session' && method!=='GET')error('Phương thức không hợp lệ.',405);
  const user=await session(request,env,mutation);
  if(path==='/api/system'&&method==='GET'){admin(user);return json(await systemMonitor(env));}
  if(path==='/api/system/prune'&&method==='POST') {
    admin(user);
    const result=await pruneOldData(env);
    if(result.pruned.shifts>0||result.pruned.history>0) {
      const state=await snapshot(env.DB);
      const revision=await commit(env.DB,state.revision,[],user.id,'SYSTEM_PRUNE',result);
      await publish(env,{revision,kind:'schedule'});
    }
    return json(result);
  }
  if(path==='/api/system/retention'&&method==='GET') {
    admin(user);
    return json({policy:'CURRENT_AND_PREVIOUS_MONTH',...getCutoff()});
  }
  if(path==='/api/auth/change-password'&&method==='POST'){
    await rateLimit(env,`change-password:${user.id}`,5);
    const input=await body(request,20000);
    const state=await snapshot(env.DB);
    const current=await query(env.DB,'SELECT u.password_hash FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND s.id=? AND u.active=1 AND s.expires_at>?',user.id,user.session_id,Date.now()).first();
    if(!current)error('Phiên đã bị thu hồi. Vui lòng đăng nhập lại.',401);
    if(!verifyPassword(input.currentPassword,current.password_hash,env.PASSWORD_PEPPER))error('Mật khẩu hiện tại không đúng.',403);
    if(typeof input.newPassword!=='string'||input.newPassword.length<8||input.newPassword.length>128)error('Mật khẩu mới cần 8–128 ký tự.');
    await commit(env.DB,state.revision,[query(env.DB,'UPDATE users SET password_hash=? WHERE id=?',hashPassword(input.newPassword,env.PASSWORD_PEPPER),user.id),endHistory(env.DB,'user_id',user.id,'password_changed'),query(env.DB,'DELETE FROM sessions WHERE user_id=?',user.id)],user.id,'PASSWORD_CHANGE',{uid:user.id});
    await publish(env,{kind:'session',revokeUser:user.id});const h=new Headers();for(const n of names(env))h.append('Set-Cookie',sessionCookie(env,n,'',0));return json({success:true,loginRequired:true},200,h);
  }
  if(path==='/api/auth/session'&&method==='GET'){
    const [name,csrfName]=names(env),values=cookies(request),headers=new Headers();
    const csrf=values[csrfName];
    if(!csrf || !equal(digest(csrf),user.csrf_hash))error('Cookie xác thực thiếu hoặc không hợp lệ. Vui lòng đăng nhập lại.',401);
    const now=Date.now(),expires=now+sessionSeconds*1000;
    if(expires-user.expires_at>=86400000){
      const renewed=await query(env.DB,'UPDATE sessions SET expires_at=MAX(expires_at,?) WHERE id=? AND expires_at>? RETURNING expires_at',expires,user.session_id,now).first();
      if(!renewed)error('Phiên đã bị thu hồi. Vui lòng đăng nhập lại.',401);
      headers.append('Set-Cookie',sessionCookie(env,name,values[name],sessionSeconds));
      headers.append('Set-Cookie',sessionCookie(env,csrfName,csrf,sessionSeconds));
      const room=env.ROOM.get(env.ROOM.idFromName('school'));
      try { await room.fetch('https://internal/renew',{method:'POST',body:JSON.stringify({sessionId:user.session_id,expires:renewed.expires_at})}); } catch {}
    }
    return json({profile:publicUser(user),csrf},200,headers);
  }
  if(path==='/api/auth/logout'&&method==='POST') {
    await env.DB.batch([endHistory(env.DB,'session_id',user.session_id,'logout'),query(env.DB,'DELETE FROM sessions WHERE id=?',user.session_id)]);await publish(env,{kind:'session',revokeSession:user.session_id});
    const h=new Headers();for(const name of names(env))h.append('Set-Cookie',sessionCookie(env,name,'',0));return json({success:true},200,h);
  }
  if(path==='/api/ws'&&method==='GET') {
    if(request.headers.get('Upgrade')!=='websocket')error('Cần WebSocket.',426);
    const headers=new Headers(request.headers);headers.set('X-Session-Id',user.session_id);headers.set('X-User-Id',user.id);headers.set('X-Expires',String(user.expires_at));
    return env.ROOM.get(env.ROOM.idFromName('school')).fetch(new Request('https://internal/connect',{headers}));
  }
  if(path.startsWith('/api/accounts')) return accountRoute(request,env,path,user);
  if(path==='/api/personnel/delete-all/check'&&method==='GET'){
    admin(user);const state=await snapshot(env.DB);
    const links={assignments:state.data.shifts.reduce((n,s)=>n+['teacher1Id','teacher2Id','adminId','guardId'].filter(k=>s[k]).length,0),leaves:state.data.unavailableDates.length,requests:state.data.requests.length};
    return json({revision:state.revision,count:state.data.employees.length,links,canDelete:!Object.values(links).some(Boolean)});
  }
  if(path==='/api/personnel/delete-all'&&method==='POST'){
    admin(user);const input=await body(request,20000),state=await snapshot(env.DB);
    if(input.confirm!=='XOA TAT CA NHAN SU')error('Nhập đúng XOA TAT CA NHAN SU để xác nhận.');
    if(input.expectedRevision!==state.revision)error('Dữ liệu vừa thay đổi. Đóng hộp xóa rồi mở lại để kiểm tra.',409);
    if(!state.data.employees.length)error('Danh sách nhân sự đã trống.');
    const linked=state.data.shifts.some(s=>s.teacher1Id||s.teacher2Id||s.adminId||s.guardId)||state.data.unavailableDates.length||state.data.requests.length;
    if(linked&&input.deleteRelated!==true)error('Cần chọn xóa cả phân công, đơn nghỉ phép và đề nghị đổi ca liên quan để tiếp tục.',409);
    const backup=await createBackup(env);
    const sql=[];
    if(input.deleteRelated===true){
      sql.push(query(env.DB,'DELETE FROM shift_change_requests'),query(env.DB,'DELETE FROM unavailable_dates'),query(env.DB,'DELETE FROM shift_assignments'),query(env.DB,"UPDATE shifts SET payload=json_set(payload,'$.status','INCOMPLETE')"));
    }
    sql.push(query(env.DB,'UPDATE users SET employee_id=NULL WHERE employee_id IS NOT NULL'),query(env.DB,'DELETE FROM employees'),query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),null,`${user.display_name} đã xóa danh sách nhân sự${input.deleteRelated===true?' và các phân công, đơn nghỉ, đề nghị đổi ca liên quan':''}. Tài khoản Google được giữ.`,nowISO()));
    const revision=await commit(env.DB,state.revision,sql,user.id,'PERSONNEL_DELETE_ALL',{count:state.data.employees.length,deleteRelated:input.deleteRelated===true,before:state.data,safetyBackup:backup.objectKey});
    await publish(env,{revision,kind:'personnel'});return json({success:true,count:state.data.employees.length,safetyBackup:backup.objectKey});
  }

  if(path==='/api/leaves'&&method==='GET') {
    const [accounts,personnel,senders]=await env.DB.batch([
      query(env.DB,`SELECT l.*,u.display_name,e.name,e.role FROM account_leave_requests l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN employees e ON e.id=u.employee_id`),
      query(env.DB,'SELECT l.*,e.name,e.role FROM unavailable_dates l LEFT JOIN employees e ON e.id=l.employee_id'),
      query(env.DB,"SELECT json_extract(a.payload,'$.leave.id') AS leave_id,u.display_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.operation IN ('LEAVE_REQUEST','ACCOUNT_LEAVE_REQUEST') ORDER BY a.revision"),
    ]);
    const senderNames=new Map(senders.results.map(r=>[r.leave_id,r.display_name]));
    function view(row,accountRequest){
      const leave=JSON.parse(row.payload);
      return {id:row.id,date:row.date,status:row.status,reason:leave.reason,employeeId:row.employee_id||'',
        displayName:row.name||leave.displayName||row.display_name||null,employeeRole:row.role||null,
        submittedByName:leave.submittedByName||senderNames.get(row.id)||(accountRequest?leave.displayName:null),
        accountRequest,canWithdraw:row.status==='PENDING'&&(accountRequest?row.user_id===user.id:row.employee_id===user.employee_id)};
    }
    return json([...accounts.results.map(row=>view(row,true)),...personnel.results.map(row=>view(row,false))].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)));

  }
  if(path==='/api/leaves/respond'&&method==='POST') {
    admin(user);const input=await body(request,20000),state=await snapshot(env.DB);
    if(!['APPROVED','REJECTED'].includes(input.status))error('Trạng thái không hợp lệ.');
    const row=await query(env.DB,'SELECT * FROM account_leave_requests WHERE id=?',id(input.id)).first();
    if(!row||row.status!=='PENDING')error('Đơn đã xử lý hoặc không tồn tại.',409);
    const leave={...JSON.parse(row.payload),status:input.status};
    const revision=await commit(env.DB,state.revision,[query(env.DB,'UPDATE account_leave_requests SET status=?,payload=? WHERE id=?',leave.status,JSON.stringify(leave),row.id),query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),row.user_id,`Đơn nghỉ ngày ${leave.date}: ${leave.status==='APPROVED'?'đã duyệt':'từ chối'}.`,nowISO())],user.id,'ACCOUNT_LEAVE_REVIEW',{leave});
    await publish(env,{revision,kind:'leave'});return json({success:true});
  }
  if(path==='/api/leaves'&&method==='POST') {
    await rateLimit(env,`leave:${user.id}`,20);
    const input=await body(request,20000),state=await snapshot(env.DB);
    const personal=(await query(env.DB,'SELECT payload FROM account_leave_requests WHERE user_id=?',user.id).all()).results.map(r=>JSON.parse(r.payload));
    const meta={id:randomUUID(),createdAt:nowISO()};
    const leave=user.employee_id?employeeLeave(user,input,state.data.employees,[...state.data.unavailableDates,...personal.map(l=>({...l,employeeId:user.employee_id}))],meta):accountLeave(user,input,personal,meta);
    if(!user.employee_id){
      const revision=await commit(env.DB,state.revision,[query(env.DB,'INSERT INTO account_leave_requests VALUES (?,?,?,?,?,?)',leave.id,user.id,leave.date,leave.status,JSON.stringify(leave),leave.createdAt),query(env.DB,"INSERT INTO notifications(id,user_id,message,created_at) SELECT ?||id,id,?,? FROM users WHERE role='ADMIN' AND active=1",`${leave.id}:`,`${user.display_name} gửi đơn nghỉ ngày ${leave.date}.`,leave.createdAt)],user.id,'ACCOUNT_LEAVE_REQUEST',{leave});
      await publish(env,{revision,kind:'leave'});return json({success:true,leave});
    }
    const revision=await commit(env.DB,state.revision,[
      query(env.DB,'INSERT INTO unavailable_dates VALUES (?,?,?,?,?)',leave.id,leave.employeeId,leave.date,leave.status,JSON.stringify(leave)),
      query(env.DB,"INSERT INTO notifications(id,user_id,message,created_at) SELECT ?||id,id,?,? FROM users WHERE role='ADMIN' AND active=1",`${leave.id}:`,`${user.display_name} gửi đơn lịch bận/nghỉ phép ngày ${leave.date}.`,leave.createdAt),
    ],user.id,'LEAVE_REQUEST',{leave});
    await publish(env,{revision,kind:'leave'});return json({success:true,leave});
  }
  if(path==='/api/leaves/withdraw'&&method==='POST') {
    const input=await body(request,20000),state=await snapshot(env.DB);
    const personal=await query(env.DB,'SELECT * FROM account_leave_requests WHERE id=?',id(input.id)).first();
    if(personal){
      if(!canWithdrawAccountLeave(user,personal))error('Chỉ được rút đơn của mình khi đang chờ duyệt.',403);
      const revision=await commit(env.DB,state.revision,[query(env.DB,'DELETE FROM account_leave_requests WHERE id=?',personal.id)],user.id,'ACCOUNT_LEAVE_WITHDRAW',{id:personal.id});
      await publish(env,{revision,kind:'leave'});return json({success:true});
    }
    const leave=state.data.unavailableDates.find(l=>l.id===input.id);
    if(!canWithdrawLeave(user,leave))error('Chỉ được rút đơn của mình khi đang chờ duyệt.',403);
    const revision=await commit(env.DB,state.revision,[query(env.DB,'DELETE FROM unavailable_dates WHERE id=?',leave.id)],user.id,'LEAVE_WITHDRAW',{leave});
    await publish(env,{revision,kind:'leave'});return json({success:true});
  }
  if(path==='/api/state'&&method==='GET') {
    const latest=await query(env.DB,'SELECT revision FROM app_meta WHERE id=1').first();
    if(url.searchParams.get('since')===String(latest.revision)){const notices=await query(env.DB,'SELECT id,message,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id IS NULL OR user_id=? ORDER BY created_at DESC LIMIT 30',user.id).all();return json({unchanged:true,revision:latest.revision,profile:publicUser(user),notifications:notices.results});}
    const state=await snapshot(env.DB);
    const notices=await query(env.DB,'SELECT id,message,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id IS NULL OR user_id=? ORDER BY created_at DESC LIMIT 30',user.id).all();
    return json({...state,profile:publicUser(user),notifications:notices.results});
  }
  if(path==='/api/state'&&method==='PUT') {
    admin(user);const data=await body(request),state=await snapshot(env.DB);
    if(state.revision!==data.expectedRevision)error('Lịch đã thay đổi. Tải lại rồi thực hiện lại.',409);
    let next=validateData(data.data),automatic=null;
    const priorLeaves=new Map(state.data.unavailableDates.map(l=>[l.id,l]));
    next.unavailableDates=next.unavailableDates.map(l=>({...l,submittedByName:priorLeaves.has(l.id)?priorLeaves.get(l.id).submittedByName:user.display_name}));
    if(staffingChanged(state.data.employees,next.employees)){
      const result=balanceRoster(next);next=validateData(result.data);
      const at=nowISO();
      next.history=[...result.changes.map(change=>({...change,id:randomUUID(),reason:'Tự động điền vị trí trống và cân bằng ca khi bổ sung nhân sự',changedBy:user.display_name,timestamp:at})),...next.history];
      automatic={filled:result.filled,rebalanced:result.rebalanced,missing:result.missing,noSchedule:!next.shifts.some(s=>s.date>=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}))};
    }
    const statements=dataStatements(env.DB,state.data,next);
    if(automatic)statements.push(query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),null,`Đã tự động bổ sung ${automatic.filled} vị trí, cân bằng ${automatic.rebalanced} ca. ${automatic.noSchedule?'Chưa có lịch tháng để phân bổ.':automatic.missing?`Còn ${automatic.missing} vị trí chưa có người đủ điều kiện.`:'Lịch tương lai đã đủ người.'}`,nowISO()));
    const revision=await commit(env.DB,state.revision,statements,user.id,'ADMIN_SAVE',{before:state.data,after:next,automatic});
    await publish(env,{revision,kind:'schedule'});return json({revision,automatic});
  }
  if(path==='/api/swaps'&&method==='GET') return json((await snapshot(env.DB)).data.requests);
  if(path==='/api/swaps'&&method==='POST') {
    const data=await body(request,20000),state=await snapshot(env.DB);
    if(!user.employee_id)error('Tài khoản chưa được liên kết với hồ sơ nhân sự.');
    const r={requesterId:user.employee_id,targetEmployeeId:id(data.targetEmployeeId),shiftDate:data.shiftDate,targetShiftDate:data.targetShiftDate||null,reason:String(data.reason||'').trim()};
    if(!r.reason||r.reason.length>1000)error('Lý do cần từ 1 đến 1000 ký tự.');
    applySwap(state.data,r);
    const target=await query(env.DB,'SELECT id FROM users WHERE employee_id=? AND active=1',r.targetEmployeeId).first();if(!target)error('Người nhận chưa có tài khoản hoạt động.');
    const requestId=randomUUID(),at=nowISO();
    const noticeMsg=`${user.display_name} đề nghị đổi ca ngày ${r.shiftDate}${r.targetShiftDate ? ` lấy ca ngày ${r.targetShiftDate} của bạn` : ''}.`;
    const revision=await commit(env.DB,state.revision,[query(env.DB,"INSERT INTO shift_change_requests (id,requester_id,target_id,source_date,target_date,reason,status,requested_by,created_at) VALUES (?,?,?,?,?,?,'PENDING',?,?)",requestId,r.requesterId,r.targetEmployeeId,r.shiftDate,r.targetShiftDate,r.reason,user.id,at),query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),target.id,noticeMsg,at)],user.id,'SWAP_REQUEST',{requestId});
    await publish(env,{revision,kind:'swap'});return json({id:requestId});
  }
  if(path==='/api/swaps/respond'&&method==='POST') {
    const data=await body(request,20000),state=await snapshot(env.DB);
    const raw=await query(env.DB,'SELECT * FROM shift_change_requests WHERE id=?',id(data.requestId)).first();
    if(!raw||(raw.target_id!==user.employee_id&&user.role!=='ADMIN'))error('Chỉ người nhận hoặc Admin được xử lý đề nghị.',403);
    if(raw.status!=='PENDING')error('Đề nghị đã được xử lý.',409);
    if(typeof data.accept!=='boolean')error('Thiếu quyết định.');
    const at=nowISO(),sql=[],r=requestView(raw);let before=null,after=null;
    const requesterUser=await query(env.DB,'SELECT id,active FROM users WHERE employee_id=? AND active=1',r.requesterId).first();
    if(!requesterUser)error('Tài khoản người gửi không còn hoạt động.');
    const recipientUser=await query(env.DB,'SELECT id,active FROM users WHERE employee_id=? AND active=1',r.targetEmployeeId).first();
    if(!recipientUser)error('Tài khoản người nhận không còn hoạt động.');
    let result=null;
    if(data.accept) {
      result=applySwap(state.data,r);
      before=state.data.shifts.filter(s=>s.date===r.shiftDate||s.date===r.targetShiftDate);after=result.data.shifts.filter(s=>s.date===r.shiftDate||s.date===r.targetShiftDate);
      for(const s of after) sql.push(...shiftStatements(env.DB,s));
      const history=(day,pos,prev,next,suffix)=>({id:`swap-${raw.id}-${suffix}`,shiftDate:day,rolePosition:pos.replace('Id',''),previousEmployeeId:prev,newEmployeeId:next,reason:r.reason,changedBy:user.display_name,timestamp:at});
      const records=[history(r.shiftDate,result.sourcePosition,r.requesterId,r.targetEmployeeId,'a')];
      if(r.targetShiftDate)records.push(history(r.targetShiftDate,result.targetPosition,r.targetEmployeeId,r.requesterId,'b'));
      else {const debt={id:`swap-${raw.id}`,debtorEmployeeId:r.requesterId,creditorEmployeeId:r.targetEmployeeId,originalShiftDate:r.shiftDate,reason:r.reason,sourceType:'SHIFT_SWAP',status:'PENDING',createdAt:at};sql.push(query(env.DB,'INSERT INTO compensatory_duties VALUES (?,?)',debt.id,JSON.stringify(debt)));}
      for(const h of records)sql.push(query(env.DB,'INSERT INTO shift_history VALUES (?,?)',h.id,JSON.stringify(h)));
    }
    sql.push(query(env.DB,'UPDATE shift_change_requests SET status=?,responded_by=?,responded_at=?,before_json=?,after_json=? WHERE id=?',data.accept?'APPROVED':'REJECTED',user.id,at,before?JSON.stringify(before):null,after?JSON.stringify(after):null,raw.id));
    const publicMsg=data.accept?`${user.display_name} đã xác nhận đổi ca ngày ${r.shiftDate}${r.targetShiftDate ? ` lấy ca ngày ${r.targetShiftDate}` : ''}. Lịch tháng đã cập nhật.`:`${user.display_name} đã từ chối đề nghị đổi ca ngày ${r.shiftDate}.`;
    sql.push(query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),null,publicMsg,at));
    if(requesterUser?.id) {
      const reqMsg=data.accept?`Đề nghị đổi ca ngày ${r.shiftDate}${r.targetShiftDate ? ` với ca ngày ${r.targetShiftDate}` : ''} đã được ${user.display_name} đồng ý. Lịch trực tháng đã được cập nhật.`:`Đề nghị đổi ca ngày ${r.shiftDate}${r.targetShiftDate ? ` với ca ngày ${r.targetShiftDate}` : ''} đã bị ${user.display_name} từ chối.`;
      sql.push(query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),requesterUser.id,reqMsg,at));
    }
    if(recipientUser?.id&&recipientUser.id!==requesterUser?.id) {
      const recMsg=data.accept?`Bạn đã đồng ý đổi ca ngày ${r.shiftDate}${r.targetShiftDate ? ` lấy ca ngày ${r.targetShiftDate}` : ''}. Lịch trực tháng đã được cập nhật.`:`Bạn đã từ chối đề nghị đổi ca ngày ${r.shiftDate}.`;
      sql.push(query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),recipientUser.id,recMsg,at));
    }
    const revision=await commit(env.DB,state.revision,sql,user.id,data.accept?'SWAP_ACCEPT':'SWAP_REJECT',{requestId:raw.id,before,after});
    await publish(env,{revision,kind:'swap'});return json({success:true});
  }
  if(path==='/api/backups/config'&&method==='GET'){admin(user);return json({storage:env.BACKUPS?'R2':'D1',warning:env.BACKUPS?null:'Chưa cấu hình R2. Bản sao lưu mới đang lưu trong D1 fallback.'});}
  if(path==='/api/backups'&&method==='GET') {admin(user);return json((await query(env.DB,'SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 60').all()).results);}
  if(path==='/api/backups'&&method==='POST') {admin(user);return json(await createBackup(env));}
  if(path==='/api/backups/download'&&method==='GET') {
    admin(user);const row=await query(env.DB,"SELECT object_key FROM backup_logs WHERE id=? AND status='SUCCESS'",url.searchParams.get('id')).first();if(!row)error('Không tìm thấy bản sao lưu.',404);
    const object=await backupStorage(env).get(row.object_key);if(!object)error('Bản sao lưu đã hết hạn.',404);
    return new Response(object.body,{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="${row.object_key}"`,'Cache-Control':'no-store'}});
  }
  if(path==='/api/backups/restore'&&method==='POST') {
    admin(user);const data=await body(request);
    if(data.confirm!=='KHOI PHUC')error('Cần xác nhận khôi phục.');
    const result=await restoreBackup(env,data.backup,user.id);await publish(env,{kind:'restore',revokeAll:true});return json(result);
  }
  error('Không tìm thấy chức năng.',404);
}
export default {
  async fetch(request,env,ctx) {
    try {
      const response=await route(request,env,ctx);
      if(response.status===101)return response;
      const headers=new Headers(response.headers);
      const reqOrigin=request.headers.get('Origin');
      if(isAllowedOrigin(reqOrigin, env)) {headers.set('Access-Control-Allow-Origin',reqOrigin);headers.set('Access-Control-Allow-Credentials','true');headers.set('Access-Control-Allow-Headers','Content-Type,X-CSRF-Token,X-Bootstrap-Token');headers.set('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');headers.set('Vary','Origin');}
      return new Response(response.body,{status:response.status,headers});
    } catch(e) {
      const status=e.status|| (String(e.message).includes('FOREIGN KEY')?409:400);
      const message=String(e.message).includes('FOREIGN KEY')?'Nhân sự đang có lịch, tài khoản hoặc lịch sử. Hãy ngừng hoạt động thay vì xóa.':status===400&&String(e.message).includes('D1_')?'Dữ liệu không hợp lệ hoặc cơ sở dữ liệu chưa được cấu hình.':e.message;
      return json({error:message},status);
    }
  },
  async scheduled(_controller,env,ctx) {
    ctx.waitUntil((async()=>{
      try {await pruneOldData(env);} catch(e) {console.error('Scheduled prune failed',e);}
      try {await createBackup(env);} catch(e) {await query(env.DB,'INSERT INTO notifications VALUES (?,?,?,?,NULL)',randomUUID(),null,'Sao lưu tự động thất bại. Admin cần kiểm tra cấu hình và nhật ký.',nowISO()).run();console.error('Scheduled backup failed');}
      await expireHistory(env.DB);
      await env.DB.batch([query(env.DB,'DELETE FROM sessions WHERE expires_at<?',Date.now()),query(env.DB,'DELETE FROM login_limits WHERE reset_at<?',Date.now()),query(env.DB,'DELETE FROM used_google_nonces WHERE expires_at<?',Date.now())]);
      await publish(env,{kind:'backup'});
    })());
  },
};
