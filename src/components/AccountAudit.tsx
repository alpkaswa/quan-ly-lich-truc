import React,{useEffect,useState} from 'react';
import {api,type Profile} from '../services/api';
import {storageEvents} from '../services/storage';
type Row={id:string;revision:number;created_at:string;actor_name:string|null;actor_id:string|null;operation:string;details:{actorName?:string;recipientName?:string;oldRole?:string;newRole?:string}};
type Page={items:Row[];nextBefore:number|null};
const time=(v:string)=>new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export function AuditList({roles=false}:{roles?:boolean}){
 const [page,setPage]=useState<Page>({items:[],nextBefore:null}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const path=roles?'/accounts/role-history':'/accounts/activity';
 const load=async(before?:number)=>{setBusy(true);setError('');try{const result=await api<Page>(path+(before?'?before='+before:''));setPage(previous=>({items:before?[...previous.items,...result.items.filter(row=>!previous.items.some(old=>old.id===row.id))]:result.items,nextBefore:result.nextBefore}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 useEffect(()=>{void load();const refresh=()=>void load();storageEvents.addEventListener('data',refresh);return()=>storageEvents.removeEventListener('data',refresh);},[path]);
 return <section className="panel space-y-3"><div className="flex flex-wrap gap-3 justify-between"><h2 className="font-bold">{roles?'Lịch sử thay đổi quyền':'Nhật ký hoạt động'}</h2><button className="action secondary" disabled={busy} onClick={()=>void load()}>Làm mới</button></div>{error&&<p role="alert" className="text-red-700">{error}</p>}{!busy&&!page.items.length&&<p>Chưa có bản ghi.</p>}{page.items.map(row=><article className="border-t pt-3 text-sm" key={row.id}><p className="font-semibold">{roles?`${row.details.recipientName||'Tài khoản'}: ${row.details.oldRole} → ${row.details.newRole}`:row.operation}</p><p>Người thực hiện: {row.details.actorName||row.actor_name||row.actor_id||'Hệ thống'} · {time(row.created_at)}</p></article>)}{page.nextBefore&&<button className="action secondary" disabled={busy} onClick={()=>void load(page.nextBefore!)}>Xem thêm</button>}</section>;
}
export function AccountAudit({profiles}:{profiles:Profile[]}){
 const admins=profiles.filter(p=>p.role==='ADMIN');
 return <><section className="panel space-y-3"><h2 className="font-bold">Danh sách Admin hiện tại ({admins.length})</h2>{admins.map(p=><article key={p.id} className="border-t pt-2 text-sm"><strong>{p.displayName}</strong> · ADMIN · {p.active?'Đang hoạt động':'Đã khóa'}<p>{p.roleGrantedAt?`Người cấp: ${p.roleGrantedBy||'Không xác định'} · ${time(p.roleGrantedAt)}`:'Quyền có từ trước chức năng này; chưa có bản ghi người cấp.'}</p></article>)}</section><AuditList roles/></>;
}
