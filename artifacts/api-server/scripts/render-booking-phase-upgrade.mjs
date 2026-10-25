import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {renderBookingGapUpgrade} from './render-booking-gap-upgrade.mjs';
/** Generate review SQL only. This command never opens a database connection. */
export function renderBookingPhaseUpgrade(){
 const phase=readFileSync(fileURLToPath(new URL('../supabase/drafts/booking_phase_wait_v1.sql',import.meta.url)),'utf8').replace(/\r\n/g,'\n');
 if(!/^begin;$/m.test(phase)||!/^commit;\s*$/m.test(phase))throw Error('Expected transactional phase source');
 const definitions=phase.replace(/^begin;$/m,'').replace(/^commit;\s*$/m,'');
 const timeline=readFileSync(fileURLToPath(new URL('../supabase/drafts/booking_timeline_v1.sql',import.meta.url)),'utf8').replace(/\r\n/g,'\n');
 const start=timeline.indexOf('create function go_booking_timeline_private.shift('),end=timeline.indexOf('end; $$;',start);
 if(start<0||end<0)throw Error('Missing canonical shift definition');
 const shift=timeline.slice(start,end+'end; $$;'.length).replace(/^create function/,'create or replace function');
 return renderBookingGapUpgrade().replace(/^begin;$/m,()=> 'begin;\n'+definitions+'\n'+shift+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('Usage: node scripts/render-booking-phase-upgrade.mjs <review-output.sql> (renders only)');
 writeFileSync(process.argv[2],renderBookingPhaseUpgrade());console.log('Phase upgrade rendered for review; no database contacted.');
}
