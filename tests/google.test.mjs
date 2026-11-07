import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {verifyGoogleToken,makeGoogleNonce,checkGoogleNonce} from '../worker/google.mjs';
// Cryptographic unit tests with isolated keys. These do not claim a real Google login.
const pair=await generateKeyPair('RS256');
const publicKey=await exportJWK(pair.publicKey);publicKey.kid='unit-test-key';publicKey.alg='RS256';
const keys=createLocalJWKSet({keys:[publicKey]}),client='unit-client.apps.googleusercontent.com',nonce='unit-nonce';
const signed=(payload={},audience=client,issuer='https://accounts.google.com',expiration='5m')=>new SignJWT({email:'test@example.test',email_verified:true,name:'Unit test',nonce,...payload}).setProtectedHeader({alg:'RS256',kid:'unit-test-key'}).setSubject('unit-google-sub').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(pair.privateKey);
test('Google verifier checks signature and returns identity without client-supplied privilege',async()=>{
  const identity=await verifyGoogleToken(await signed({role:'ADMIN'}),client,nonce,keys);
  assert.equal(identity.sub,'unit-google-sub');assert.equal(identity.role,undefined);
});
test('Google verifier rejects wrong audience',async()=>assert.rejects(verifyGoogleToken(await signed({},'other-client'),client,nonce,keys)));
test('Google verifier rejects wrong issuer',async()=>assert.rejects(verifyGoogleToken(await signed({},client,'https://attacker.invalid'),client,nonce,keys)));
test('Google verifier rejects expired tokens',async()=>assert.rejects(verifyGoogleToken(await signed({},client,'https://accounts.google.com',Math.floor(Date.now()/1000)-120),client,nonce,keys)));
test('Google verifier rejects mismatched nonce',async()=>assert.rejects(verifyGoogleToken(await signed({nonce:'another-session'}),client,nonce,keys)));
test('Google verifier rejects unverified email',async()=>assert.rejects(verifyGoogleToken(await signed({email_verified:false}),client,nonce,keys)));
test('Google nonce cookie rejects tampering',()=>{const secret='unit-secret-'.repeat(5),state=makeGoogleNonce(secret);assert.equal(checkGoogleNonce(state.cookie,secret),state.nonce);assert.throws(()=>checkGoogleNonce(state.cookie+'0',secret));});

test('new Google users need exactly one Admin-provisioned personnel email',async()=>{
 const {requireGoogleProvisioning}=await import('../worker/google.mjs');
 assert.throws(()=>requireGoogleProvisioning([]),e=>e.status===403);
 assert.throws(()=>requireGoogleProvisioning([{id:'a'},{id:'b'}]),e=>e.status===403);
 assert.throws(()=>requireGoogleProvisioning([{id:'a'}],{active:0}),e=>e.status===403);
 assert.equal(requireGoogleProvisioning([{id:'a'}]),'a');
 assert.equal(requireGoogleProvisioning([{id:'a'}],{active:1,role:'EMPLOYEE'}),'a');
});
