import {slots,schoolDay} from './domain.mjs';
export function staffingChanged(before,after){
 const old=new Map(before.map(e=>[e.id,e]));
 return after.some(e=>e.isActive&&(!old.has(e.id)||!old.get(e.id).isActive||old.get(e.id).role!==e.role));
}
// Deterministic local improvements; retain coverage and obey hard constraints.
export function balanceRoster(input,now=new Date()){
 const data=structuredClone(input),today=schoolDay(now),fields=Object.keys(slots);
 const shifts=[...data.shifts].sort((a,b)=>a.date.localeCompare(b.date));
 const active=data.employees.filter(e=>e.isActive).sort((a,b)=>a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
 const people=new Map(active.map(e=>[e.id,e]));
 const byDay=new Map(shifts.map(s=>[Date.parse(s.date),s]));
 const unavailable=new Set(data.unavailableDates.filter(l=>l.status==='APPROVED').map(l=>l.employeeId+'|'+l.date));
 const counts=new Map(active.map(e=>[e.id,0]));
 for(const s of shifts.filter(s=>s.date>=today))for(const f of fields)if(counts.has(s[f]))counts.set(s[f],counts.get(s[f])+1);
 const canAssign=(s,f,e)=>{
  if(e.role!==slots[f]||unavailable.has(e.id+'|'+s.date)||fields.some(k=>k!==f&&s[k]===e.id))return false;
  return !data.settings.disallowConsecutiveDays||![-86400000,86400000].some(offset=>{const t=byDay.get(Date.parse(s.date)+offset);return t&&fields.some(k=>t[k]===e.id);});
 };
 const candidates=role=>active.filter(e=>e.role===role).sort((a,b)=>counts.get(a.id)-counts.get(b.id)||a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
 for(const s of shifts){
  if(s.date<today||s.isLocked)continue;
  for(const f of fields){
   if(s[f])continue;
   const e=candidates(slots[f]).find(e=>canAssign(s,f,e));
   if(e){s[f]=e.id;counts.set(e.id,counts.get(e.id)+1);}
  }
 }
 // Each move strictly reduces the squared workload difference, so this terminates.
 let improved=true;
 while(improved){
  improved=false;
  for(const s of shifts){
   if(s.date<=today||s.isLocked)continue;
   for(const f of fields){
    const donor=people.get(s[f]);if(!donor)continue;
    const receiver=candidates(slots[f]).find(e=>counts.get(donor.id)-counts.get(e.id)>=2&&canAssign(s,f,e));
    if(receiver){s[f]=receiver.id;counts.set(donor.id,counts.get(donor.id)-1);counts.set(receiver.id,counts.get(receiver.id)+1);improved=true;}
   }
  }
 }
 const previous=new Map(input.shifts.map(s=>[s.id,s])),changes=[];
 let missing=0;
 for(const s of shifts){
  if(s.date<today||s.isLocked)continue;
  s.status=fields.every(f=>s[f])?'COMPLETE':'INCOMPLETE';
  for(const f of fields){
   if(!s[f])missing++;
   if(s[f]!==previous.get(s.id)?.[f])changes.push({shiftDate:s.date,rolePosition:f.replace('Id',''),previousEmployeeId:previous.get(s.id)?.[f]||'',newEmployeeId:s[f]||''});
  }
 }
 return {data,changes,filled:changes.filter(c=>!c.previousEmployeeId&&c.newEmployeeId).length,rebalanced:changes.filter(c=>c.previousEmployeeId&&c.newEmployeeId).length,missing};
}
