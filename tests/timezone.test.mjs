import test from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {readFile} from 'node:fs/promises';
const uri=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=text=>stripTypeScriptTypes(text,{mode:'strip'});
const school=uri(compile(await readFile(new URL('../src/services/schoolTime.ts',import.meta.url),'utf8')));
const source=compile(await readFile(new URL('../src/services/dateTimeUtils.ts',import.meta.url),'utf8')).replace("'./schoolTime'",JSON.stringify(school));
const time=await import(uri(source));
test('school clock and duty handover remain in Vietnam across device timezones',()=>{
  const prior=process.env.TZ;
  try{for(const timezone of ['UTC','America/New_York','Pacific/Auckland','Asia/Ho_Chi_Minh']){
    process.env.TZ=timezone;
    const before=new Date('2026-11-02T23:59:59Z'),after=new Date('2026-11-03T00:00:00Z');
    assert.equal(time.getDutyShiftDateForTimestamp(before),'2026-11-02',timezone);
    assert.equal(time.getDutyShiftDateForTimestamp(after),'2026-11-03',timezone);
    assert.equal(time.formatDateVN(after),'03/11/2026',timezone);
    assert.equal(time.formatTimeVN(after),'07:00:00',timezone);
    assert.equal(time.getShiftTimeBounds('2026-11-03').startTime.toISOString(),'2026-11-03T00:00:00.000Z');
    assert.equal(time.getShiftTimeBounds('2026-11-03').endTime.toISOString(),'2026-11-04T00:00:00.000Z');
    assert.deepEqual(time.getDefaultScheduleRange(new Date('2026-11-30T23:00:00Z')),{startDate:'2026-12-01',endDate:'2026-12-31'});
  }}finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;}
});
