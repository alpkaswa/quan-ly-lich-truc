import test from 'node:test';
import assert from 'node:assert/strict';
import {equal} from '../worker/crypto.mjs';
test('constant-time comparison safely rejects same-character-length multibyte input',()=>{
 assert.equal(equal('a','é'),false);assert.equal(equal('é','é'),true);assert.equal(equal(undefined,'x'),false);assert.equal(equal('secret','secret'),true);assert.equal(equal('secret','xxxxxx'),false);
});
