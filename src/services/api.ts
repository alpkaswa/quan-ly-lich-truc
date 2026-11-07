export type Profile={id:string;employeeId:string|null;role:'ADMIN'|'EMPLOYEE';displayName:string;username:string;email?:string;active:boolean;roleGrantedBy?:string|null;roleGrantedAt?:string|null};
export type SwapRequest={id:string;requesterId:string;targetEmployeeId:string;shiftDate:string;targetShiftDate:string|null;reason:string;status:'PENDING'|'APPROVED'|'REJECTED';createdAt:string;respondedAt:string|null};
export type SwapAudit={id:string;requestId:string;requesterId:string;targetEmployeeId:string;shiftDate:string;targetShiftDate:string|null;reason:string;timestamp:string;requesterName:string;targetName:string};
let csrf='';
export async function api<T=any>(path:string,method='GET',data?:unknown):Promise<T>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),path.startsWith('/backups')?90000:25000);
  let response:Response;
  try{response=await fetch(`/api${path}`,{method,signal:controller.signal,credentials:'same-origin',headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});}
  catch(e){if(controller.signal.aborted)throw new Error(method==='GET'?'Kết nối quá lâu. Kiểm tra mạng rồi đồng bộ lại.':'Chưa xác nhận được kết quả lưu. Đồng bộ lại để kiểm tra trước khi gửi lại.');throw e;}
  finally{clearTimeout(timeout);}
  const result:any=await response.json().catch(()=>({error:'Phản hồi máy chủ không hợp lệ.'}));
  if(!response.ok){if(response.status===401)window.dispatchEvent(new Event('session-ended'));const error=new Error(result.error||'Không thể hoàn tất yêu cầu.');Object.assign(error,{status:response.status});throw error;}
  return result;
}
export async function getSession(){const result=await api<{profile:Profile;csrf:string}>('/auth/session');csrf=result.csrf;return result.profile;}
export async function googleLogin(credential:string){const result=await api<{profile:Profile;csrf:string}>('/auth/google','POST',{credential});csrf=result.csrf;return result.profile;}
export async function logout(){await api('/auth/logout','POST',{});csrf='';}
export async function call<T=any>(name:string,data:any):Promise<T>{
  const routes:Record<string,[string,string]>={saveScheduleData:['/state','PUT'],requestSwap:['/swaps','POST'],respondSwap:['/swaps/respond','POST'],setAccountActive:['/accounts/active','POST']};
  const route=routes[name];if(!route)throw new Error('Chức năng chưa được hỗ trợ.');return api<T>(route[0],route[1],data);
}


export async function passwordLogin(username:string,password:string){const result=await api<{profile:Profile;csrf:string}>('/auth/password','POST',{username,password});csrf=result.csrf;return result.profile;}
