import test from 'node:test';
import assert from 'node:assert/strict';
import { getCutoff } from '../worker/retention.mjs';

test('getCutoff accurately computes the first day of previous month as retention boundary', () => {
  // Test mid-year
  const nov = new Date('2026-11-06T08:00:00Z');
  const resNov = getCutoff(nov);
  assert.equal(resNov.cutoffDate, '2026-10-01');
  assert.equal(resNov.currentMonth, '2026-11');
  assert.equal(resNov.previousMonth, '2026-10');
  assert.equal(typeof resNov.cutoffMs, 'number');
  assert.ok(resNov.cutoffMs > 0);

  // Test year boundary (January)
  const jan = new Date('2027-01-15T12:00:00Z');
  const resJan = getCutoff(jan);
  assert.equal(resJan.cutoffDate, '2026-12-01');
  assert.equal(resJan.currentMonth, '2027-01');
  assert.equal(resJan.previousMonth, '2026-12');

  // Test December
  const dec = new Date('2026-12-31T23:59:59+07:00');
  const resDec = getCutoff(dec);
  assert.equal(resDec.cutoffDate, '2026-11-01');
  assert.equal(resDec.currentMonth, '2026-12');
  assert.equal(resDec.previousMonth, '2026-11');

  // Test March (after February)
  const mar = new Date('2027-03-01T01:00:00+07:00');
  const resMar = getCutoff(mar);
  assert.equal(resMar.cutoffDate, '2027-02-01');
  assert.equal(resMar.currentMonth, '2027-03');
  assert.equal(resMar.previousMonth, '2027-02');
});
