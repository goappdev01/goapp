/** Development-only, bounded numeric evidence from actual native callbacks.
 * No identities, dates, content, storage, network, timers or gesture changes. */
type DragSample = { phase: "start"|"edge"|"request"|"native"|"finish"; [key:string]: number|boolean|string|undefined };
const samples: (DragSample & {at:number})[] = [];
const last = new Map<string,number>();
export function traceCalendarDrag(sample:DragSample) {
  if(typeof __DEV__ === "undefined" || !__DEV__)return;
  const at=Date.now();
  if(sample.phase!=="start" && sample.phase!=="finish" && at-(last.get(sample.phase) ?? -Infinity)<100)return;
  last.set(sample.phase,at);
  samples.push({...sample,at});if(samples.length>480)samples.shift();
  (globalThis as typeof globalThis & {__GO_CALENDAR_DRAG_TRACE__?:()=>unknown}).__GO_CALENDAR_DRAG_TRACE__=()=>samples.map(row=>({...row}));
}
