import { randomUUID } from 'node:crypto';
import { validateData } from '../shared/domain.mjs';
export const nowISO=()=>new Date().toISOString();
export const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
const parseRows=rows=>rows.map(row=>JSON.parse(row.payload));
export async function snapshot(db) {
  const tables=['app_meta','employees','shifts','shift_assignments','unavailable_dates','shift_history','compensatory_duties','shift_change_requests'];
  const rows=await db.batch(tables.map(t=>query(db,`SELECT * FROM ${t}`)));
  const [meta]=rows[0].results;
  const shifts=parseRows(rows[2].results).map(s=>({...s,teacher1Id:null,teacher2Id:null,adminId:null,guardId:null}));
  const map=new Map(shifts.map(s=>[s.id,s]));
  for(const a of rows[3].results) map.get(a.shift_id)[`${a.position}Id`]=a.employee_id;
  shifts.sort((a,b)=>a.date.localeCompare(b.date));
  return {revision:meta.revision,data:{settings:JSON.parse(meta.settings),employees:parseRows(rows[1].results),shifts,unavailableDates:parseRows(rows[4].results),history:parseRows(rows[5].results),compensatoryDuties:parseRows(rows[6].results),requests:rows[7].results.map(requestView)}};
}
export function requestView(r) {
  return {id:r.id,requesterId:r.requester_id,targetEmployeeId:r.target_id,shiftDate:r.source_date,targetShiftDate:r.target_date,reason:r.reason,status:r.status,createdAt:r.created_at,respondedAt:r.responded_at,before:r.before_json?JSON.parse(r.before_json):null,after:r.after_json?JSON.parse(r.after_json):null};
}
export async function commit(db, revision, statements, actor, operation, details={}) {
  const guard=randomUUID(), at=nowISO();
  const adminOperation=['ADMIN_SAVE','ACCOUNT_CREATE','ACCOUNT_LINK','PASSWORD_RESET','ACCOUNT_ACTIVE','ACCOUNT_ROLE','RESTORE','PERSONNEL_DELETE_ALL','ACCOUNT_LEAVE_REVIEW'].includes(operation);
  try {
    await db.batch([
      adminOperation?query(db,"INSERT INTO mutation_guard(id,expected_revision) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND role='ADMIN' AND active=1) THEN ? ELSE -1 END",guard,actor,revision):query(db,'INSERT INTO mutation_guard(id,expected_revision) VALUES (?,?)',guard,revision),
      ...statements,
      query(db,'UPDATE app_meta SET revision=revision+1 WHERE id=1'),
      query(db,'INSERT INTO audit_logs VALUES (?,?,?,?,?,?)',randomUUID(),actor,operation,revision+1,at,JSON.stringify(details)),
      query(db,'DELETE FROM mutation_guard WHERE id=?',guard),
    ]);
  } catch(e) {
    if(String(e.message).includes('REVISION_CONFLICT')) { const error=new Error('Dữ liệu vừa được người khác cập nhật. Đã tải lại lịch; hãy kiểm tra và thử lại.'); error.status=409; throw error; }
    if(String(e.message).includes('UNIQUE constraint')) { const error=new Error('Bản ghi hoặc đề nghị chờ xử lý đã tồn tại.'); error.status=409; throw error; }
    throw e;
  }
  return revision+1;
}
export function shiftStatements(db,s) {
  const payload={...s}; for(const key of ['teacher1Id','teacher2Id','adminId','guardId']) delete payload[key];
  return [
    query(db,'INSERT INTO shifts(id,date,locked,payload) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,locked=excluded.locked,payload=excluded.payload',s.id,s.date,s.isLocked?1:0,JSON.stringify(payload)),
    query(db,'DELETE FROM shift_assignments WHERE shift_id=?',s.id),
    ...['teacher1','teacher2','admin','guard'].filter(pos=>s[`${pos}Id`]).map(pos=>query(db,'INSERT INTO shift_assignments VALUES (?,?,?,?)',`${s.id}:${pos}`,s.id,s[`${pos}Id`],pos)),
  ];
}
export function dataStatements(db,previous,raw) {
  const next=validateData(raw), sql=[];
  // Order preserves foreign keys, while allowing replacement of imported schedules.
  const nextEmployeeIds=new Set(next.employees.map(e=>e.id));
  for(const old of previous.shifts) if(!next.shifts.some(s=>s.id===old.id)) sql.push(query(db,'DELETE FROM shifts WHERE id=?',old.id));
  for(const e of next.employees) if(JSON.stringify(previous.employees.find(x=>x.id===e.id))!==JSON.stringify(e)) sql.push(query(db,'INSERT INTO employees VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,role=excluded.role,active=excluded.active,payload=excluded.payload',e.id,e.code,e.name,e.role,e.isActive?1:0,JSON.stringify(e)));
  const changedShifts=next.shifts.filter(s=>JSON.stringify(previous.shifts.find(x=>x.id===s.id))!==JSON.stringify(s));
  if(changedShifts.length){
    const encoded=JSON.stringify(changedShifts);
    sql.push(query(db,"INSERT INTO shifts(id,date,locked,payload) SELECT json_extract(value,'$.id'),json_extract(value,'$.date'),json_extract(value,'$.isLocked'),json_remove(value,'$.teacher1Id','$.teacher2Id','$.adminId','$.guardId') FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET date=excluded.date,locked=excluded.locked,payload=excluded.payload",encoded));
    sql.push(query(db,"DELETE FROM shift_assignments WHERE shift_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))",encoded));
    const assignments=changedShifts.flatMap(s=>['teacher1','teacher2','admin','guard'].filter(pos=>s[pos+'Id']).map(pos=>({id:s.id+':'+pos,shiftId:s.id,employeeId:s[pos+'Id'],position:pos})));
    sql.push(query(db,"INSERT INTO shift_assignments SELECT json_extract(value,'$.id'),json_extract(value,'$.shiftId'),json_extract(value,'$.employeeId'),json_extract(value,'$.position') FROM json_each(?)",JSON.stringify(assignments)));
  }
  const mappings=[['unavailableDates','unavailable_dates'],['history','shift_history'],['compensatoryDuties','compensatory_duties']];
  for(const [key,table] of mappings) {
    for(const old of previous[key]) if(!next[key].some(x=>x.id===old.id)) sql.push(query(db,`DELETE FROM ${table} WHERE id=?`,old.id));
    const changed=next[key].filter(v=>JSON.stringify(previous[key].find(x=>x.id===v.id))!==JSON.stringify(v));
    if(changed.length){
      if(key==='unavailableDates')sql.push(query(db,"INSERT INTO unavailable_dates SELECT json_extract(value,'$.id'),json_extract(value,'$.employeeId'),json_extract(value,'$.date'),json_extract(value,'$.status'),value FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,date=excluded.date,status=excluded.status,payload=excluded.payload",JSON.stringify(changed)));
      else sql.push(query(db,`INSERT INTO ${table} SELECT json_extract(value,'$.id'),value FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,JSON.stringify(changed)));
    }
  }
  for(const old of previous.employees) if(!nextEmployeeIds.has(old.id)) sql.push(query(db,'DELETE FROM employees WHERE id=?',old.id));
  if(JSON.stringify(previous.settings)!==JSON.stringify(next.settings)) sql.push(query(db,'UPDATE app_meta SET settings=? WHERE id=1',JSON.stringify(next.settings)));
  if(sql.length>350) throw new Error('Lần lưu này quá lớn. Hãy nhập từng tháng hoặc chia nhỏ tệp nhân sự.');
  return sql;
}
