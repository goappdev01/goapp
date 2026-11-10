'use strict';
// This script runs on Metro's HTTP origin in Safari, not in the HTTPS panel or Windows.
const GODeviceProbe=(()=>{
  function target(raw,origin){const u=new URL(raw,origin);if(u.origin!==origin||u.username||u.password)throw Error('Recurso de otro entorno');return u.href;}
  async function download(raw,origin,headers={},limit=96*1024*1024){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
    try{const response=await fetch(target(raw,origin),{headers,signal:controller.signal,cache:'no-store',redirect:'error',credentials:'omit'});if(!response.ok)throw Error('HTTP '+response.status);const bytes=new Uint8Array(await response.arrayBuffer());if(!bytes.length||bytes.length>limit)throw Error('Respuesta vacía o demasiado grande');return bytes;}finally{clearTimeout(timer);}
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
  async function run(config,notify){
    const started=Date.now(),stages=[],origin=config.origin;
    async function phase(key,label,fn){const time=Date.now();let result;try{result={key,ok:true,bytes:0,count:0,...await fn(),elapsed_ms:Date.now()-time,error:''};}catch(e){result={key,ok:false,bytes:0,count:0,elapsed_ms:Date.now()-time,error:e.name==='AbortError'?'Tiempo de espera agotado':String(e.message).slice(0,120)};}stages.push(result);notify(label,result.ok);return result.ok;}
    await phase('document','Página de prueba recibida directamente desde 8089',async()=>({bytes:1,count:1}));
    let m,bundle;
    if(await phase('metro','Respuesta de Metro por Tailscale',async()=>{const b=await download('/status',origin,{},10000);if(!new TextDecoder().decode(b).includes('packager-status:running'))throw Error('Metro no responde correctamente');return{bytes:b.length,count:1};})){
      if(await phase('manifest','Manifiesto de Comprobaciones 8089',async()=>{const b=await download('/',origin,{'Accept':'application/expo+json','Expo-Platform':'ios'},1024*1024);m=manifest(b,config);return{bytes:b.length,count:1};})){
        if(await phase('bundle','Descarga completa del código iOS (sin ejecutarlo)',async()=>{const b=await download(m.launchAsset.url,origin);if(b.length<1000)throw Error('Bundle incompleto');bundle=new TextDecoder().decode(b);return{bytes:b.length,count:1};})){
          await phase('assets','Descarga de los recursos necesarios',async()=>{const paths=assets(bundle,origin);let index=0,total=0,count=0;await Promise.all(Array.from({length:4},async()=>{while(index<paths.length){const b=await download(paths[index++],origin,{},16*1024*1024);total+=b.length;count++;if(total>96*1024*1024)throw Error('Recursos superiores al límite');}}));return{bytes:total,count};});
        }
      }
      await phase('websocket','Canal de desarrollo (resultado separado)',()=>new Promise((resolve,reject)=>{const ws=new WebSocket(origin.replace('http:','ws:')+'/message'),timer=setTimeout(()=>{ws.close();reject(Error('Tiempo de espera agotado'));},6000);ws.onopen=()=>{clearTimeout(timer);ws.close();resolve({count:1});};ws.onerror=()=>{clearTimeout(timer);ws.close();reject(Error('Canal no accesible desde este navegador'));};}));
    }
    return{origin,browser_iphone:/iPhone/i.test(navigator.userAgent),stages,elapsed_ms:Date.now()-started};
  }
  return{target,assets,manifest,run};
})();
async function startGODeviceProbe(){
  const status=document.getElementById('status');
  try{
    const config=JSON.parse(decodeURIComponent(location.hash.slice(1)));history.replaceState(null,'',location.pathname);
    if(!/^[a-f0-9]{32}$/.test(config.id)||typeof config.nonce!=='string'||config.origin!==location.origin||location.port!=='8089'||!/^100\./.test(location.hostname))throw Error('Abre esta prueba desde el panel privado.');
    const back=new URL(config.return_url);if(back.protocol!=='https:'||!back.hostname.endsWith('.ts.net')||back.pathname!=='/remote/'||back.search||back.hash)throw Error('Destino de regreso no válido');
    status.textContent='Comprobando desde Safari. Puede tardar un minuto; mantén esta página abierta.';
    const report=await GODeviceProbe.run(config,(label,ok)=>{const li=document.createElement('li');li.textContent=label+': '+(ok?'correcto':'falló');document.getElementById('stages').append(li);});
    const payload={id:config.id,nonce:config.nonce,report};back.hash='device-result='+encodeURIComponent(JSON.stringify(payload));
    const link=document.getElementById('return');link.href=back.href;link.hidden=false;
    document.getElementById('diagnostic').textContent=JSON.stringify(report,null,2);
    status.textContent='Prueba terminada. Volviendo al panel para guardar el resultado del iPhone…';
    location.replace(back.href);
  }catch(e){status.textContent='No se ha completado esta prueba: '+e.message+' No demuestra un fallo de Expo Go.';}
}
if(typeof document!=='undefined')startGODeviceProbe();
