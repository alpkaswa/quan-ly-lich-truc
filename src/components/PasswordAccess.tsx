import {UtilityDialog} from './UtilityDialog';
import React,{useState} from 'react';
import {api,passwordLogin,type Profile} from '../services/api';

export function PasswordLogin({onSuccess}:{onSuccess:(p:Profile)=>void}){
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[showPassword,setShowPassword]=useState(false);
  return <form className="space-y-3.5" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{onSuccess(await passwordLogin(username,password));}catch(e){setError((e as Error).message);}finally{setBusy(false);setPassword('');}}}>
    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
      Tên đăng nhập
      <span className="block text-[11px] font-normal text-slate-500 mt-0.5">Nhập tên đăng nhập hoặc mã nhân sự (ví dụ: gv10, gv13, bv01...)</span>
      <input required autoComplete="username" placeholder="Tên đăng nhập hoặc mã nhân sự..." className="field mt-1 w-full" value={username} onChange={e=>setUsername(e.target.value)}/>
    </label>
    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
      Mật khẩu
      <span className="block text-[11px] font-normal text-slate-500 mt-0.5">Mật khẩu do trường cấp (mặc định ban đầu: 1)</span>
      <div className="relative mt-1">
        <input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu..." className="field w-full pr-12" value={password} onChange={e=>setPassword(e.target.value)}/>
        <button type="button" onClick={()=>setShowPassword(!showPassword)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer">
          {showPassword ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
    </label>
    {error&&<p role="alert" className="text-xs rounded-lg bg-red-50 text-red-700 p-2.5 border border-red-200 leading-relaxed">{error}</p>}
    <button className="action w-full py-2.5 font-bold cursor-pointer" disabled={busy}>{busy?'Đang đăng nhập…':'Đăng nhập'}</button>
  </form>;
}

export function ChangePassword(){
  const [currentPassword,setCurrent]=useState(''),[newPassword,setNew]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <UtilityDialog label="Đổi mật khẩu" title="Đổi mật khẩu" onClose={()=>{setCurrent('');setNew('');setError('');}}>
    <form className="space-y-3 max-w-md" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('/auth/change-password','POST',{currentPassword,newPassword});window.dispatchEvent(new Event('session-ended'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      <p className="text-xs text-slate-600 leading-relaxed">Sau khi đổi mật khẩu, hệ thống sẽ yêu cầu bạn đăng nhập lại với mật khẩu mới để bảo mật thông tin.</p>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Mật khẩu hiện tại
        <input className="field mt-1 w-full" type="password" autoComplete="current-password" required value={currentPassword} onChange={e=>setCurrent(e.target.value)}/>
      </label>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Mật khẩu mới (8–128 ký tự)
        <input className="field mt-1 w-full" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={e=>setNew(e.target.value)}/>
      </label>
      {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
      <button className="action w-full font-bold cursor-pointer" disabled={busy}>Đổi mật khẩu</button>
    </form>
  </UtilityDialog>;
}
