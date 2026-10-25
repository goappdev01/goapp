import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarSelectionFixture} from './helpers/calendar-selection-lifecycle.mjs';

const entry={id:'reservation-1',type:'GO_BOOKING',kind:'sent',reservationId:'r1',dateISO:'2030-10-26',time:'12:00',estado:'aceptado'};
test('real fresh Calendar projections settle after opening; selected detail derives the newest record without effect writes',async()=>{
  const f=await calendarSelectionFixture();const saved=JSON.stringify(entry);
  try{
    await f.render([entry]);await f.open(entry);
    assert.equal(f.snapshot.entry.id,entry.id);assert.notEqual(f.snapshot.entry,entry);
    for(let i=0;i<12;i++){
      const updated={...entry,time:i%2?'12:30':'13:00'};await f.render([updated]);
      assert.equal(f.snapshot.entry.time,updated.time);
      assert.equal(f.snapshot.entry,f.snapshot.projection[0]);
    }
    assert.ok(f.renders<24,'Selection cannot chase each newly projected object');
    assert.equal(JSON.stringify(entry),saved);
  }finally{await f.close();}
});
test('removing or filtering the selected record clears selection; reappearing records do not reopen the detail',async()=>{
  const f=await calendarSelectionFixture();
  try{
    await f.render([entry]);await f.open(entry);await f.render([]);
    assert.equal(f.snapshot.entry,null);await f.render([entry]);assert.equal(f.snapshot.entry,null);
    for(let i=0;i<8;i++){await f.open(entry);assert.equal(f.snapshot.entry.id,entry.id);await f.open(null);assert.equal(f.snapshot.entry,null);}
    assert.ok(f.renders<30);
  }finally{await f.close();}
});
