import {query,snapshot,commit} from './database.mjs';
// Email comes only from verified server-side Google identities, never request fields.
export async function recognizeEmployee(db,user){
 let employeeId=user.employee_id;
 if(!employeeId&&user.google_email){
  const matches=(await query(db,"SELECT id FROM employees WHERE active=1 AND lower(trim(json_extract(payload,'$.email')))=lower(?)",user.google_email).all()).results;
  if(matches.length!==1)return null;
  employeeId=matches[0].id;
 }
 if(!employeeId)return null;
 for(let attempt=0;attempt<3;attempt++){
  const owner=await query(db,'SELECT id FROM users WHERE employee_id=?',employeeId).first();
  if(owner&&owner.id!==user.id)return null;
  const leaves=(await query(db,'SELECT * FROM account_leave_requests WHERE user_id=?',user.id).all()).results;
  const current=await query(db,'SELECT employee_id FROM users WHERE id=?',user.id).first();
  if(current.employee_id&&!leaves.length){user.employee_id=current.employee_id;return null;}
  const state=await snapshot(db);
  const sql=[query(db,'UPDATE users SET employee_id=? WHERE id=?',employeeId,user.id)];
  for(const r of leaves){const leave={...JSON.parse(r.payload),employeeId};sql.push(query(db,'INSERT INTO unavailable_dates VALUES (?,?,?,?,?)',leave.id,employeeId,leave.date,leave.status,JSON.stringify(leave)));}
  sql.push(query(db,'DELETE FROM account_leave_requests WHERE user_id=?',user.id));
  try{
   const revision=await commit(db,state.revision,sql,user.id,'ACCOUNT_EMAIL_MATCH',{employeeId,migratedLeaves:leaves.length});
   user.employee_id=employeeId;return revision;
  }catch(e){if(e.status===409&&attempt<2)continue;throw e;}
 }
 return null;
}
