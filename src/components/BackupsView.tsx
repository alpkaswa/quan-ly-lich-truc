import React,{useEffect,useState} from 'react';
import {api} from '../services/api';
type Backup={id:string;object_key:string|null;status:'SUCCESS'|'FAILED';created_at:string;error:string|null;revision:number};
const legacySizeError='Bản sao lưu vượt 4 MiB; cần triển khai sao lưu phân đoạn trước khi dữ liệu tăng thêm.';
function backupError(row:Backup,latest?:Backup){
  if(row.error!==legacySizeError)return row.error;
  const nextSuccess=latest && latest.created_at>row.created_at;
  return 'Lần sao lưu này thất bại vì phiên bản cũ giới hạn dữ liệu chưa nén ở 4 MiB.' + (nextSuccess?' Hệ thống đã sao lưu thành công sau đó.':' Bản hiện tại nén và chia nhỏ dữ liệu trước khi lưu.');
}
export function BackupsView(){
  const [config,setConfig]=useState<{storage:string;warning:string|null}|null>(null);
  useEffect(()=>{void api('/backups/config').then(setConfig).catch(e=>setError(e.message));},[]);
  const [rows,setRows]=useState<Backup[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[file,setFile]=useState<File|null>(null),[confirm,setConfirm]=useState('');
  const load=()=>{void api<Backup[]>('/backups').then(setRows).catch(e=>setError(e.message));};
  useEffect(load,[]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await action();load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const latest=rows.find(r=>r.status==='SUCCESS');
  return <section className="space-y-4"><h1 className="text-2xl font-bold">Sao lưu & khôi phục</h1>
    {config&&<p role="status" className="panel">Kho sao lưu mới: {config.storage}. {config.warning}</p>}
    {error&&<p role="alert" className="bg-red-50 text-red-800 p-3 rounded-lg">{error}</p>}{message&&<p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-lg">{message}</p>}
    <div className="panel space-y-3"><h2 className="font-bold">Sao lưu tự động mỗi ngày lúc 02:00 giờ Việt Nam</h2><p className="text-sm">Gần nhất: {latest?new Date(latest.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có bản sao lưu thành công.'}</p><p className="text-sm text-slate-500">Bản sao lưu chứa dữ liệu nội bộ và thông tin tài khoản; chỉ Admin được tải. Giữ lại 21 ngày trong kho riêng tư: D1 trên cấu hình miễn phí hiện tại, hoặc R2 khi được bật.</p><button className="action" disabled={busy} onClick={()=>void run(async()=>{await api('/backups','POST',{});setMessage('Đã lưu bản sao lưu vào kho riêng tư.');})}>Sao lưu ngay</button></div>
    <div className="panel space-y-3"><h2 className="font-bold">Nhật ký sao lưu</h2>{rows.map(row=><div className="border-t border-slate-200 pt-3 text-sm" key={row.id}><p>{new Date(row.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · {row.status==='SUCCESS'?'Thành công':'Thất bại'}</p>{row.error&&<p className="text-red-700">{backupError(row,latest)}</p>}{row.status==='SUCCESS'&&<a className="text-indigo-700 underline" href={`/api/backups/download?id=${encodeURIComponent(row.id)}`} download>Tải bản sao lưu</a>}</div>)}</div>
    <form className="panel space-y-4" onSubmit={e=>{e.preventDefault();if(!file)return;void run(async()=>{if(file.size>5*1024*1024)throw new Error('Tệp vượt 5 MiB.');const backup=JSON.parse(await file.text());await api('/backups/restore','POST',{backup,confirm});setMessage('Đã khôi phục. Các phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');window.dispatchEvent(new Event('session-ended'));});}}><h2 className="font-bold">Khôi phục từ bản sao lưu của hệ thống</h2><p className="text-sm text-amber-800">Toàn bộ dữ liệu hiện tại sẽ được thay bằng bản sao lưu. Hệ thống phải tạo được bản sao lưu an toàn trước khi khôi phục và sẽ đăng xuất mọi người.</p><label className="block">Chọn tệp JSON<input className="field" type="file" accept=".json" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label><label className="block">Nhập KHOI PHUC để xác nhận<input className="field" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="action" disabled={busy||confirm!=='KHOI PHUC'}>Tạo bản sao lưu hiện tại và khôi phục</button></form>
  </section>;
}
