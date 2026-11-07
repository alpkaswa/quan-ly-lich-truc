import test from 'node:test';
import assert from 'node:assert/strict';
import {balanceRoster,staffingChanged} from '../shared/autoRoster.mjs';
const now=new Date('2030-01-01T08:00:00Z');
const person=(id,role)=>({id,code:id,name:id,role,isActive:true});
const fixture=()=>({employees:[person('a','TEACHER'),person('b','TEACHER'),person('c','TEACHER'),person('d','TEACHER'),person('m','ADMIN'),person('g','GUARD')],shifts:Array.from({length:12},(_,i)=>({id:'s'+i,date:new Date(Date.UTC(2030,0,3+i*2)).toISOString().slice(0,10),teacher1Id:'a',teacher2Id:'b',adminId:'m',guardId:'g',isLocked:false,status:'COMPLETE'})),unavailableDates:[],settings:{disallowConsecutiveDays:true}});
const count=(d,id)=>d.shifts.reduce((n,s)=>n+['teacher1Id','teacher2Id','adminId','guardId'].filter(f=>s[f]===id).length,0);
test('one new teacher receives a fair share of existing future shifts',()=>{
 const d=fixture();d.employees.push(person('new','TEACHER'));const result=balanceRoster(d,now);
 const totals=d.employees.filter(e=>e.role==='TEACHER').map(e=>count(result.data,e.id));assert.ok(Math.max(...totals)-Math.min(...totals)<=1);assert.ok(count(result.data,'new')>0);assert.equal(count(d,'new'),0);
});
test('batch of teachers, BGH and guards fills only corresponding positions and balances each group',()=>{
 const d=fixture();d.employees.push(person('m2','ADMIN'),person('m3','ADMIN'),person('g2','GUARD'),person('g3','GUARD'));
 d.shifts.forEach(s=>{s.adminId=null;s.guardId=null;s.teacher2Id=null;});const r=balanceRoster(d,now);
 assert.equal(r.missing,0);assert.equal(r.filled,36);
 for(const s of r.data.shifts){assert.equal(d.employees.find(e=>e.id===s.adminId).role,'ADMIN');assert.equal(d.employees.find(e=>e.id===s.guardId).role,'GUARD');assert.notEqual(s.teacher1Id,s.teacher2Id);}
 for(const role of ['TEACHER','ADMIN','GUARD']){const totals=d.employees.filter(e=>e.role===role).map(e=>count(r.data,e.id));assert.ok(Math.max(...totals)-Math.min(...totals)<=1);}
});
test('locked, past and occupied current-day assignments remain unchanged',()=>{
 const d=fixture();d.shifts[0].isLocked=true;d.shifts[1].date='2029-12-29';d.shifts[2].date='2030-01-01';const r=balanceRoster(d,now);
 for(const i of [0,1,2])assert.deepEqual(r.data.shifts[i],d.shifts[i]);
});
test('approved leave, adjacent duties, inactivity and missing profession prevent invalid fills',()=>{
 const d=fixture();d.employees=d.employees.filter(e=>e.role!=='GUARD');d.employees.find(e=>e.id==='c').isActive=false;
 d.shifts[0].teacher1Id=null;d.shifts[0].guardId=null;d.shifts[1].date='2030-01-04';d.unavailableDates=[{employeeId:'d',date:d.shifts[0].date,status:'APPROVED'}];
 const r=balanceRoster(d,now);assert.equal(r.data.shifts[0].teacher1Id,null);assert.equal(r.data.shifts[0].guardId,null);assert.ok(r.missing>=2);
});
test('automatic allocation is deterministic, idempotent and triggered by active staffing changes only',()=>{
 const d=fixture();const r=balanceRoster(d,now);assert.deepEqual(balanceRoster(d,now),r);assert.equal(balanceRoster(r.data,now).changes.length,0);
 assert.equal(staffingChanged(d.employees,d.employees.map(e=>({...e,name:'renamed'}))),false);assert.equal(staffingChanged(d.employees,[...d.employees,person('new','ADMIN')]),true);
});
