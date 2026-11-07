import {date,schoolDay} from './domain.mjs';
export function employeeLeave(user,input,employees,leaves,{id,createdAt},now=new Date()){
  if(!user.employee_id||!employees.some(e=>e.id===user.employee_id&&e.isActive))throw new Error('Tài khoản chưa liên kết nhân sự đang hoạt động. Nhờ Admin liên kết trong mục Tài khoản.');
  const day=date(input.date);
  if(day<schoolDay(now))throw new Error('Ngày nghỉ không được ở trong quá khứ.');
  if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>1000)throw new Error('Lý do cần từ 1 đến 1000 ký tự.');
  if(leaves.some(l=>l.employeeId===user.employee_id&&l.date===day&&l.status!=='REJECTED'))throw new Error('Ngày này đã có đơn chờ duyệt hoặc đã được duyệt.');
  // Deliberately ignore employeeId/status/createdAt supplied by the browser.
  return {id,submittedByName:user.display_name,employeeId:user.employee_id,date:day,reason:input.reason.trim(),status:'PENDING',createdAt};
}
export function canWithdrawLeave(user,leave){return Boolean(leave&&leave.employeeId===user.employee_id&&leave.status==='PENDING');}

export function accountLeave(user,input,leaves,{id,createdAt},now=new Date()){
  if(!user.id)throw new Error('Cần đăng nhập.');
  const day=date(input.date);
  if(day<schoolDay(now))throw new Error('Ngày nghỉ không được ở trong quá khứ.');
  if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>1000)throw new Error('Lý do cần từ 1 đến 1000 ký tự.');
  if(leaves.some(l=>l.date===day&&l.status!=='REJECTED'))throw new Error('Ngày này đã có đơn chờ duyệt hoặc đã được duyệt.');
  return {id,submittedByName:user.display_name,userId:user.id,displayName:user.display_name,email:user.google_email,date:day,reason:input.reason.trim(),status:'PENDING',createdAt};
}
export function canWithdrawAccountLeave(user,leave){return Boolean(leave&&leave.user_id===user.id&&leave.status==='PENDING');}
