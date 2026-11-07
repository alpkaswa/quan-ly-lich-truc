import React,{useEffect,useRef,useState} from 'react';
import {api,googleLogin,type Profile} from '../services/api';
declare global {interface Window {google?:{accounts:{id:{initialize:(config:Record<string,unknown>)=>void;renderButton:(element:HTMLElement,config:Record<string,unknown>)=>void;cancel:()=>void}}}}}
let scriptPromise:Promise<void>|null=null;
function loadGoogle(){
  if(window.google)return Promise.resolve();
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client?hl=vi';script.async=true;script.defer=true;script.onload=()=>resolve();script.onerror=()=>{scriptPromise=null;script.remove();reject(new Error('Không tải được Google. Kiểm tra kết nối và thử lại.'));};document.head.appendChild(script);});return scriptPromise;
}
export function GoogleSignIn({onSuccess}:{onSuccess:(profile:Profile)=>void}){
  const container=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');setBusy(false);
    let expiresAt=0,verifying=false;
    const refreshExpired=()=>{if(active&&!verifying&&expiresAt&&Date.now()>expiresAt-60000){expiresAt=0;setRetry(x=>x+1);}};
    const timer=window.setInterval(refreshExpired,30000);
    window.addEventListener('focus',refreshExpired);
    void (async()=>{
      const config=await api('/auth/google/config');
      expiresAt=config.expiresAt||Date.now()+600000;
      if(!config.configured)throw new Error('Đăng nhập Google đang chờ quản trị viên hoàn tất cấu hình.');
      await loadGoogle();if(!active||!container.current||!window.google)return;
      window.google.accounts.id.initialize({client_id:config.clientId,nonce:config.nonce,auto_select:false,callback:async(response:{credential:string})=>{
        if(!active||verifying)return;verifying=true;setBusy(true);setError('');
        try{const profile=await googleLogin(response.credential);if(active)onSuccess(profile);}catch(e){if(active)setError((e as Error).message);}finally{verifying=false;if(active)setBusy(false);}
      }});
      container.current.replaceChildren();window.google.accounts.id.renderButton(container.current,{type:'standard',theme:'outline',size:'large',text:'signin_with',shape:'rectangular',width:300,locale:'vi'});
    })().catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refreshExpired);window.google?.accounts.id.cancel();};
  },[retry]);
  return <div className="space-y-4"><div ref={container} className="min-h-11 flex justify-center"/>{busy&&<p role="status">Đang xác minh tài khoản Google…</p>}{error&&<><p role="alert" className="text-red-700 text-sm">{error}</p><button className="action secondary" type="button" onClick={()=>setRetry(x=>x+1)}>Thử lại</button></>}<p className="text-xs text-slate-500">Admin và nhân viên đều đăng nhập bằng Google. Quyền truy cập được hệ thống kiểm tra; không tự chọn quyền Admin.</p></div>;
}
