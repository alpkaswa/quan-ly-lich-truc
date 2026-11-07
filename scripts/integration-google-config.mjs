import assert from 'node:assert/strict';
const base='http://127.0.0.1:8791/api/auth/google';
const first=await fetch(base+'/config');assert.equal(first.status,200);const a=await first.json();
const cookie=first.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const second=await fetch(base+'/config',{headers:{Cookie:cookie}});const b=await second.json();
assert.equal(a.nonce,b.nonce);assert.equal(second.headers.getSetCookie().length,0);assert.ok(a.expiresAt>Date.now());
const bad=await fetch(base,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({credential:'invalid'})});assert.equal(bad.status,409);
const fresh=await (await fetch(base+'/config',{headers:{Cookie:'duty_google_nonce=bad'}})).json();assert.notEqual(fresh.nonce,a.nonce);
console.log('PASS shared browser nonce, expiry, missing cookie rejection, invalid cookie renewal');
