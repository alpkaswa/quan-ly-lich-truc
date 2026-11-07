import {UtilityDialog} from './UtilityDialog';
import {PasswordLogin,ChangePassword} from './PasswordAccess';
import {GoogleSignIn} from './GoogleSignIn';
import React,{useEffect,useState} from 'react';
import App from '../App';
import {getSession,logout,type Profile} from '../services/api';
import {StorageService,storageEvents} from '../services/storage';

export default function SessionGate(){
  const [profile,setProfile]=useState<Profile|null>(null),[checking,setChecking]=useState(true),[ready,setReady]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [notifications,setNotifications]=useState<{id:string;message:string;createdAt:string}[]>([]);
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[connected,setConnected]=useState(false),[retry,setRetry]=useState(0);
  const [slow,setSlow]=useState(false);

  useEffect(()=>{setSlow(false);if(!saving)return;const timer=setTimeout(()=>setSlow(true),5000);return()=>clearTimeout(timer);},[saving]);
  const end=()=>{setProfile(null);setReady(false);setConnected(false);StorageService.clear();};

  useEffect(()=>{
    let active=true;
    getSession().then(p=>{if(active)setProfile(p);}).catch(e=>{if(active&&e.status!==401)setError(e.message);}).finally(()=>{if(active)setChecking(false);});
    window.addEventListener('session-ended',end);
    return()=>{active=false;window.removeEventListener('session-ended',end);};
  },[]);

  useEffect(()=>{if(!profile)return;return StorageService.listen(profile.role==='ADMIN');},[profile?.id,retry]);

  useEffect(()=>{
    const events:Record<string,EventListener>={
      ready:()=>setReady(true),
      connection:e=>setConnected(Boolean((e as CustomEvent).detail)),
      saving:()=>{setSaving(true);setNotice('');},
      saved:e=>{setSaving(false);const a=(e as CustomEvent).detail;setNotice(a?`Đã lưu nhân sự: bổ sung ${a.filled} vị trí, cân bằng ${a.rebalanced} ca.${a.noSchedule?' Chưa có lịch tháng để phân bổ.':a.missing?` Còn ${a.missing} vị trí thiếu người đủ điều kiện.`:''}`:'Đã lưu thay đổi.');setError('');},
      failure:e=>{setSaving(false);setError((e as CustomEvent).detail);},
      data:e=>{const fresh=(e as CustomEvent).detail?.profile;if(fresh)setProfile(previous=>previous?.id===fresh.id?fresh:previous);if((e as CustomEvent).detail?.notifications)setNotifications((e as CustomEvent).detail.notifications);if((e as CustomEvent).detail?.changed)setNotice('Lịch hoặc thông báo vừa thay đổi. Đã tải dữ liệu mới nhất.');},
    };
    Object.entries(events).forEach(([name,fn])=>storageEvents.addEventListener(name,fn));
    return()=>Object.entries(events).forEach(([name,fn])=>storageEvents.removeEventListener(name,fn));
  },[]);

  const signOut=async()=>{try{await logout();end();}catch(e){setError((e as Error).message);}};

  if(!profile||!ready)return (
    <main className="min-h-dvh grid place-items-center bg-slate-100 dark:bg-slate-950 p-4 sm:p-6">
      <section className="panel w-full max-w-md space-y-5 shadow-xl border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 bg-white dark:bg-slate-900">
        <div className="space-y-1.5 text-center">
          <div className="inline-block px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] uppercase tracking-wider rounded-full border border-indigo-200/60 dark:border-indigo-800/60">
            QUẢN SINH NỘI TRÚ • NA RÌ
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight pt-1">
            Đăng nhập hệ thống
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tài khoản do Quản trị viên / Ban Giám Hiệu lập và cấp cho từng nhân sự
          </p>
        </div>

        {error&&<p role="alert" className="text-xs rounded-xl bg-red-50 text-red-700 p-3 border border-red-200">{error}</p>}

        {checking ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs">Đang kiểm tra phiên đăng nhập…</p>
          </div>
        ) : profile ? (
          <div className="space-y-3 text-center py-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">Đang tải dữ liệu lịch trực…</p>
            <div className="flex gap-2 justify-center">
              <button className="action text-xs" onClick={()=>setRetry(x=>x+1)}>Kết nối lại</button>
              <button className="action secondary text-xs" onClick={()=>void signOut()}>Đăng xuất</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <PasswordLogin onSuccess={setProfile}/>

            <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              💡 <strong>Lưu ý:</strong> Bạn có thể dùng <em>Tên đăng nhập</em> hoặc <em>Mã nhân sự</em> (ví dụ: <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded">gv10</code>, <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded">gv13</code>) kèm mật khẩu do trường cấp. Mật khẩu ban đầu là <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded font-bold">1</code>.
            </div>

            <div className="relative pt-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-slate-900 px-2.5 text-slate-400">Hoặc đăng nhập bằng Google</span></div>
            </div>

            <GoogleSignIn onSuccess={setProfile}/>
          </div>
        )}
      </section>
    </main>
  );

  return (
    <div className="app-shell">
      <div className="connection-bar no-print" role="status">
        <span className={connected?'text-emerald-700':'text-amber-800'}>
          {connected?'Đã kết nối trực tiếp':'Mất kết nối / đang đồng bộ — dữ liệu có thể đã cũ'}
        </span>
        <div className="flex gap-4">
          <button disabled={saving} onClick={()=>setRetry(x=>x+1)}>Đồng bộ lại</button>
        </div>
      </div>
      {error&&<div role="alert" className="bg-red-50 text-red-800 p-3 text-sm">{error}<button className="float-right" aria-label="Đóng lỗi" onClick={()=>setError('')}>×</button></div>}
      {notice&&<div role="status" className="bg-emerald-50 text-emerald-900 p-3 text-sm">{notice}<button className="float-right" aria-label="Đóng thông báo" onClick={()=>setNotice('')}>×</button></div>}
      <div className="utility-bar no-print">
        {notifications.length>0&&<UtilityDialog label={`Thông báo (${notifications.length})`} title="Thông báo gần đây"><ul className="space-y-3">{notifications.map(n=><li className="border-b border-slate-100 pb-3 text-sm" key={n.id}><p>{n.message}</p><time className="text-xs text-slate-500">{new Date(n.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</time></li>)}</ul></UtilityDialog>}
        <ChangePassword/>
      </div>
      <App profile={profile} authUser={{id:profile.id,name:profile.displayName,email:profile.email||profile.username,role:profile.role==='ADMIN'?'ADMIN':'TEACHER',provider:'google',loginAt:''}} onLogout={()=>void signOut()}/>
      {saving&&<div className="fixed inset-0 z-[100] bg-slate-950/25 grid place-items-center" role="status"><div className="panel">{slow?'Đang xử lý lâu hơn dự kiến. Hệ thống sẽ cập nhật kết quả; vui lòng không gửi lại.':'Đang lưu và kiểm tra lịch…'}</div></div>}
    </div>
  );
}
