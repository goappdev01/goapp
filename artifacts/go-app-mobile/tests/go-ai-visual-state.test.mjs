import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const {assistantActivity,visibleExpression,goAiActivityIsAnimated}=h.load('lib/goAiVisualState.ts');

test('GO rests as a complete friendly identity with no activity indicator',()=>{
 assert.equal(assistantActivity({voice:'idle'}),'available');
 assert.equal(visibleExpression('available','wink'),'friendly');
 assert.equal(visibleExpression('closing','serious'),'friendly');
 assert.equal(goAiActivityIsAnimated('available'),false);
});
test('indicators follow capture, analysis, playback and authorized action states',()=>{
 assert.equal(assistantActivity({voice:'preparing'}),'entry');
 assert.equal(assistantActivity({voice:'listening'}),'listening');
 assert.equal(assistantActivity({voice:'transcribing'}),'processing');
 assert.equal(assistantActivity({voice:'idle',speaking:true}),'speaking');
 assert.equal(assistantActivity({voice:'idle',busy:'Consultando GO…'}),'processing');
 assert.equal(assistantActivity({voice:'idle',busy:'Guardando en GO…'}),'executing');
 assert.equal(assistantActivity({voice:'idle',completed:true}),'completed');
 assert.equal(assistantActivity({voice:'idle',error:true}),'error');
 assert.equal(goAiActivityIsAnimated('listening'),true);
 assert.equal(goAiActivityIsAnimated('entry'),false);
});
test('explicit serious and confirmation contexts take precedence over playful expression',()=>{
 assert.equal(visibleExpression('listening','serious'),'serious');
 assert.equal(visibleExpression('processing','confirmation'),'confirmation');
 assert.equal(visibleExpression('error','wink'),'attention');
 assert.equal(visibleExpression('completed','wink'),'positive');
});
