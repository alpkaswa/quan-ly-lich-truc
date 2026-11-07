import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let vite,Sidebar,UnavailableDatesView;
before(async()=>{vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});({Sidebar}=await vite.ssrLoadModule('/src/components/Sidebar.tsx'));({UnavailableDatesView}=await vite.ssrLoadModule('/src/components/UnavailableDatesView.tsx'));});
after(async()=>{await vite?.close();});
const render=(role,tab='swaps')=>renderToStaticMarkup(createElement(Sidebar,{currentTab:tab,onSelectTab:()=>{},currentUserRole:role,pendingLeavesCount:1,pendingCompensatoryCount:1,conflictsCount:0,schoolName:'Trường kiểm thử',onOpenSettings:()=>{}}));
const ids=html=>[...html.matchAll(/data-nav-id="([^"]+)"/g)].map(match=>match[1]);
test('Admin sees every function exactly once, including personnel and accounts',()=>{
  const expected=['dashboard','my-duties','schedule','lookup','swaps','leaves','statistics','export','auto-schedule','employees','compensatory','accounts','activity','system','backups','overview','tests'];
  for(const tab of ['swaps','employees','accounts','schedule']){
    const html=render('ADMIN',tab),actual=ids(html);
    assert.deepEqual(actual,expected);assert.equal(new Set(actual).size,actual.length);
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  }
});
test('Employees see the shared schedule and swaps without Admin management entries',()=>{
  assert.deepEqual(ids(render('TEACHER')),['dashboard','my-duties','schedule','lookup','swaps','leaves','statistics','export']);
});
test('Repeated rendering does not append or replace navigation items',()=>{
  const baseline=ids(render('ADMIN'));
  for(let i=0;i<20;i++)assert.deepEqual(ids(render('ADMIN')),baseline);
});

test('employee leave screen shows every employee request and hides approval controls',()=>{
 const html=renderToStaticMarkup(createElement(UnavailableDatesView,{currentUserRole:'TEACHER',currentEmployeeId:'me',employees:[{id:'me',name:'Người của tôi',code:'GV01',role:'TEACHER'},{id:'other',name:'Người khác',code:'GV02',role:'TEACHER'}],unavailableDates:[{id:'own',employeeId:'me',date:'2026-11-03',reason:'Đơn của tôi',status:'PENDING'},{id:'private',employeeId:'other',date:'2026-11-03',reason:'Nội dung người khác',status:'PENDING'}],onAddLeave:()=>{},onUpdateStatus:()=>{},onDeleteLeave:()=>{}}));
 assert.ok(html.includes('Đơn của tôi'));assert.ok(html.includes('Nội dung người khác'));assert.ok(html.includes('Đăng Ký Ngày Bận / Nghỉ Phép'));assert.ok(!html.includes('title="Phê duyệt đơn nghỉ'));assert.ok(html.includes('Rút đơn đang chờ duyệt'));
});
test('Google employee leave screen enables requests without Admin linking',async()=>{
 const {AccountLeaves}=await vite.ssrLoadModule('/src/components/AccountLeaves.tsx');
 const html=renderToStaticMarkup(createElement(AccountLeaves,{}));
 assert.ok(html.includes('Gửi đơn chờ duyệt'));assert.ok(!html.includes('disabled=""'));assert.ok(html.includes('Đơn chờ Admin duyệt'));
});

test('personal duty page shows correct dates positions and the four-person team',async()=>{
 const {MyDuties}=await vite.ssrLoadModule('/src/components/MyDuties.tsx');
 const html=renderToStaticMarkup(createElement(MyDuties,{personal:true,employeeId:'me',employees:[{id:'me',name:'Tên của tôi',code:'GV01'},{id:'other',name:'Tên đồng nghiệp',code:'GV02'}],shifts:[{id:'mine',date:'2030-01-05',teacher1Id:'me',teacher2Id:'other',adminId:null,guardId:null}]}));
 assert.ok(html.includes('Ca trực của tôi'));assert.ok(html.includes('05/01/2030'));assert.ok(html.includes('06/01/2030'));assert.ok(html.includes('Giáo viên 1'));assert.ok(html.includes('Tên đồng nghiệp'));
});
test('personal duty page never guesses personnel when verified profile is absent',async()=>{
 const {MyDuties}=await vite.ssrLoadModule('/src/components/MyDuties.tsx');
 const html=renderToStaticMarkup(createElement(MyDuties,{personal:true,employeeId:null,employees:[],shifts:[]}));
 assert.ok(html.includes('chưa xác định được ca trực cá nhân'));assert.ok(!html.includes('07:00'));
});

