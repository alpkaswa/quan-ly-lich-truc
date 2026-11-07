export const slots = { teacher1Id: 'TEACHER', teacher2Id: 'TEACHER', adminId: 'ADMIN', guardId: 'GUARD' };
export const settings = {
  schoolName: 'TRƯỜNG PHỔ THÔNG DÂN TỘC NỘI TRÚ NA RÌ', shiftDurationHours: 24,
  shiftStartTime: '07:00', shiftEndTime: '07:00 ngày hôm sau', requiredTeachers: 2, requiredAdmins: 1,
  requiredGuards: 1, disallowConsecutiveDays: true, respectApprovedUnavailabilities: true, fairDistribution: true,
};
export const dataKeys = ['employees','shifts','unavailableDates','history','compensatoryDuties'];
export const schoolDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const fail = message => { throw new Error(message); };
export function id(value) { if (typeof value !== 'string' || !value.length || value.length > 200 || value.includes('/') || value === '.' || value === '..') fail('Mã định danh không hợp lệ'); return value; }
export function date(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) fail('Ngày không hợp lệ'); return value; }
export function validateData(input) {
  const d = structuredClone(input);
  if (!d || typeof d !== 'object') fail('Dữ liệu không hợp lệ');
  for (const key of dataKeys) {
    if (!Array.isArray(d[key]) || d[key].length > 10000) fail(`Danh sách ${key} không hợp lệ`);
    const ids = new Set();
    for (const item of d[key]) { id(item.id); if (ids.has(item.id)) fail(`Trùng mã trong ${key}`); ids.add(item.id); }
  }
  if (!d.settings || d.settings.requiredTeachers !== 2 || d.settings.requiredAdmins !== 1 || d.settings.requiredGuards !== 1 || d.settings.shiftDurationHours !== 24 || d.settings.shiftStartTime !== '07:00' || !/^07:00/.test(d.settings.shiftEndTime)) fail('Ca trực phải có 2 giáo viên, 1 BGH, 1 bảo vệ và bắt đầu 07:00');
  const employees = new Map(), codes = new Set();
  for (const e of d.employees) {
    if (typeof e.name !== 'string' || !e.name.trim() || typeof e.code !== 'string' || !e.code.trim() || !['TEACHER','ADMIN','GUARD'].includes(e.role) || typeof e.isActive !== 'boolean') fail('Thông tin nhân sự không hợp lệ');
    const code = e.code.trim().toUpperCase(); if (codes.has(code)) fail('Trùng mã nhân sự'); codes.add(code); employees.set(e.id, e);
  }
  const dates = new Set();
  for (const shift of d.shifts) {
    date(shift.date); if (dates.has(shift.date)) fail('Trùng ngày trực'); dates.add(shift.date);
    if (shift.startTime !== '07:00' || !/^07:00/.test(shift.endTime)) fail('Giờ trực không đúng quy định');
    if (typeof shift.isLocked !== 'boolean') fail('Thiếu trạng thái khóa ca');
    const assigned = new Set();
    for (const [field, role] of Object.entries(slots)) {
      const person = shift[field];
      if (person == null) { shift[field] = null; continue; }
      if (assigned.has(person)) fail('Một người không thể giữ hai vị trí trong cùng ca'); assigned.add(person);
      const employee = employees.get(person);
      // Past assignments are retained when an employee later leaves the school.
      if (!employee || employee.role !== role || (!employee.isActive && shift.date >= schoolDay())) fail('Nhân sự không đúng chức danh hoặc đã ngừng hoạt động');
    }
    shift.status = assigned.size === 4 ? 'COMPLETE' : 'INCOMPLETE';
  }
  for (const leave of d.unavailableDates) { date(leave.date); if (!employees.has(leave.employeeId) || !['PENDING','APPROVED','REJECTED'].includes(leave.status)) fail('Ngày nghỉ không hợp lệ'); }
  return d;
}
const position = (shift, employee) => Object.keys(slots).find(key => shift?.[key] === employee);
export function applySwap(input, request, now = new Date()) {
  const d = structuredClone(input);
  const { requesterId: a, targetEmployeeId: b, shiftDate: source, targetShiftDate: other } = request;
  id(a); id(b); date(source); if (other) date(other);
  if (a === b || source === other || source < schoolDay(now) || (other && other < schoolDay(now))) fail('Ngày hoặc người đổi ca không hợp lệ');
  const ea = d.employees.find(e => e.id === a), eb = d.employees.find(e => e.id === b);
  if (!ea?.isActive || !eb?.isActive || ea.role !== eb.role) fail('Hai người phải đang hoạt động và cùng nhóm chức danh');
  const s = d.shifts.find(s => s.date === source), t = other ? d.shifts.find(s => s.date === other) : null;
  const ka = position(s, a), kb = position(t, b);
  if (!s || !ka || s.isLocked) fail('Người gửi không trực ngày này hoặc ca đang khóa');
  if (position(s, b)) fail('Người nhận đã có ca trực cùng ngày');
  if (other && (!t || !kb || t.isLocked || position(t, a))) fail('Ca đối ứng không còn hợp lệ hoặc người gửi bị trùng ca');
  s[ka] = b; if (t) t[kb] = a;
  for (const [person, day] of [[b, source], ...(other ? [[a, other]] : [])]) {
    if (d.unavailableDates.some(l => l.employeeId === person && l.date === day && l.status === 'APPROVED')) fail('Nhân sự đã được duyệt nghỉ ngày này');
    if (d.settings.disallowConsecutiveDays && d.shifts.some(x => Math.abs(Date.parse(x.date) - Date.parse(day)) === 86400000 && position(x, person))) fail('Đổi ca vi phạm thời gian nghỉ tối thiểu 24 giờ');
  }
  validateData(d);
  return { data: d, sourcePosition: ka, targetPosition: kb, requesterName: ea.name, targetName: eb.name };
}
