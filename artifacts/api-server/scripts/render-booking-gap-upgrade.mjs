import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const drafts=fileURLToPath(new URL('../supabase/drafts/',import.meta.url));
/** Render reviewed source definitions; never connect to or migrate a database. */
export function renderBookingGapUpgrade(){
 const helpers=readFileSync(path.join(drafts,'booking_gap_policy_v1.sql'),'utf8').replace(/\r\n/g,'\n');
 const timeline=readFileSync(path.join(drafts,'booking_timeline_v1.sql'),'utf8').replace(/\r\n/g,'\n');
 const definitions=['plan','availability','lock_configuration'].map(name=>{
  const start=timeline.indexOf(`create function go_booking_timeline_private.${name}(`);
  if(start<0)throw new Error('Missing canonical definition: '+name);
  const end=timeline.indexOf('end; $$;',start);
  if(end<0)throw new Error('Incomplete canonical definition: '+name);
  return timeline.slice(start,end+'end; $$;'.length).replace(/^create function/,'create or replace function');
 });
 if(!/^begin;$/m.test(helpers)||!/^commit;\s*$/m.test(helpers))throw new Error('Expected transactional helper source');
 return '-- REVIEW ONLY: atomic upgrade of an EXISTING booking_timeline_v1 installation.\n'
  +'-- Generated from canonical source; no booking rows, prices or historical snapshots are rewritten.\n'
  +helpers.replace(/^begin;$/m,'begin;').replace(/^commit;\s*$/m,()=>definitions.join('\n\n')+"\nnotify pgrst, 'reload schema';\ncommit;\n");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output)throw new Error('Usage: node scripts/render-booking-gap-upgrade.mjs <review-output.sql> (renders only)');
 writeFileSync(output,renderBookingGapUpgrade());
 console.log('Review SQL rendered. No database was contacted.');
}
