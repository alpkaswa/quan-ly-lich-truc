import test from 'node:test';
import assert from 'node:assert/strict';
import { applySwap, validateData, settings, schoolDay } from '../shared/domain.mjs';
// Unit-test fixtures only. These are never imported by the application or uploaded to production.
const now = new Date('2026-11-02T06:00:00Z');
function fixture() {
  const employees = [['a','TEACHER'],['b','TEACHER'],['c','TEACHER'],['d','TEACHER'],['m','ADMIN'],['g','GUARD']].map(([id,role]) => ({ id, code:id, name:`Test ${id}`, role, isActive:true }));
  const shift = (day, t1, t2) => ({ id:`s${day}`, date:`2026-11-${day}`, startTime:'07:00', endTime:'07:00 ngày hôm sau', teacher1Id:t1, teacher2Id:t2, adminId:'m', guardId:'g', status:'COMPLETE', isLocked:false });
  return { employees, shifts:[shift('05','a','c'),shift('09','b','d')], unavailableDates:[], history:[], compensatoryDuties:[], settings:{...settings}, requests:[] };
}
const proposal = () => ({ requesterId:'a', targetEmployeeId:'b', shiftDate:'2026-11-05', targetShiftDate:'2026-11-09', reason:'Unit test' });
test('swaps both assignments while preserving the four positions and original input', () => {
  const before = fixture(), result = applySwap(before,proposal(),now);
  assert.equal(result.data.shifts[0].teacher1Id,'b'); assert.equal(result.data.shifts[1].teacher1Id,'a');
  assert.equal(before.shifts[0].teacher1Id,'a'); assert.equal(result.data.shifts[0].adminId,'m');
});
test('covering one shift does not change another shift', () => {
  const r = {...proposal(), targetShiftDate:null}, result = applySwap(fixture(),r,now);
  assert.equal(result.data.shifts[0].teacher1Id,'b'); assert.equal(result.data.shifts[1].teacher1Id,'b');
});
test('stale concurrent proposal cannot replace an employee after acceptance', () => {
  const next = applySwap(fixture(),proposal(),now).data;
  assert.throws(() => applySwap(next,proposal(),now), /không trực/);
});
test('wrong profession is rejected', () => assert.throws(() => applySwap(fixture(),{...proposal(),targetEmployeeId:'g',targetShiftDate:null},now), /chức danh/));
test('same-day duplicate assignment is rejected', () => assert.throws(() => applySwap(fixture(),{...proposal(),targetEmployeeId:'c',targetShiftDate:null},now), /cùng ngày/));
test('locked source and target shifts are rejected', () => {
  for (const index of [0,1]) { const d=fixture(); d.shifts[index].isLocked=true; assert.throws(() => applySwap(d,proposal(),now), /khóa|hợp lệ/); }
});
test('approved absence is checked again on acceptance', () => {
  const d=fixture(); d.unavailableDates.push({id:'l',employeeId:'b',date:'2026-11-05',status:'APPROVED'});
  assert.throws(() => applySwap(d,proposal(),now), /nghỉ/);
});
test('adjacent-day rest conflict is rejected', () => {
  const d=fixture(); d.shifts[1].date='2026-11-06';
  assert.throws(() => applySwap(d,{...proposal(),targetShiftDate:null},now), /24 giờ/);
});
test('inactive employee and old dates are rejected', () => {
  const d=fixture(); d.employees[1].isActive=false; assert.throws(() => applySwap(d,proposal(),now), /hoạt động/);
  assert.throws(() => applySwap(fixture(),proposal(),new Date('2026-11-10')), /không hợp lệ/);
});
test('malformed dates, duplicate days, duplicate employee codes and wrong slots are rejected', () => {
  const d=fixture(); d.shifts[0].date='2026-02-30'; assert.throws(() => validateData(d), /Ngày/);
  const a=fixture(); a.shifts[1].date=a.shifts[0].date; assert.throws(() => validateData(a), /Trùng ngày/);
  const b=fixture(); b.employees[1].code='A'; assert.throws(() => validateData(b), /Trùng mã/);
  const c=fixture(); c.shifts[0].guardId='a'; assert.throws(() => validateData(c), /hai vị trí/);
});
test('incomplete schedules are visibly incomplete rather than fabricated', () => {
  const d=fixture(); d.shifts[0].teacher1Id=null;
  assert.equal(validateData(d).shifts[0].status,'INCOMPLETE');
});
test('school date uses Vietnam timezone across UTC day boundary', () => assert.equal(schoolDay(new Date('2026-11-01T18:00:00Z')),'2026-11-02'));
