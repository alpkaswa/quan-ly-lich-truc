import React from 'react';
export class AppErrorBoundary extends React.Component<React.PropsWithChildren,{failed:boolean;reference:string}>{
 state={failed:false,reference:''};
 static getDerivedStateFromError(){return {failed:true,reference:new Date().toISOString()};}
 componentDidCatch(error:Error,info:React.ErrorInfo){console.error('Application rendering failure',error,info.componentStack);}
 render(){if(!this.state.failed)return this.props.children;
 return <main className="min-h-dvh grid place-items-center bg-slate-100 p-5"><section className="panel max-w-lg space-y-4"><h1 className="text-xl font-bold">Không thể hiển thị trang</h1><p>Hãy tải lại để lấy dữ liệu mới nhất từ hệ thống. Nếu lỗi lặp lại, gửi thời điểm dưới đây và thao tác vừa thực hiện cho người quản lý.</p><p className="text-sm text-slate-500">Thời điểm: {this.state.reference}</p><button className="action" onClick={()=>window.location.reload()}>Tải lại ứng dụng</button></section></main>;
 }
}
