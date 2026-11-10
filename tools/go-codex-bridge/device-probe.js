'use strict';
// Runs in Safari on the phone. Every network operation is bounded; Windows never proxies these checks.
const GODeviceProbe=(()=>{
  const TOTAL_MS=75000,REQUEST_MS=12000;
  function target(raw,origin){const u=new URL(raw,origin);if(u.origin!==origin||u.username||u.password)throw Error('Recurso de otro entorno');return u.href;}
  async function readResponse(response,limit,signal){
    if(!response.ok)throw Error('HTTP '+response.status);
    const reader=response.body?.getReader();if(!reader)throw Error('Safari no permite leer la respuesta por partes');
    const chunks=[];let size=0;
    while(true){if(signal.aborted)throw Error('Tiempo total agotado');const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw Error('Respuesta superior al límite');}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
  }
  async function download(raw,origin,headers={},limit=96*1024*1024,globalSignal){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(REQUEST_MS,Math.max(1,globalSignal.deadline-Date.now())));
    const cancel=()=>controller.abort();globalSignal.signal.addEventListener('abort',cancel,{once:true});
    try{const response=await fetch(target(raw,origin),{headers,signal:controller.signal,cache:'no-store',redirect:'error',credentials:'omit'});return await readResponse(response,limit,globalSignal.signal);}
    catch(e){if(globalSignal.signal.aborted)throw Error('Tiempo total de prueba agotado');if(controller.signal.aborted)throw Error('Tiempo agotado en esta solicitud');throw e;}
    finally{clearTimeout(timer);globalSignal.signal.removeEventListener('abort',cancel);}
  }
  function assets(bundle,origin){
    const result=new Set();
    for(const match of bundle.matchAll(/\.registerAsset\((\{[\s\S]*?\})\s*\)/g)){
      let a;try{a=JSON.parse(match[1]);}catch{continue;}if(!a.__packager_asset)continue;
      if(typeof a.name!=='string'||/[\\/]/.test(a.name)||!/^[a-zA-Z0-9]+$/.test(a.type)||!Array.isArray(a.scales)||!a.scales.length)throw Error('Recurso no válido');
      const scale=a.scales.includes(1)?1:Math.min(...a.scales),file=a.name+(scale===1?'':'@'+scale+'x')+'.'+a.type;
      const u=new URL(target(a.httpServerLocation,origin));if(!u.pathname.startsWith('/assets/'))throw Error('Recurso ajeno a Metro');
      if(u.searchParams.has('unstable_path'))u.searchParams.set('unstable_path',u.searchParams.get('unstable_path').replace(/\/$/,'')+'/'+file);else u.pathname=u.pathname.replace(/\/$/,'')+'/'+encodeURIComponent(file);
      u.searchParams.set('platform','ios');u.searchParams.set('hash',a.hash);result.add(u.href);
    }
    if(!result.size||result.size>128)throw Error('No se han podido enumerar los recursos iOS');return [...result];
  }
  function manifest(bytes,config){
    const m=JSON.parse(new TextDecoder().decode(bytes)),c=m.extra.expoClient,g=m.extra.expoGo;
    if(c.name!==config.expected_name||c.sdkVersion!=='58.0.0'||'http://'+c.hostUri!==config.origin||'http://'+g.debuggerHost!==config.origin)throw Error('El manifiesto anuncia otro entorno');
    const u=new URL(target(m.launchAsset.url,config.origin));if(!u.pathname.endsWith('.bundle')||u.searchParams.get('platform')!=='ios')throw Error('Bundle iOS no válido');return m;
  }
  async function run(config,notify,storage=globalThis.localStorage){
    const started=Date.now(),stages=[],origin=config.origin,globalSignal=new AbortController();globalSignal.deadline=started+TOTAL_MS;
    const timeLimit=setTimeout(()=>globalSignal.abort(),TOTAL_MS);
    function persist(state='running'){try{storage?.setItem('go-iphone-8089-diagnostic',JSON.stringify({state,origin,elapsed_ms:Date.now()-started,stages}));}catch{}}
    async function phase(key,label,fn){
      if(globalSignal.signal.aborted){const result={key,ok:false,bytes:0,count:0,elapsed_ms:0,error:'No ejecutada: se agotó el tiempo total'};stages.push(result);persist();notify(label,'no verificable');return false;}
      const time=Date.now();notify(label,'en curso');let result;
      try{result={key,ok:true,bytes:0,count:0,...await fn(),elapsed_ms:Date.now()-time,error:''};}
      catch(e){const error=String(e.message||e).slice(0,120);result={key,ok:false,bytes:0,count:0,elapsed_ms:Date.now()-time,error};}
      stages.push(result);persist();notify(label,result.ok?'correcto':/agotado|agotó|Tiempo/i.test(result.error)?'agotado el tiempo':'fallido');return result.ok;
    }
    try{
      await phase('document','Página de diagnóstico recibida de 8089',async()=>({bytes:1,count:1}));
      let m,bundle;
      const metro=await phase('metro','Respuesta de Metro por Tailscale',async()=>{const b=await download('/status',origin,{},10000,globalSignal);if(!new TextDecoder().decode(b).includes('packager-status:running'))throw Error('Metro no responde correctamente');return{bytes:b.length,count:1};});
      if(metro){
        const manifestOk=await phase('manifest','Manifiesto Expo iOS de 8089',async()=>{const b=await download('/',origin,{'Accept':'application/expo+json','Expo-Platform':'ios'},1024*1024,globalSignal);m=manifest(b,config);return{bytes:b.length,count:1};});
        if(manifestOk){
          const bundleOk=await phase('bundle','Descarga del bundle iOS (no se ejecuta)',async()=>{const b=await download(m.launchAsset.url,origin,{},96*1024*1024,globalSignal);if(b.length<1000)throw Error('Bundle incompleto');bundle=new TextDecoder().decode(b);return{bytes:b.length,count:1};});
          if(bundleOk)await phase('assets','Recursos iOS de la aplicación',async()=>{const paths=assets(bundle,origin);let index=0,total=0,count=0;const failures=[];await Promise.all(Array.from({length:4},async()=>{while(index<paths.length&&!globalSignal.signal.aborted){const path=paths[index++];try{const b=await download(path,origin,{},16*1024*1024,globalSignal);total+=b.length;count++;}catch(e){failures.push(String(e.message||e).slice(0,80));}}}));if(failures.length)throw Error(failures[0]);if(globalSignal.signal.aborted)throw Error('Tiempo total agotado al revisar recursos');return{bytes:total,count};});
        }
        await phase('websocket','Canal WebSocket de desarrollo',()=>new Promise((resolve,reject)=>{const ws=new WebSocket(origin.replace('http:','ws:')+'/message'),cancel=()=>{ws.close();reject(Error('Tiempo total agotado'));},timer=setTimeout(()=>{ws.close();reject(Error('Tiempo agotado en WebSocket'));},Math.min(5000,Math.max(1,globalSignal.deadline-Date.now())));globalSignal.signal.addEventListener('abort',cancel,{once:true});ws.onopen=()=>{clearTimeout(timer);globalSignal.signal.removeEventListener('abort',cancel);ws.close();resolve({count:1});};ws.onerror=()=>{clearTimeout(timer);globalSignal.signal.removeEventListener('abort',cancel);ws.close();reject(Error('WebSocket inaccesible desde Safari'));};}));
      }
      return{origin,browser_iphone:/iPhone/i.test(navigator.userAgent),stages,elapsed_ms:Date.now()-started};
    }finally{clearTimeout(timeLimit);}
  }
  function current(storage=globalThis.localStorage){try{return JSON.parse(storage?.getItem('go-iphone-8089-diagnostic')||'null');}catch{return null;}}
  return{target,assets,manifest,run,current};
})();
async function startGODeviceProbe(){
  const status=document.getElementById('status'),items=document.getElementById('stages'),diagnostic=document.getElementById('diagnostic');
  function paint(){const saved=GODeviceProbe.current();if(!saved)return;items.replaceChildren();for(const s of saved.stages||[]){const li=document.createElement('li');li.textContent=s.key+': '+(s.ok?'correcto':s.error||'fallido')+' ('+s.elapsed_ms+' ms)';items.append(li);}diagnostic.textContent=JSON.stringify(saved,null,2);}
  document.getElementById('copy').onclick=async()=>{paint();try{await navigator.clipboard.writeText(diagnostic.textContent);status.textContent='Diagnóstico copiado. Incluye únicamente resultados técnicos.';}catch{status.textContent='No se pudo copiar; el diagnóstico permanece visible para seleccionarlo.';}};
  const saved=GODeviceProbe.current();if(saved?.state==='running'){paint();status.textContent='Se recuperaron las fases guardadas antes de salir o interrumpirse Safari.';}
  try{
    const config=JSON.parse(decodeURIComponent(location.hash.slice(1)));history.replaceState(null,'',location.pathname);
    if(!/^[a-f0-9]{32}$/.test(config.id)||typeof config.nonce!=='string'||config.origin!==location.origin||location.port!=='8089'||!/^100\./.test(location.hostname))throw Error('Abre esta prueba desde el panel privado.');
    const back=new URL(config.return_url);if(back.protocol!=='https:'||!back.hostname.endsWith('.ts.net')||back.pathname!=='/remote/'||back.search||back.hash)throw Error('Destino de regreso no válido');
    status.textContent='Safari está probando 8089. Límite total: 75 segundos. Cada paso mostrará su estado.';
    const returnLink=document.getElementById('return');back.hash='';returnLink.href=back.href;returnLink.hidden=false;
    const report=await GODeviceProbe.run(config,(label,state)=>{status.textContent=label+' · '+state;const li=document.createElement('li');li.textContent=label+': '+state;li.dataset.state=state;items.append(li);});
    const final={...report,summary:report.stages.every(x=>x.ok)?'complete':'partial'};
    try{localStorage.setItem('go-iphone-8089-diagnostic',JSON.stringify({state:final.summary,...final}));}catch{}
    paint();status.textContent=final.summary==='complete'?'Safari terminó las comprobaciones de red. Expo Go aún no está verificado.':'Safari terminó con fases fallidas o incompletas. Expo Go aún no está verificado.';
    const payload={id:config.id,nonce:config.nonce,report:report};back.hash='device-result='+encodeURIComponent(JSON.stringify(payload));returnLink.href=back.href;
    location.replace(back.href);
  }catch(e){paint();status.textContent='Diagnóstico interrumpido: '+e.message+'. Las fases guardadas siguen disponibles para copiarlas.';}
}
if(typeof document!=='undefined')startGODeviceProbe();
