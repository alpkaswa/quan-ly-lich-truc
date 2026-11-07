import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword} from '../worker/password.mjs';
test('salted password hashes verify default and changed passwords without plaintext',()=>{
 const pepper='local-unit-test-only-'.repeat(3),a=hashPassword('1',pepper),b=hashPassword('1',pepper);
 assert.notEqual(a,b);assert.ok(verifyPassword('1',a,pepper));assert.ok(!verifyPassword('2',a,pepper));assert.ok(!verifyPassword('1',a,'wrong'));assert.ok(!verifyPassword('1','GOOGLE_ONLY',pepper));
 assert.throws(()=>hashPassword('1',''));assert.ok(verifyPassword('new-password',hashPassword('new-password',pepper),pepper));
});
