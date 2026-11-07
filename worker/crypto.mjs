import {randomBytes,timingSafeEqual,createHash,createHmac} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const sign=(value,key)=>createHmac('sha256',key).update(value).digest('hex');
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
