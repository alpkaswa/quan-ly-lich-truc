import {broadcastChange} from './realtime.mjs';
import { DurableObject } from 'cloudflare:workers';
export class ScheduleRoom extends DurableObject {
  async fetch(request) {
    const path=new URL(request.url).pathname;
    if(path==='/status')return Response.json({connections:this.ctx.getWebSockets().length});
    if(path==='/connect') {
      if(request.headers.get('Upgrade')!=='websocket') return new Response('WebSocket required',{status:426});
      const active=this.ctx.getWebSockets();
      if(active.length>=150 || active.filter(s=>s.deserializeAttachment()?.sessionId===request.headers.get('X-Session-Id')).length>=6)return new Response('Too many connections',{status:429});
      const pair=new WebSocketPair(), [client,server]=Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({sessionId:request.headers.get('X-Session-Id'),userId:request.headers.get('X-User-Id'),expires:Number(request.headers.get('X-Expires'))});
      // Hibernation-safe automatic pings do not keep the object awake.
      await this.ctx.storage.setAlarm(Math.min(Number(request.headers.get('X-Expires')), (await this.ctx.storage.getAlarm())||Infinity));
      return new Response(null,{status:101,webSocket:client});
    }
    if(path==='/renew' && request.method==='POST'){
      const {sessionId,expires}=await request.json();
      for(const socket of this.ctx.getWebSockets()){
        const meta=socket.deserializeAttachment();
        if(meta?.sessionId===sessionId && expires>meta.expires)socket.serializeAttachment({...meta,expires});
      }
      return new Response('ok');
    }
    if(path==='/broadcast') {
      const event=await request.json();
      broadcastChange(this.ctx.getWebSockets(),event);
      return new Response('ok');
    }
    return new Response('Not found',{status:404});
  }
  async webSocketMessage(socket,message) {
    const meta=socket.deserializeAttachment();

    // Messages never mutate D1. Authenticated HTTP API is the only write path.
    if(message==='ping'){
      const valid=await this.env.DB.prepare('SELECT s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? AND u.active=1').bind(meta.sessionId,Date.now()).first();
      if(!valid){socket.send(JSON.stringify({type:'session-ended'}));socket.close(4001,'Session ended');return;}
      if(valid.expires_at!==meta.expires)socket.serializeAttachment({...meta,expires:valid.expires_at});
      await this.env.DB.prepare('UPDATE login_history SET last_activity_at=? WHERE session_id=? AND logout_at IS NULL AND last_activity_at<?').bind(Date.now(),meta.sessionId,Date.now()-60000).run();
      socket.send('pong');
    }else socket.close(1008,'Unsupported message');
  }
  async alarm(){
    const sockets=this.ctx.getWebSockets();
    broadcastChange(sockets,{kind:'session-check'});
    const expiries=sockets.map(s=>s.deserializeAttachment()?.expires).filter(t=>t>Date.now());
    if(expiries.length)await this.ctx.storage.setAlarm(Math.min(...expiries));
  }
  webSocketClose(socket,code) { const safeCode=(code>=3000&&code<=4999)||[1000,1001,1002,1003,1007,1008,1009,1010,1011,1012,1013,1014].includes(code)?code:1000;try{socket.close(safeCode,'Connection closed');}catch{} }
  webSocketError(socket) { try{socket.close(1011,'Reconnect');}catch{} }
}
