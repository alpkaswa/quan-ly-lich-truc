import { api,call } from './api';
import type { Employee, UnavailableDate, ShiftAssignment, ShiftChangeHistory, ShiftChangeRequest, ScheduleSettings, CompensatoryDuty } from '../types';
export const DEFAULT_SETTINGS: ScheduleSettings = {
  schoolName: 'TRƯỜNG PHỔ THÔNG DÂN TỘC NỘI TRÚ NA RÌ', shiftDurationHours: 24,
  shiftStartTime: '07:00', shiftEndTime: '07:00 ngày hôm sau', requiredTeachers: 2, requiredAdmins: 1,
  requiredGuards: 1, disallowConsecutiveDays: true, respectApprovedUnavailabilities: true, fairDistribution: true,
};
export type SharedData = {
  employees: Employee[]; unavailableDates: UnavailableDate[]; shifts: ShiftAssignment[];
  history: ShiftChangeHistory[]; requests: ShiftChangeRequest[];
  compensatoryDuties: CompensatoryDuty[]; settings: ScheduleSettings;
};
const empty = (): SharedData => ({ employees: [], unavailableDates: [], shifts: [], history: [], requests: [], compensatoryDuties: [], settings: { ...DEFAULT_SETTINGS } });
const keys=['employees','unavailableDates','shifts','history','compensatoryDuties'] as const;
let data=empty(),revision=-1,canWrite=false,generation=0,serverConfirmed=false;
let staged:SharedData|null=null,inFlight:Promise<void>|null=null,scheduled=false;
let refreshing:Promise<void>|null=null,dirty=false,refreshGeneration=-1;
export const storageEvents=new EventTarget();
export const emitStorage=(type:string,detail?:unknown)=>storageEvents.dispatchEvent(new CustomEvent(type,{detail}));
export class StorageService {
  static initDatabase(){}
  static clear(){generation++;data=empty();revision=-1;canWrite=false;staged=null;serverConfirmed=false;}
  static async refresh():Promise<void>{
    if(refreshing){if(refreshGeneration!==generation){await refreshing.catch(()=>{});return this.refresh();}dirty=true;return refreshing;}
    const current=generation;refreshGeneration=current;
    refreshing=(async()=>{
      do {
        dirty=false;
        const result=await api(revision>=0?`/state?since=${revision}`:'/state');
        if(current!==generation)return;
        if(result.unchanged){serverConfirmed=true;emitStorage('data',{changed:false,profile:result.profile,notifications:result.notifications});emitStorage('ready');continue;}
        if(!staged&&!inFlight){const changed=revision>=0&&result.revision>revision;data=result.data;revision=result.revision;emitStorage('data',{changed,notifications:result.notifications,profile:result.profile});emitStorage('ready');}
        serverConfirmed=true;
      }while(dirty);
    })();
    try{await refreshing;emitStorage('connection',true);}catch(e){serverConfirmed=false;emitStorage('connection',false);emitStorage('failure',(e as Error).message);throw e;}finally{refreshing=null;}
  }
  static listen(admin:boolean){
    this.clear();canWrite=admin;const current=generation;
    let stopped=false,socket:WebSocket|null=null,retryTimer:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,pollTimer:ReturnType<typeof setInterval>|undefined;
    let attempts=0,lastPong=Date.now();
    const refresh=()=>void this.refresh().catch(()=>{});
    const connect=()=>{
      if(stopped||current!==generation||!navigator.onLine)return;
      if(socket){socket.onclose=null;socket.close();}
      try{
        const url=new URL('/api/ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
        socket=new WebSocket(url);
      }catch{
        if(!pollTimer)pollTimer=setInterval(refresh,8000);
        return;
      }
      socket.onopen=()=>{
        attempts=0;lastPong=Date.now();
        if(pollTimer){clearInterval(pollTimer);pollTimer=undefined;}
        emitStorage('connection',true);
        refresh();
      };
      socket.onmessage=e=>{if(e.data==='pong'){lastPong=Date.now();return;}try{const event=JSON.parse(e.data);if(event.type==='session-ended'){stopped=true;clearTimeout(retryTimer);clearInterval(heartbeat);if(pollTimer)clearInterval(pollTimer);serverConfirmed=false;emitStorage('connection',false);window.dispatchEvent(new Event('session-ended'));socket?.close();return;}if(event.type==='changed'&&(!Number.isSafeInteger(event.revision)||event.revision>revision))refresh();}catch{socket?.close();}};
      socket.onerror=()=>{
        if(!pollTimer)pollTimer=setInterval(refresh,8000);
      };
      socket.onclose=e=>{
        if(e.code===4001){stopped=true;clearTimeout(retryTimer);clearInterval(heartbeat);if(pollTimer)clearInterval(pollTimer);window.dispatchEvent(new Event('session-ended'));return;}
        if(!pollTimer)pollTimer=setInterval(refresh,8000);
        if(!stopped){clearTimeout(retryTimer);retryTimer=setTimeout(connect,Math.min(30000,1000*2**attempts++)+Math.random()*400);}
      };
    };
    const online=()=>{clearTimeout(retryTimer);connect();refresh();};
    const offline=()=>{serverConfirmed=false;emitStorage('connection',false);socket?.close();};
    const focus=()=>{if(document.visibilityState==='visible'){refresh();if(!socket||socket.readyState!==WebSocket.OPEN)online();}};
    window.addEventListener('online',online);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',focus);
    heartbeat=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN){if(Date.now()-lastPong>65000)socket.close();else socket.send('ping');}},25000);
    connect();refresh();
    return()=>{stopped=true;clearTimeout(retryTimer);clearInterval(heartbeat);if(pollTimer)clearInterval(pollTimer);if(socket){socket.onclose=null;socket.close();}window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',focus);if(current===generation)this.clear();};
  }
  static async reconnect(){await this.refresh();}
  private static stage<K extends keyof SharedData>(key:K,value:SharedData[K]){
    if(!canWrite||!serverConfirmed||!navigator.onLine||inFlight||revision<0){emitStorage('failure',!canWrite?'Chỉ Admin được sửa dữ liệu.':'Chưa kết nối hoặc đang lưu. Hãy chờ đồng bộ rồi thử lại.');queueMicrotask(()=>emitStorage('data'));return;}
    staged??=structuredClone(data);staged[key]=value;
    if(!scheduled){scheduled=true;emitStorage('saving');queueMicrotask(()=>{scheduled=false;void this.flush().catch(()=>{});});}
  }
  static async flush(){
    if(inFlight)return inFlight;if(!staged)return;
    const payload=staged;staged=null;const current=generation,expectedRevision=revision;
    inFlight=(async()=>{try{const result=await call('saveScheduleData',{expectedRevision,data:payload});if(current===generation)emitStorage('saved',result.automatic);}catch(e){if(current===generation){emitStorage('failure',`Chưa xác nhận lưu: ${(e as Error).message}. Kiểm tra dữ liệu mới nhất trước khi thử lại.`);emitStorage('data');}throw e;}})();
    try{await inFlight;}finally{inFlight=null;if(current===generation)await this.refresh().catch(()=>{});}
  }
  static getEmployees() { return data.employees; }
  static saveEmployees(v: Employee[]) { this.stage('employees', v); }
  static getUnavailableDates() { return data.unavailableDates; }
  static saveUnavailableDates(v: UnavailableDate[]) { this.stage('unavailableDates', v); }
  static getShifts() { return data.shifts; }
  static saveShifts(v: ShiftAssignment[]) { this.stage('shifts', v); }
  static getHistory() { return data.history; }
  static saveHistory(v: ShiftChangeHistory[]) { this.stage('history', v); }
  static getRequests() { return data.requests; }
  static getCompensatoryDuties() { return data.compensatoryDuties; }
  static saveCompensatoryDuties(v: CompensatoryDuty[]) { this.stage('compensatoryDuties', v); }
  static getSettings() { return data.settings; }
  static saveSettings(v: ScheduleSettings) { this.stage('settings', v); }
  static resetToDefaults() { this.saveSettings({ ...DEFAULT_SETTINGS }); }
  static exportDatabaseJSON() { return JSON.stringify({ version: '2.0', exportedAt: new Date().toISOString(), data }, null, 2); }
  static async importDatabaseJSON(text: string) {
    try {
      const imported = JSON.parse(text).data;
      if(!window.confirm('Nhập dữ liệu sẽ thay đổi dữ liệu chung. Hệ thống sẽ tạo bản sao lưu hiện tại trước. Tiếp tục?')) return false;
      await api('/backups','POST',{});
      if (!canWrite || !navigator.onLine || inFlight) throw new Error('Chưa thể nhập dữ liệu');
      for (const key of keys) if (!Array.isArray(imported?.[key])) throw new Error(`Thiếu danh sách ${key}`);
      if (!imported.settings) throw new Error('Thiếu cấu hình');
      for (const key of [...keys, 'settings'] as const) this.stage(key, imported[key]);
      await this.flush(); return true;
    } catch { return false; }
  }
}
