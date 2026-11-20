'use strict';
const $=id=>document.getElementById(id), remote=location.pathname==='/remote'||location.pathname.startsWith('/remote/'), base=remote?'/remote/v2':'/v2';
const legacy=remote?'/remote/legacy':'/legacy';
let state=null,orbitIndex=0,selected='factory',drag=null,hold=null,pending=null,requestId=0,powerBusy=false;
let accountReview=null, accountBusy=false, accountView=null, accountRequestId=0;
const metroProof={};
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
function note(text){$('notice').textContent=text;}
async function api(route,body){const r=await fetch(base+'/'+route,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-GO-CSRF':state.csrf}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.message||data.error||'No se pudo verificar la operación.');return data;}
function factoryMode(s){const wheel=s?.wheel||{};
  if(s?.reservation?.state==='recovery'||s?.reservation?.selected_team==='PC2')return ['blocked','BLOQUEADO'];
  if(wheel.enabled)return ['programming','ACTIVO'];
  if(!wheel.live_queue_authorized||wheel.account_rebind_required)return ['blocked','BLOQUEADO'];
  if(wheel.reason&&!['OWNER_PAUSED','WHEEL_PAUSED','CREDIT_LIMIT','WHEEL_CODEX_QUOTA'].includes(wheel.reason))return ['blocked','BLOQUEADO'];
  return ['pending','PAUSADO'];}
// Presentation only: retain the coordinator's blocked state and safety decisions.
function factoryOrbitMode(s){const [kind,label]=factoryMode(s);return [kind,kind==='blocked'?'PARADO':label];}
function actualModule(key){return state?.layout?.labels?.[key]||state?.registry?.[key]?.name||key;}
function orbitButton(key,index){const button=node('button',key?actualModule(key):'Vacío','sat'+(key?'':' empty')+(key===selected?' selected':''));button.dataset.slot=String(index);button.dataset.module=key||'';button.disabled=!key;button.type='button';button.setAttribute('aria-label',key?`${actualModule(key)}, órbita ${orbitIndex+1}, posición ${index+1}`:`Posición ${index+1} vacía`);
  if(key){button.onclick=()=>{if(drag)return;selected=key;render();};button.addEventListener('pointerdown',e=>beginHold(e,key));}return button;}
function renderOrbit(){const box=$('orbit');box.replaceChildren();const items=state.layout.layout[orbitIndex]||[];
  box.classList.toggle('account-orbit',orbitIndex===0);
  for(let i=0;i<7;i++){
    box.append(orbitButton(items[i],i));
    if(i===0&&orbitIndex===0){
      const account=node('button','Cuenta Codex','sat account-satellite');
      account.id='openCodexAccount';account.type='button';account.setAttribute('aria-haspopup','dialog');
      account.onclick=openAccount;box.append(account);
    }
  }
  box.setAttribute('aria-label',orbitIndex===0?'Órbita principal con Cuenta Codex y Otros':'Siete accesos y botón Otros');
  const other=node('button',drag?'OTRA ÓRBITA':'OTROS','sat other');other.dataset.slot='7';other.type='button';other.setAttribute('aria-label','OTROS, elegir órbita');other.onclick=()=>showArc();box.append(other);
  const mode=factoryOrbitMode(state.operational),go=node('button',`GO\n${mode[1]}`,'go '+mode[0]);go.style.whiteSpace='pre-line';go.disabled=powerBusy;go.setAttribute('aria-label',state.operational.wheel.enabled?'Pausar fábrica':'Activar fábrica');go.onclick=()=>factoryPower();box.append(go);
  $('factoryState').textContent=mode[1];$('factoryState').className='status '+(mode[0]==='programming'?'good':mode[0]==='blocked'?'bad':'warn');$('orbitTitle').textContent=`Órbita ${orbitIndex+1} de ${state.layout.layout.length}`;
  const chooser=$('orbitChooser');chooser.replaceChildren();state.layout.layout.forEach((_,i)=>{const b=node('button',String(i+1),i===orbitIndex?'active':'');b.setAttribute('aria-label','Mostrar órbita '+(i+1));b.onclick=()=>{orbitIndex=i;render();};chooser.append(b);});
}
function showAccountReason(text){const reason=$('accountReason');reason.textContent=text||'';reason.hidden=!text;}
function renderAccount(){
  const labels={linked:'Vinculada',pending:'Pendiente de confirmación',changed:'Sesión cambiada',blocked:'Bloqueada'};
  $('accountLinked').textContent=accountView?.linked||'Cuenta no identificada';
  $('accountDetected').textContent=accountView?.detected||'Cuenta no identificada';
  $('accountState').textContent=accountView?labels[accountView.state]||'Sin verificar':'Comprobando sesión…';
  $('accountState').className='status '+(accountView?.state==='linked'?'good':accountView?.state==='blocked'?'bad':'warn');
  $('accountBind').disabled=accountBusy||Boolean(accountReview)||!accountView?.can_bind;
  $('accountChange').disabled=accountBusy||Boolean(accountReview)||!accountView?.can_change;
  $('accountRefresh').disabled=accountBusy||Boolean(accountReview);
  $('accountApprove').disabled=accountBusy;
  $('accountCancel').disabled=accountBusy;
  $('accountConfirm').hidden=!accountReview;
}
async function loadAccount(){
  const id=++accountRequestId;
  try{
    const view=await api('account');
    if(id!==accountRequestId||!$('codexAccount').open)return;
    accountView=view;showAccountReason(view.reason);
  }catch(error){
    if(id!==accountRequestId||!$('codexAccount').open)return;
    accountView={state:'blocked'};showAccountReason(error.message);
  }
  renderAccount();
}
function openAccount(){
  accountView=null;accountReview=null;showAccountReason(null);
  $('codexAccount').showModal();renderAccount();loadAccount();
}
async function accountAction(fn){
  if(accountBusy)return;
  accountBusy=true;renderAccount();
  try{await fn();}
  catch(error){showAccountReason(error.message);}
  finally{accountBusy=false;renderAccount();}
}
$('accountBind').onclick=()=>accountAction(async()=>{
  const result=await api('preview',{action:'rebind'});
  if(!$('codexAccount').open)return;
  accountReview=result;
  const detected=result.detected_account||'Cuenta no identificada';
  const renamed=(result.review.pending||[]).filter(item=>item.title_update).length;
  const titleNote=renamed?' Se actualizará la referencia local de '+(renamed===1?'una tarjeta renombrada':renamed+' tarjetas renombradas')+'.':'';
  $('accountConfirmText').textContent='Vincular '+detected+'. La fábrica permanecerá pausada.'+titleNote;
  $('accountConfirm').hidden=false;
  $('accountApprove').disabled=false;
  $('accountApprove').focus();
});
$('accountApprove').onclick=()=>accountAction(async()=>{
  const {ticket,confirmation}=accountReview;
  accountReview=null;
  const result=await api('decide',{ticket,confirmation});
  await loadAccount();await refresh();note(result.message);
});
$('accountCancel').onclick=()=>{accountReview=null;renderAccount();$('accountBind').focus();};
$('accountRefresh').onclick=()=>accountAction(loadAccount);
$('accountChange').onclick=()=>accountAction(async()=>{
  const result=await api('change-account',{});
  await loadAccount();await refresh();showAccountReason(result.message);
});
$('codexAccount').addEventListener('close',()=>{
  ++accountRequestId;accountReview=null;$('openCodexAccount')?.focus();
});
function showArc(){const arc=$('arc');arc.replaceChildren();state.layout.layout.forEach((_,i)=>{const b=node('button','Órbita '+(i+1));b.dataset.orbitTarget=String(i);b.onclick=()=>{orbitIndex=i;arc.hidden=true;render();};arc.append(b);});if(state.layout.layout.length<12){const add=node('button','+ Nueva órbita');add.dataset.newOrbit=String(state.layout.layout.length);add.onclick=()=>{if(!drag){note('Para crear una órbita, mueve un acceso al símbolo +.');return;} };arc.append(add);}arc.hidden=false;}
function renderOptions(){const select=$('moduleSelect'),target=$('targetOrbit'),position=$('targetPosition');const old=select.value||selected;select.replaceChildren();for(const [key,value] of Object.entries(state.registry))select.append(new Option(value.name,key));select.value=old in state.registry?old:Object.keys(state.registry)[0];target.replaceChildren();state.layout.layout.forEach((_,i)=>target.append(new Option('Órbita '+(i+1),String(i))));if(state.layout.layout.length<12)target.append(new Option('+ Nueva órbita',String(state.layout.layout.length)));target.value=String(orbitIndex);position.replaceChildren();for(let i=0;i<7;i++)position.append(new Option('Posición '+(i+1),String(i)));if(document.activeElement!==$('visibleName'))$('visibleName').value=state.layout.labels?.[select.value]||state.registry[select.value]?.name||'';}
function line(parent,text,cls){parent.append(node('p',text,cls));}
function renderTeamSelection(box,op){
  const reservation=op.reservation||{};
  const label=node('label','Equipo para la próxima activación');
  const select=node('select');
  select.setAttribute('aria-label','Equipo de producción');
  select.append(new Option('PC1 — RAÚL','PC1'),new Option('PC2 — TESO','PC2'));
  select.value=reservation.selected_team||'PC1';
  select.disabled=Boolean(op.wheel.enabled||reservation.state==='producing');
  select.onchange=async()=>{select.disabled=true;try{await api('team',{team:select.value});await refresh();note('Equipo seleccionado; la cuenta Codex no se ha cambiado.');}catch(e){note(e.message);await refresh();}};
  label.append(select);box.append(label);
  line(box,'Equipo realmente activo: '+(reservation.active_team||'ninguno'));
  line(box,'Reserva: '+(reservation.state||'sin verificar'));
  line(box,'Último checkpoint confirmado: '+(reservation.last_checkpoint||'ninguno'));
  if(reservation.selected_team==='PC2')line(box,'PC2 requiere un ejecutor remoto autenticado antes de iniciar.','status warn');
  const stop=node('button','Detener fábrica');
  stop.disabled=!op.wheel.enabled&&reservation.state!=='producing';
  stop.onclick=async()=>{if(!window.confirm('¿Detener la fábrica y conservar los trabajos pendientes?'))return;stop.disabled=true;try{await api('stop',{confirmation:'DETENER FÁBRICA'});await refresh();note('Detención solicitada. La reserva solo se libera tras verificar trabajos y checkpoint.');}catch(e){note(e.message);await refresh();}};
  box.append(stop);
  if(['stopping','recovery'].includes(reservation.state)){
    const reconcile=node('button','Comprobar detención y reserva');
    reconcile.onclick=async()=>{if(!window.confirm('¿Comprobar que no quedan efectos ni trabajos activos antes de liberar la reserva?'))return;reconcile.disabled=true;try{await api('reconcile-reservation',{confirmation:'CONCILIAR RESERVA'});await refresh();note('Reserva conciliada. Los bloqueos de la cola permanecen hasta su propia verificación.');}catch(e){note(e.message);await refresh();}};
    box.append(reconcile);
  }
}
function renderPanel(){const key=selected,box=$('panelContent'),op=state.operational;box.replaceChildren();$('panelTitle').textContent=actualModule(key);$('v1Link').href=legacy;$('v1Link').textContent='Abrir controles existentes';
  if(key==='factory'){const mode=factoryMode(op);renderTeamSelection(box,op);line(box,'Estado real: '+mode[1],mode[0]==='programming'?'status good':mode[0]==='blocked'?'status bad':'status warn');line(box,'Trabajo actual: '+(op.wheel.current||'ninguno'));line(box,'Siguiente según la última COLA verificada: '+(op.wheel.next||'ninguno'));if(op.wheel.next_action)line(box,'Motivo: '+op.wheel.next_action,'muted');for(const skipped of (op.wheel.skipped||[]).slice(0,6))line(box,'Omitida: '+skipped.title+' · '+skipped.reason+' · permanece en COLA','muted');line(box,op.wheel.button?.reason_message||'Sin bloqueo global registrado.');}
  else if(key==='expo'){const launches=op.expo_launches||{};for(const [id,port,label] of [['main',8088,'COLA TERMINADA'],['owner',8089,'COMPROBACIONES']]){const item=launches.links?.[id],section=node('section',undefined,'module-line');section.append(node('h3',label+' · '+port));const fresh=Date.now()<Number(launches.expires_at||0)*1000,available=Boolean(item?.available&&fresh),proof=metroProof[port],proofFresh=available&&proof&&Date.now()-proof.checked_at*1000<90000&&(port!==8089||proof.expected_sha===op.expo?.sha);line(section,available?'TCP, manifiesto, bundle y recursos: verificados desde Windows.':'Servicio sin verificación vigente.',available?'status good':'status bad');line(section,'Versión esperada: '+(port===8089?op.expo?.sha||'sin configurar':proofFresh?proof.expected_sha:'MAIN publicado; comprobar SHA'));line(section,'Versión realmente servida: '+(proofFresh?proof.served_sha:'SHA sin verificación vigente.'));line(section,'Último diagnóstico: '+(launches.checked_at?new Date(launches.checked_at*1000).toLocaleString():'pendiente'));const verify=node('button','Comprobar código servido');verify.onclick=async()=>{verify.disabled=true;try{metroProof[port]=await api('verify/'+port);note('El código de '+port+' coincide con el SHA indicado. La apertura en iPhone sigue pendiente.');renderPanel();}catch(e){delete metroProof[port];note('No se verificó '+port+': '+e.message);renderPanel();}};section.append(verify);const link=node('a','ABRIR '+label+' · '+port,'action');link.setAttribute('aria-disabled',String(!available));if(available&&item?.url&&new URL(item.url).port===String(port))link.href=item.url;section.append(link);box.append(section);}line(box,'La descarga desde Windows no acredita que GO haya abierto en iPhone. Usa el diagnóstico Safari del panel V1.','muted');}
  else if(key==='agents'){line(box,'Cuenta y cuota del ejecutor: '+(op.quota?.state||'sin verificar'));line(box,'Trabajo Codex: '+(op.cards?.find(c=>c.state==='working')?.activity?.state||'ninguno'));}
  else if(key==='trello'||key==='reviews'){for(const c of op.cards||[])line(box,`${c.title} · ${c.state} · fase ${c.phase}`);if(!op.cards?.length)line(box,'No hay lote verificado en esta vista.');}
  else if(key==='system'){const sys=state.system||{};line(box,'Puente: '+op.version+' · '+new Date(op.updated).toLocaleString());for(const [title,value] of [['GitHub',sys.github],['Railway / API',sys.railway_api],['Supabase',sys.supabase],['Tailscale',sys.tailscale]])line(box,title+': '+(value||'sin verificar'));line(box,'Última lectura: '+(sys.checked_at?new Date(sys.checked_at*1000).toLocaleString():'pendiente'));}
  else if(key==='guide'){line(box,'Pulsa GO para abrir la guía contextual. El mapa de órbitas se lee al responder.');}
  else if(key==='diagnostics'){const d=op.device_diagnostics||{};line(box,'Última prueba Safari: '+(d.browser?.state||'sin registro'));line(box,'Último intento de apertura: '+(d.launch?.state||'sin registro'));line(box,'El diagnóstico de Windows y la carga real en iPhone son comprobaciones distintas.');}
  else if(key==='permissions'){for(const c of op.cards||[])line(box,`${c.title}: ${c.state} · publicación ${c.publication_state} · comentario ${c.comment_state} · traslado ${c.move_state}`);if(!op.cards?.length)line(box,'No hay autorizaciones de lote en esta vista.');}
  else if(key==='history'){for(const c of (op.cards||[]).filter(c=>c.state==='closed'))line(box,c.title+' · MAIN '+(c.published||'sin SHA confirmado'));if(!(op.cards||[]).some(c=>c.state==='closed'))line(box,'Sin tarjetas cerradas en el lote visible.');}
  $('technical').textContent=JSON.stringify({updated:op.updated,version:op.version,orbit:orbitIndex+1,module:key,expo:op.expo_launches?.links?.[key==='expo'?'owner':'main']?.diagnostic||null},null,2);
}
function render(){if(!state||drag)return;if(orbitIndex>=state.layout.layout.length)orbitIndex=state.layout.layout.length-1;renderOrbit();renderOptions();renderPanel();$('connection').textContent='Estado confirmado: '+new Date(state.operational.updated).toLocaleTimeString();}
async function refresh(){if(drag||powerBusy)return;const id=++requestId;try{const next=await api('state');if(id!==requestId||powerBusy)return;state=next;render();}catch(e){if(id!==requestId||powerBusy)return;state=null;$('connection').textContent='Sin conexión; estado operativo no verificado.';const go=node('div','GO\nPARADO','go blocked');go.style.whiteSpace='pre-line';$('orbit').replaceChildren(go);$('panelContent').replaceChildren(node('p','No se muestran controles con datos antiguos.'));$('factoryState').textContent='PARADO';$('factoryState').className='status bad';note(e.message);}}
async function move(module,toOrbit,toPosition){try{await api('move',{revision:state.layout.revision,module,orbit:toOrbit,position:toPosition});note('Acceso movido. No se han cambiado permisos ni trabajos.');orbitIndex=toOrbit;await refresh();}catch(e){note(e.message);await refresh();}}
async function factoryPower(){if(powerBusy||!state)return;powerBusy=true;++requestId;const enable=!Boolean(state.operational.wheel.enabled);note(enable?'Activando fábrica…':'Pausando fábrica…');const go=$('orbit').querySelector('.go');if(go){go.disabled=true;go.setAttribute('aria-busy','true');}$('factoryState').textContent=enable?'ACTIVANDO':'PAUSANDO';$('factoryState').className='status warn';try{const result=await api('power',{enabled:enable});powerBusy=false;await refresh();note(state?.operational?.wheel?.enabled?'Fábrica activada.':result.message||state?.operational?.wheel?.button?.reason_message||'Fábrica pausada.');}catch(e){powerBusy=false;await refresh();note(e.message);}}
function beginHold(event,module){if(event.button!==0&&event.pointerType==='mouse')return;const origin={x:event.clientX,y:event.clientY,id:event.pointerId,module};clearTimeout(hold);pending=origin;hold=setTimeout(()=>{drag=origin;pending=null;const ghost=$('ghost');ghost.textContent=actualModule(module);ghost.hidden=false;ghost.style.left=(origin.x-45)+'px';ghost.style.top=(origin.y-25)+'px';$('orbit').querySelector('[data-slot="7"]').textContent='OTRA ÓRBITA';note('Arrastra a una posición o a OTRA ÓRBITA. Suelta fuera para cancelar.');},450);}
document.addEventListener('pointermove',event=>{if(pending&&Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>12){clearTimeout(hold);hold=null;pending=null;}if(!drag)return;const ghost=$('ghost');ghost.style.left=(event.clientX-45)+'px';ghost.style.top=(event.clientY-25)+'px';const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot],[data-orbit-target],[data-new-orbit]');if(target?.dataset.slot==='7'&&$('arc').hidden)showArc();});
document.addEventListener('pointerup',event=>{clearTimeout(hold);hold=null;pending=null;if(!drag)return;const item=drag;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot],[data-orbit-target],[data-new-orbit]');drag=null;$('ghost').hidden=true;$('arc').hidden=true;if(target?.dataset.newOrbit!==undefined)move(item.module,Number(target.dataset.newOrbit),0);else if(target?.dataset.orbitTarget!==undefined)move(item.module,Number(target.dataset.orbitTarget),0);else if(target?.dataset.slot!==undefined&&Number(target.dataset.slot)<7)move(item.module,orbitIndex,Number(target.dataset.slot));else note('Movimiento cancelado; no se cambió ninguna órbita.');render();});
document.addEventListener('pointercancel',()=>{clearTimeout(hold);hold=null;pending=null;drag=null;$('ghost').hidden=true;$('arc').hidden=true;note('Movimiento cancelado.');render();});
$('move').onclick=()=>move($('moduleSelect').value,Number($('targetOrbit').value),Number($('targetPosition').value));
$('moduleSelect').onchange=()=>{$('visibleName').value=state.layout.labels?.[$('moduleSelect').value]||state.registry[$('moduleSelect').value]?.name||'';};
async function configure(label,remove){try{await api('configure',{revision:state.layout.revision,module:$('moduleSelect').value,label,remove});note(remove?'Acceso quitado de la órbita. Sus permisos permanecen iguales.':'Nombre visible actualizado.');await refresh();}catch(e){note(e.message);await refresh();}}
$('rename').onclick=()=>configure($('visibleName').value,false);
$('remove').onclick=()=>configure(null,true);
$('ask').onclick=()=>{if(!state)return;const query=$('question').value.trim().toLocaleLowerCase(),entries=state.layout.layout.flatMap((items,i)=>items.map((key,j)=>({key,i,j,name:actualModule(key)})));let match=entries.find(e=>query.includes(e.name.toLocaleLowerCase())||query.includes(e.key))||entries.find(e=>(query.includes('8088')||query.includes('8089')||query.includes('metro'))&&e.key==='expo')||entries.find(e=>e.key==='factory');$('copilotAnswer').textContent=!query?'Escribe qué función quieres localizar.':match?`Órbita ${match.i+1}, posición ${match.j+1}: pulsa «${match.name}». Allí verás su estado actual. El botón GO central activa o pausa la fábrica con una pulsación.`:'Ese acceso no está colocado. Usa «Organizar accesos» para añadirlo.';};
refresh();setInterval(()=>{if(!document.hidden)refresh();},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
