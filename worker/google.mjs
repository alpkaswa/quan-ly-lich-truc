import {createRemoteJWKSet,jwtVerify} from 'jose';
import {token,sign,equal} from './crypto.mjs';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{cacheMaxAge:3600000,timeoutDuration:10000});
export function makeGoogleNonce(secret){const nonce=token(),expires=Date.now()+600000,body=`${nonce}.${expires}`;return {nonce,cookie:`${body}.${sign(body,secret)}`};}
export function checkGoogleNonce(cookie,secret){
  const [nonce,expiry,signature]=String(cookie||'').split('.');
  if(!nonce||!expiry||Number(expiry)<Date.now()||!equal(sign(`${nonce}.${expiry}`,secret),signature))throw new Error('Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.');
  return nonce;
}
export async function verifyGoogleToken(credential,clientId,nonce,keys=googleKeys){
  if(typeof credential!=='string'||credential.length>12000)throw new Error('Thông tin đăng nhập Google không hợp lệ.');
  const {payload}=await jwtVerify(credential,keys,{audience:clientId,issuer:['https://accounts.google.com','accounts.google.com'],algorithms:['RS256'],clockTolerance:30,maxTokenAge:'2h'});
  if(payload.email_verified!==true||typeof payload.email!=='string'||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255||!equal(payload.nonce,nonce))throw new Error('Tài khoản Google chưa xác minh hoặc phiên không hợp lệ.');
  return {sub:payload.sub,email:payload.email.toLowerCase(),name:String(payload.name||payload.email).slice(0,100)};
}

export function requireGoogleProvisioning(matches,account=null){
 if(matches.length!==1){const e=new Error('Tài khoản Google chưa được Admin cấp quyền hoặc email trùng nhiều hồ sơ. Vui lòng liên hệ Admin.');e.status=403;throw e;}
 if(account&&!account.active){const e=new Error('Tài khoản đã bị khóa.');e.status=403;throw e;}
 return matches[0].id;
}
