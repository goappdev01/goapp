import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,ts,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
export async function calendarSelectionFixture(source=fs.readFileSync('components/AgendaOperativa.tsx','utf8')){
  const block=source.slice(source.indexOf('  const [expandedBooking'),source.indexOf('  const [bookingMsgDraft'));
  if(!block)throw Error('Missing actual Calendar selection block');
  const projected=evaluate('hooks/useGoCalendarEntries.ts',{
    './useActionCompletion':{useCompletionDocument:()=>({doc:null})},
    '@/lib/goActionCompletion':{},
    '@/lib/goTaskAccess':{getTaskUser:async()=> 'owner',isPersonalTask:e=>e.type==='TAREA_INTERNA'},
    '@/lib/sessionEvents':{onSessionChanged:()=>()=>{}},
  });
  let snapshot,renders=0;
  const context={...React,React,useGoCalendarEntries:projected.useGoCalendarEntries,
    reservationCardPolicy:e=>({canonical:!!e.reservationId}),capture:s=>{snapshot=s;},count:()=>{if(++renders>80)throw Error('Calendar selection did not settle after 80 renders');}};
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`function Probe({entries}){count();const goLog=useGoCalendarEntries(entries);${block}
    capture({entry:expandedBookingItem,open:setExpandedBookingItem,projection:goLog});return React.createElement('div',null,expandedBookingItem?.id||'closed');}`,
    {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  const root=createRoot(document.createElement('div'));
  const settle=async fn=>React.act(async()=>{fn();for(let i=0;i<12;i++)await Promise.resolve();});
  return{get snapshot(){return snapshot;},get renders(){return renders;},
    render:entries=>settle(()=>root.render(React.createElement(context.Probe,{entries}))),
    open:entry=>settle(()=>snapshot.open(entry)),close:()=>settle(()=>root.unmount())};
}
