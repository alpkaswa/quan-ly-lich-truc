import type {Employee,ShiftAssignment} from '../types';
export const dutyPositions=[['teacher1Id','Giáo viên 1'],['teacher2Id','Giáo viên 2'],['adminId','Ban giám hiệu'],['guardId','Bảo vệ']] as const;
export const normalizeSearch=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
export function findDutyEmployees(employees:Employee[],query:string){const q=normalizeSearch(query);return employees.filter(e=>normalizeSearch([e.name,e.code,e.phone||''].join(' ')).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'vi')||a.code.localeCompare(b.code));}
export function dutiesForEmployee(shifts:ShiftAssignment[],employeeId:string|null|undefined,{date='',fromDate=''}={}){
 if(!employeeId)return [];
 return shifts.filter(s=>(!date||s.date===date)&&(!fromDate||s.date>=fromDate)&&dutyPositions.some(([key])=>s[key]===employeeId)).sort((a,b)=>a.date.localeCompare(b.date)).map(shift=>({shift,positions:dutyPositions.filter(([key])=>shift[key]===employeeId).map(([,label])=>label)}));
}