test('bulk personnel delete button is visible to Admin only and disabled on empty roster',async()=>{
 const {EmployeeManagementView}=await vite.ssrLoadModule('/src/components/EmployeeManagementView.tsx');
 const base={employees:[],shifts:[],onAddEmployee:()=>{},onUpdateEmployee:()=>{},onDeleteEmployee:()=>{},onImportEmployees:()=>{}};
 const admin=renderToStaticMarkup(createElement(EmployeeManagementView,{...base,currentUserRole:'ADMIN'}));
 const staff=renderToStaticMarkup(createElement(EmployeeManagementView,{...base,currentUserRole:'TEACHER'}));
 assert.ok(admin.includes('Xóa tất cả nhân sự'));assert.ok(!staff.includes('Xóa tất cả nhân sự'));assert.match(admin,/<button[^>]*disabled=""[^>]*>Xóa tất cả nhân sự/);
});


test('shared dashboard uses personnel records and restricts management actions',async()=>{
 const {DashboardView}=await vite.ssrLoadModule('/src/components/DashboardView.tsx');
 const {activeDutyDate}=await vite.ssrLoadModule('/src/services/schoolTime.ts');
 const date=activeDutyDate(new Date());
 const employees=['TEACHER','TEACHER','ADMIN','GUARD'].map((role,i)=>({id:`p${i}`,name:`Nhân sự thật ${i}`,code:`NS${i}`,role,department:`Bộ phận ${i}`,phone:`090000000${i}`,isActive:true}));
 const props={employees,shifts:[{id:'s',date,dayOfWeek:2,teacher1Id:'p0',teacher2Id:'p1',adminId:'p2',guardId:'p3',status:'COMPLETE'}],unavailableDates:[],changeRequests:[],onNavigateTab:()=>{},onOpenGmailNotice:()=>{},onQuickSwap:()=>{}};
 const staff=renderToStaticMarkup(createElement(DashboardView,props));
 const admin=renderToStaticMarkup(createElement(DashboardView,{...props,canManage:true}));
 for(const employee of employees){assert.ok(staff.includes(employee.name));assert.ok(staff.includes(employee.department));}
 assert.ok(staff.includes('CA ĐANG DIỄN RA'));assert.ok(staff.includes('Theo mục Nhân sự'));
 assert.ok(staff.includes('Đề nghị đổi ca'));assert.ok(!staff.includes('Tự Động Xếp Lịch'));assert.ok(!staff.includes('Gửi thông báo Gmail'));
 assert.ok(admin.includes('Tự Động Xếp Lịch'));assert.ok(admin.includes('Đổi nhân sự ca này'));assert.ok(admin.includes('Gửi thông báo Gmail'));
 assert.ok(!staff.includes('ĐÃ PHÁT TÍN HIỆU THỬ NGHIỆM'));
});


test('password login and account administration expose only the requested controls',async()=>{
 const {PasswordLogin}=await vite.ssrLoadModule('/src/components/PasswordAccess.tsx');
 const {AccountsView}=await vite.ssrLoadModule('/src/components/AccountsView.tsx');
 const login=renderToStaticMarkup(createElement(PasswordLogin,{onSuccess:()=>{}}));
 assert.ok(login.includes('Tên đăng nhập'));assert.ok(login.includes('type="password"'));assert.ok(!login.includes('Admin'));
 const accounts=renderToStaticMarkup(createElement(AccountsView,{employees:[]}));
 assert.ok(accounts.includes('Cấp tài khoản nhân sự'));assert.ok(accounts.includes('Lịch sử đăng nhập'));assert.ok(accounts.includes('Mật khẩu ban đầu là 1'));
});


test('Admin audit panel lists every Admin and preserves personal leave form',async()=>{
 const {AccountAudit}=await vite.ssrLoadModule('/src/components/AccountAudit.tsx');
 const {AccountLeaves}=await vite.ssrLoadModule('/src/components/AccountLeaves.tsx');
 const html=renderToStaticMarkup(createElement(AccountAudit,{profiles:[{id:'a',role:'ADMIN',displayName:'Admin thứ nhất',active:true,roleGrantedBy:'Người cấp quyền',roleGrantedAt:'2026-11-03T03:00:00Z'},{id:'b',role:'ADMIN',displayName:'Admin thứ hai',active:false},{id:'c',role:'EMPLOYEE',displayName:'Nhân viên thường'}]}));
 assert.ok(html.includes('Admin thứ nhất'));assert.ok(html.includes('Admin thứ hai'));assert.ok(!html.includes('Nhân viên thường'));assert.ok(html.includes('Người cấp quyền'));assert.ok(html.includes('Lịch sử thay đổi quyền'));assert.ok(!html.includes('Nhật ký hoạt động'));const {AuditList}=await vite.ssrLoadModule('/src/components/AccountAudit.tsx');assert.ok(renderToStaticMarkup(createElement(AuditList)).includes('Nhật ký hoạt động'));
 assert.ok(renderToStaticMarkup(createElement(AccountLeaves,{admin:true})).includes('Gửi đơn chờ duyệt'));
});
