import {query} from './database.mjs';
export function endHistory(db,where,value,reason,at=Date.now()){
 return query(db,`UPDATE login_history SET logout_at=?,logout_reason=?,duration_seconds=MAX(0,CAST((?-login_at)/1000 AS INTEGER)) WHERE logout_at IS NULL AND ${where}=?`,at,reason,at,value);
}
export async function expireHistory(db){
 await query(db,"UPDATE login_history SET logout_at=(SELECT expires_at FROM sessions WHERE sessions.id=login_history.session_id),logout_reason='expired',duration_seconds=MAX(0,CAST(((SELECT expires_at FROM sessions WHERE sessions.id=login_history.session_id)-login_at)/1000 AS INTEGER)) WHERE logout_at IS NULL AND session_id IN (SELECT id FROM sessions WHERE expires_at<=?)",Date.now()).run();
}
