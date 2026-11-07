import React,{useId,useRef} from 'react';
export function UtilityDialog({label,title,children,onClose}:{label:string;title:string;children:React.ReactNode;onClose?:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 return <><button type="button" className="utility-trigger" onClick={()=>ref.current?.showModal()}>{label}</button><dialog ref={ref} aria-labelledby={titleId} className="utility-dialog" onClose={onClose} onClick={e=>{if(e.target===e.currentTarget)ref.current?.close();}}><div className="utility-dialog-content"><div className="flex items-center justify-between gap-4 mb-4"><h2 id={titleId} className="font-bold text-lg">{title}</h2><button type="button" autoFocus className="action secondary" onClick={()=>ref.current?.close()} aria-label="Đóng cửa sổ">Đóng</button></div>{children}</div></dialog></>;
}
