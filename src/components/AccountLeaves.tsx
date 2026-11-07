import React,{useEffect,useRef,useState} from 'react';
import {api} from '../services/api';
import {storageEvents,StorageService} from '../services/storage';
import {vnDay} from '../services/schoolTime';
import {UnavailableDatesView,type LeaveRow} from './UnavailableDatesView';
import type {Employee,ShiftAssignment,LeaveStatus,UnavailableDate} from '../types';
type Props={admin?:boolean;employees?:Employee[];shifts?:ShiftAssignment[];employeeId?:string|null;onAddLeave?:(leave:UnavailableDate)=>void;onReview?:(id:string,status:LeaveStatus)=>void;onDelete?:(id:string)=>void};
export function AccountLeaves({admin=false,employees=[],shifts=[],employeeId,onAddLeave,onReview,onDelete}:Props){
 const [rows,setRows]=useState<LeaveRow[]>([]),[date,setDate]=useState(vnDay),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const sequence=useRef(0);
 const load=async()=>{
   const request=++sequence.current;
   try{const result=await api<LeaveRow[]>('/leaves');if(request===sequence.current)setRows(result);}
   catch(e){if(request===sequence.current)setError((e as Error).message);}
 };
 useEffect(()=>{void load();const refresh=()=>{void load();};storageEvents.addEventListener('data',refresh);return()=>{sequence.current++;storageEvents.removeEventListener('data',refresh);};},[]);
 const run=async(path:string,data:unknown)=>{setBusy(true);setError('');setNotice('');try{await api(path,'POST',data);if(path==='/leaves')setReason('');setNotice('Đã lưu đơn nghỉ phép.');await load();await StorageService.refresh().catch(()=>setError('Đã lưu nhưng chưa tải được dữ liệu mới. Kiểm tra mạng rồi đồng bộ lại.'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section className="panel space-y-4"><h2 className="text-xl font-bold">Lịch bận & Nghỉ phép — Tất cả nhân sự</h2>
 <p className="text-sm text-slate-500">Mọi nhân sự đều xem được đơn của tất cả các ngày. Đơn chờ Admin duyệt.</p>
 {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status" className="text-emerald-700">{notice}</p>}
 {<form className="space-y-3" onSubmit={e=>{e.preventDefault();void run('/leaves',{date,reason});}}><label className="block">Ngày bận / nghỉ<input className="field" type="date" required min={vnDay()} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="block">Lý do<textarea className="field" required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="action" disabled={busy}>{busy?'Đang gửi…':'Gửi đơn chờ duyệt'}</button></form>}
 <UnavailableDatesView unavailableDates={rows} employees={employees} shifts={shifts} currentEmployeeId={employeeId} currentUserRole={admin?'ADMIN':'TEACHER'} onAddLeave={admin?onAddLeave:undefined}
   onUpdateStatus={(id,status,accountRequest)=>{if(accountRequest)void run('/leaves/respond',{id,status});else onReview?.(id,status);}}
   onDeleteLeave={id=>{if(admin)onDelete?.(id);else void run('/leaves/withdraw',{id});}} />
 </section>;
}
