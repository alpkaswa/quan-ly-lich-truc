import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeLeave,canWithdrawLeave} from '../shared/leave.mjs';
const now=new Date('2026-11-02T08:00:00Z'),user={employee_id:'me'},employees=[{id:'me',isActive:true}],meta={id:'new-leave',createdAt:now.toISOString()};
test('employee leave is always own and pending, regardless of submitted privilege fields',()=>{
  const leave=employeeLeave(user,{date:'2026-11-03',reason:'  Có việc gia đình  ',employeeId:'another-person',status:'APPROVED'},employees,[],meta,now);
  assert.equal(leave.employeeId,'me');assert.equal(leave.status,'PENDING');assert.equal(leave.reason,'Có việc gia đình');assert.equal(leave.createdAt,meta.createdAt);
});
test('personnel leave validator requires an active recognized personnel record',()=>{
  const input={date:'2026-11-03',reason:'Bận'};
  assert.throws(()=>employeeLeave({employee_id:null},input,employees,[],meta,now),/liên kết/);
  assert.throws(()=>employeeLeave(user,input,[{id:'me',isActive:false}],[],meta,now),/liên kết/);
});
test('invalid dates, old dates and empty or excessive reasons are rejected',()=>{
  for(const input of [{date:'2026-02-30',reason:'Bận'},{date:'2026-11-01',reason:'Bận'},{date:'2026-11-03',reason:' '},{date:'2026-11-03',reason:'a'.repeat(1001)}])assert.throws(()=>employeeLeave(user,input,employees,[],meta,now));
});
test('duplicate pending or approved leave is rejected; rejected requests can be resubmitted',()=>{
  const input={date:'2026-11-03',reason:'Bận'};
  for(const status of ['PENDING','APPROVED'])assert.throws(()=>employeeLeave(user,input,employees,[{employeeId:'me',date:input.date,status}],meta,now),/đã có đơn/);
  assert.equal(employeeLeave(user,input,employees,[{employeeId:'me',date:input.date,status:'REJECTED'}],meta,now).status,'PENDING');
});
test('staff may only withdraw their own pending request',()=>{
  assert.equal(canWithdrawLeave(user,{employeeId:'me',status:'PENDING'}),true);
  assert.equal(canWithdrawLeave(user,{employeeId:'other',status:'PENDING'}),false);
  for(const status of ['APPROVED','REJECTED'])assert.equal(canWithdrawLeave(user,{employeeId:'me',status}),false);
});

import {accountLeave,canWithdrawAccountLeave} from '../shared/leave.mjs';
test('Google account without personnel can submit without claiming another identity',()=>{
 const result=accountLeave({id:'google-user',display_name:'Google User',google_email:'user@example.com'},{date:'2026-11-03',reason:'Bận',userId:'someone-else',status:'APPROVED'},[],meta,now);
 assert.equal(result.userId,'google-user');assert.equal(result.status,'PENDING');assert.equal(result.employeeId,undefined);
 assert.throws(()=>accountLeave({id:'google-user'},{date:'2026-11-03',reason:'Bận'},[result],meta,now),/đã có đơn/);
});
test('account leave withdrawal requires owner and pending status',()=>{
 assert.equal(canWithdrawAccountLeave({id:'me'},{user_id:'other',status:'PENDING'}),false);
 assert.equal(canWithdrawAccountLeave({id:'me'},{user_id:'me',status:'APPROVED'}),false);
 assert.equal(canWithdrawAccountLeave({id:'me'},{user_id:'me',status:'PENDING'}),true);
});


test('leave sender comes from the authenticated account, never the submitted form',()=>{
 const actor={id:'u1',employee_id:'me',display_name:'Người gửi thật'};
 const input={date:'2026-11-03',reason:'Bận',submittedByName:'Tên giả mạo'};
 assert.equal(employeeLeave(actor,input,employees,[],meta,now).submittedByName,'Người gửi thật');
 assert.equal(accountLeave(actor,input,[],meta,now).submittedByName,'Người gửi thật');
});
