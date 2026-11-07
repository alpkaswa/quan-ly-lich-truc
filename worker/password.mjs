import {randomBytes,scryptSync} from 'node:crypto';
import {equal} from './crypto.mjs';
export function hashPassword(password,pepper){
 if(!pepper||pepper.length<32)throw new Error('Chưa cấu hình PASSWORD_PEPPER.');
 const salt=randomBytes(16).toString('hex');
 return `scrypt$${salt}$${scryptSync(password+pepper,salt,32,{N:16384,r:8,p:1}).toString('hex')}`;
}
export function verifyPassword(password,stored,pepper){
 if(typeof password!=='string'||password.length>128||!pepper)return false;
 const parts=String(stored).split('$');
 if(parts.length!==3||parts[0]!=='scrypt')return false;
 return equal(scryptSync(password+pepper,parts[1],32,{N:16384,r:8,p:1}).toString('hex'),parts[2]);
}
