// A closed/broken device must never interrupt updates to other devices.
export function broadcastChange(sockets,event,now=Date.now()){
 const payload=JSON.stringify({type:'changed',revision:event.revision,kind:event.kind});
 for(const socket of sockets){
  try {
   const meta=socket.deserializeAttachment();
   if(event.revokeAll||!meta||meta.expires<=now||event.revokeUser===meta.userId||event.revokeSession===meta.sessionId){socket.send(JSON.stringify({type:'session-ended'}));socket.close(4001,'Session ended');continue;}
   socket.send(payload);
  }catch{try{socket.close(1011,'Reconnect');}catch{}}
 }
}
