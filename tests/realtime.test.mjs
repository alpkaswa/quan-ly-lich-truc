import test from 'node:test';
import assert from 'node:assert/strict';
import {broadcastChange} from '../worker/realtime.mjs';
const makeSocket=(i)=>({sent:[],closed:[],deserializeAttachment:()=>({sessionId:`session-${i}`,userId:`user-${i}`,expires:2000}),send(value){this.sent.push(JSON.parse(value));},close(code){this.closed.push(code);}});
test('all 50 connected recipients receive committed change metadata without roster or secrets',()=>{
 const sockets=Array.from({length:50},(_,i)=>makeSocket(i));
 broadcastChange(sockets,{revision:7,kind:'swap',password:'must not be sent',data:{name:'private'}},1000);
 for(const socket of sockets)assert.deepEqual(socket.sent,[{type:'changed',revision:7,kind:'swap'}]);
});
test('one broken socket cannot block the remaining 49 recipients',()=>{
 const sockets=Array.from({length:50},(_,i)=>makeSocket(i));sockets[0].send=()=>{throw new Error('closed socket');};
 broadcastChange(sockets,{revision:8,kind:'schedule'},1000);
 assert.deepEqual(sockets[0].closed,[1011]);for(const socket of sockets.slice(1))assert.equal(socket.sent.length,1);
});
test('expired or revoked accounts and sessions receive only termination notice',()=>{
 const sockets=[makeSocket(0),makeSocket(1),makeSocket(2),makeSocket(3)];sockets[0].deserializeAttachment=()=>({expires:1000});
 broadcastChange(sockets,{kind:'accounts',revokeUser:'user-1',revokeSession:'session-2'},1000);
 for(const socket of sockets.slice(0,3)){assert.deepEqual(socket.sent,[{type:'session-ended'}]);assert.deepEqual(socket.closed,[4001]);}assert.equal(sockets[3].sent.length,1);
});

test('renewed session expiry keeps active recipient connection open',()=>{
 const socket=makeSocket(0);
 socket.deserializeAttachment=()=>({sessionId:'session-0',userId:'user-0',expires:5000});
 broadcastChange([socket],{revision:9,kind:'session-check'},3000);
 assert.equal(socket.closed.length,0);
 assert.deepEqual(socket.sent,[{type:'changed',revision:9,kind:'session-check'}]);
});
