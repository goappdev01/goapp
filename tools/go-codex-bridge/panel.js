"use strict";
let csrf = "", state = null, snapshot = null, selectedJob = null, operation = null, publication = null;
const el = id => document.getElementById(id);
function notice(text) { el("notice").textContent = text; }
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json", "X-GO-CSRF": csrf },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || "No se ha completado la operación.");
  return data;
}
async function action(button, callback) {
  button.disabled = true;
  try { await callback(); } catch (error) { notice(error.message); } finally { button.disabled = false; syncActions(); }
}
async function refresh() {
  state = await api("/api/status"); csrf = state.csrf;
  el("chatgptEntry").hidden = !state.chatgpt_local_entry;
  const receiver = state.receiver || {configured:false,enabled:false};
  el("receiverPanel").hidden = !state.receiver;
  el("receiverState").textContent = JSON.stringify(receiver, null, 2);
  el("receiverToggle").disabled = !receiver.configured;
  el("receiverToggle").textContent = receiver.enabled ? "Desactivar recepción" : "Activar recepción";
  el("receiverCheck").disabled = !receiver.enabled;
  el("receiverConfigure").disabled = receiver.configured;
  const factory = state.factory || {enabled:false,attempts:[],blocked:[]};
  el("status").textContent = state.oauth + " · Puerto local " + state.port
    + " · Agente operativo 4";
  renderWheel(factory.wheel);
  el("factoryActivate").disabled = factory.enabled;
  el("factoryPause").disabled = !factory.enabled;
  el("factoryCheck").disabled = false;
  const current = factory.current;
  const pending = factory.queue_preview || [];
  const blocked = factory.blocked || [];
  const last = factory.attempts?.[0];
  const details = row => { try { return JSON.parse(row?.detail || "{}"); } catch { return {}; } };
  el("factoryState").textContent = [
    "Estado: " + (factory.state || "PAUSADA"),
    "Vigilancia: " + (factory.enabled ? "ACTIVA · solo lectura y preparación" : "PAUSADA"),
    "Esta vigilancia solo lee y prepara. La rueda de tarjetas preautorizadas se controla por separado.",
    "Etapas: " + Object.entries(factory.states || {}).filter(([,active]) => active).map(([name]) => name).join(" · "),
    "Pausa: " + (factory.pause_reason || "ninguna"),
    "Última comprobación: " + (factory.checked || "todavía no realizada"),
    "Tarea actual: " + (current ? current.title + " · intento " + current.attempt : "ninguna"),
    "Agente: " + (current ? (details(current).agent || "pendiente de registro") : "ninguno"),
    "Inicio real: " + (current?.started || "—"),
    "Fin real: " + (current?.finished || "—"),
    "Últimas pruebas: " + (details(last).tests?.length || 0) + " registradas",
    "Última publicación: " + (details(last).main_sha || "sin verificar"),
    "Estado Metro: " + (details(last).metro || "sin verificar"),
    "Próximos pendientes: " + (pending.length ? pending.map(x => x.title).join(" | ") : "sin lectura de cola"),
    "Bloqueados: " + (blocked.length ? blocked.map(x => x.title + " (intento " + x.attempt + ")").join(" | ") : "ninguno")
  ].join("\n");
  el("factoryHistory").textContent = JSON.stringify(factory.attempts || [], null, 2);
  el("agentsInfo").textContent = JSON.stringify(state.agents, null, 2);
  el("jobs").replaceChildren();
  for (const job of state.jobs) {
    const button = document.createElement("button"); button.className = "secondary";
    button.textContent = job.agent + " · " + jobLabel(job.state) + " · " + job.id.slice(0, 8);
    button.addEventListener("click", () => action(button, () => loadJob(job.id)));
    el("jobs").append(button);
  }
  el("operations").textContent = JSON.stringify(state.operations, null, 2);
  for (const id of ["agent", "chatgptAgent", "mapAgent"]) {
    for (const option of el(id).options) option.disabled = option.value !== "4";
    el(id).value = "4";
  }
  el("testPrepare").disabled = true;
}
function jobLabel(value) {
  return ({completed: "Completada según Codex · sin verificación independiente", blocked: "BLOQUEADA",
    failed: "FALLIDA", needs_review: "REQUIERE REVISIÓN"})[value] || value;
}
async function loadJob(id) {
  selectedJob = await api("/api/job?id=" + encodeURIComponent(id));
  el("jobInfo").textContent = JSON.stringify({ id: selectedJob.id, state: selectedJob.state, interpretation: jobLabel(selectedJob.state), agent: selectedJob.data.agent,
    prepared_at: selectedJob.created, origin: selectedJob.data.source?.source || (selectedJob.data.source?.card_id ? "TRELLO" : "LOCAL"),
    destination: selectedJob.data.agent_settings, source: selectedJob.data.source, instruction_sha256: selectedJob.data.instruction_sha256 }, null, 2);
  el("instruction").value = selectedJob.data.instruction;
  el("jobResult").textContent = JSON.stringify(selectedJob.result, null, 2);
  el("execute").disabled = selectedJob.state !== "prepared" || selectedJob.data.agent !== "4";
  publication = null; el("publish").disabled = true; el("publicationInfo").textContent = "";
  el("publicationPreview").disabled = selectedJob.state !== "completed";
  el("factoryComment").disabled = selectedJob.state !== "completed" || selectedJob.data.source?.source !== "verified-queue";
  el("factoryMove").disabled = el("factoryComment").disabled;
  el("reloadJob").disabled = false;
}
el("clientForm").addEventListener("submit", event => { event.preventDefault(); action(event.submitter, async () => {
  try {
    await api("/api/configure-client", {client_id: el("clientId").value, client_secret: el("clientSecret").value});
    notice("Configuración guardada con DPAPI. Ahora pulsa Conectar Trello y autoriza en Atlassian.");
  } finally { el("clientSecret").value = ""; el("clientId").value = ""; }
  await refresh();
}); });
el("connect").addEventListener("click", event => action(event.target, async () => {
  const popup = window.open("about:blank", "go-puente-atlassian");
  try {
    const result = await api("/api/connect", {});
    notice("Autoriza la aplicación existente en la pestaña de Atlassian. No introduzcas contraseñas ni secretos en este chat.");
    if (popup) popup.location.href = result.authorization_url;
    else { const link = document.createElement("a"); link.href = result.authorization_url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = "Abrir autorización de Atlassian"; el("notice").append(document.createElement("br"), link); }
  } catch (error) { if (popup) popup.close(); throw error; }
  await refresh();
}));
el("read").addEventListener("click", event => action(event.target, async () => {
  snapshot = await api("/api/read", {url: el("cardUrl").value});
  const data = snapshot.data;
  el("cardSummary").textContent = data.card.name + " · " + data.comments.length + " comentarios completos · Copia: " + snapshot.snapshot
    + (data.verification.stable_during_read ? " · Sin cambios durante la lectura." : " · La tarjeta cambió durante la lectura: vuelve a leerla antes de ejecutar.");
  el("comment").replaceChildren();
  for (const comment of data.comments) { const option = document.createElement("option"); option.value = comment.id; option.textContent = (comment.date || "") + " · " + comment.text.length + " caracteres"; el("comment").append(option); }
  const candidates = [...new Set((data.card.name.match(/AGENTE\s*[1-5]/gi) || []).map(text => text.match(/[1-5]/)[0]))];
  if (candidates.length === 1) el("agent").value = candidates[0];
  showComment(); el("prepare").disabled = !data.comments.length;
  el("targetCard").value = data.card.id;
  const lists = await api("/api/board-lists", {board_id: data.card.idBoard}); el("targetList").replaceChildren();
  for (const list of lists) { const option = document.createElement("option"); option.value = list.id; option.textContent = list.name; el("targetList").append(option); }
  notice("Lectura y copia verificadas. No se ha ejecutado Codex ni modificado Trello.");
}));
function showComment() { const item = snapshot?.data.comments.find(x => x.id === el("comment").value); el("commentText").value = item?.text || ""; }
el("comment").addEventListener("change", showComment);
el("prepare").addEventListener("click", event => action(event.target, async () => {
  if (!snapshot) throw Error("Lee primero una tarjeta.");
  const job = await api("/api/prepare", {snapshot: snapshot.snapshot, comment_id: el("comment").value, agent: el("agent").value});
  await loadJob(job.id); await refresh(); notice("Instrucción preparada. Todavía no se ha ejecutado.");
}));
function previewChatgpt() {
  const instruction = el("chatgptInstruction").value, bytes = new TextEncoder().encode(instruction).length;
  const reference = el("chatgptCardUrl").value.trim();
  el("chatgptPrepare").disabled = !instruction.trim() || bytes > 1048576;
  el("chatgptPreview").textContent = "Origen: CHATGPT (pegado local) · Agente: " + el("chatgptAgent").value
    + " · Tamaño: " + bytes + "/1048576 bytes" + (reference ? " · Referencia: " + reference : "")
    + "\n\n" + (instruction.slice(0, 1200) || "Escribe una instrucción para revisar su contenido y destino.")
    + (instruction.length > 1200 ? "\n… La instrucción íntegra se revisa antes de autorizar." : "");
}
for (const id of ["chatgptInstruction", "chatgptAgent", "chatgptCardUrl"]) el(id).addEventListener("input", previewChatgpt);
previewChatgpt();
el("chatgptPrepare").addEventListener("click", event => action(event.target, async () => {
  const job = await api("/api/prepare-chatgpt", {instruction: el("chatgptInstruction").value,
    agent: el("chatgptAgent").value, trello_card_url: el("chatgptCardUrl").value.trim()});
  await loadJob(job.id); await refresh();
  el("chatgptState").textContent = "Trabajo " + job.id + " · " + jobLabel(job.state) + " · No ejecutado por esta acción.";
  notice(job.state === "prepared" ? "Instrucción local preparada. Revisa el destino antes de autorizarla." :
    "La instrucción ya estaba registrada. No se ha creado ni iniciado otra ejecución.");
}));
el("testPrepare").addEventListener("click", event => action(event.target, async () => {const job = await api("/api/test-prepare", {}); await loadJob(job.id); await refresh();}));
el("receiverConfigure").addEventListener("click", event => action(event.target, async () => {
  const card_url=el("receiverCard").value.trim(), author_id=el("receiverAuthor").value.trim();
  if (!window.confirm("Fijar exclusivamente esta tarjeta y este autor para recepción futura?\n"+card_url+"\nAutor: "+author_id+"\nLos comentarios actuales se ignorarán.")) return;
  await api("/api/receiver/configure", {card_url, author_id, confirmation:"AUTORIZO TARJETA RECEPTORA"});
  await refresh(); notice("Tarjeta fijada. La recepción sigue desactivada.");
}));
el("receiverToggle").addEventListener("click", event => action(event.target, async () => {
  const enabled=!state.receiver.enabled;
  if (!window.confirm((enabled?"Activar":"Desactivar")+" recepción de la tarjeta verificada? No se ejecutarán tareas automáticamente.")) return;
  await api("/api/receiver/toggle", {enabled, confirmation:"AUTORIZO RECEPCION"});
  await refresh(); notice(enabled?"Recepción activada; solo se prepararán trabajos nuevos.":"Recepción desactivada.");
}));
el("receiverCheck").addEventListener("click", event => action(event.target, async () => {
  const result=await api("/api/receiver/check", {}); await refresh();
  notice("Comprobación terminada. Trabajos preparados: "+result.prepared.length+". Ninguna ejecución iniciada.");
}));
el("factoryActivate").addEventListener("click", event => action(event.target, async () => {
  if (!window.confirm("VIGILAR COLA: solo lectura de Trello y preparación local del agente 4. NO ejecuta Codex, NO publica y NO modifica tarjetas. ¿Iniciar vigilancia?")) return;
  await api("/api/factory/toggle", {enabled:true, confirmation:"VIGILAR COLA SIN EJECUTAR"});
  await refresh();
  notice("Vigilancia activa. Toda ejecución necesita una autorización individual adicional.");
}));
el("factoryPause").addEventListener("click", event => action(event.target, async () => {
  if (!window.confirm("Pausar la vigilancia? Esto no interrumpe una ejecución ya autorizada.")) return;
  await api("/api/factory/toggle", {enabled:false, confirmation:"VIGILAR COLA SIN EJECUTAR"});
  await refresh();
  notice("Fábrica pausada.");
}));
el("factoryCheck").addEventListener("click", event => action(event.target, async () => {
  const result = await api("/api/factory/check", {});
  await refresh();
  notice(JSON.stringify(result));
}));
el("execute").addEventListener("click", event => action(event.target, async () => {
  if (!selectedJob || selectedJob.state !== "prepared") throw Error("Selecciona una instrucción preparada.");
  const preview = await api("/api/execution-preview", {job:selectedJob.id,allow_dirty:el("allowDirty").checked});
  el("jobInfo").textContent = JSON.stringify(preview,null,2);
  if (!window.confirm("AUTORIZAR SOLO ESTA EJECUCIÓN\n\n" + JSON.stringify(preview.payload,null,2) + "\n\nHuella: " + preview.sha256 + "\nNo autoriza publicación ni escrituras Trello. ¿Confirmar?")) return;
  await api("/api/execute", {job:selectedJob.id,allow_dirty:el("allowDirty").checked,allow_publish:false,preview:preview.id,confirmation:"AUTORIZO ESTA EJECUCION"});
  await loadJob(selectedJob.id); await refresh(); notice("Ejecución iniciada. El resultado y sus errores se conservarán; no se repetirá automáticamente.");
}));
el("reloadJob").addEventListener("click", event => action(event.target, async () => {if(selectedJob)await loadJob(selectedJob.id); await refresh();}));
el("saveAgent").addEventListener("click", event => action(event.target, async () => {
  await api("/api/agent", {agent: el("mapAgent").value, workspace: el("workspace").value, sandbox: el("mapSandbox").value, enabled: el("mapEnabled").checked});
  await refresh(); notice("Asignación local guardada; no se ha ejecutado ninguna tarea.");
}));
el("mapAgent").addEventListener("change", () => {const agent=state.agents[el("mapAgent").value]; el("workspace").value=agent.workspace; el("mapSandbox").value=agent.sandbox; el("mapEnabled").checked=agent.enabled;});
el("useResult").addEventListener("click", () => {if(!selectedJob?.result) return notice("Selecciona primero una ejecución con resultado."); el("writeText").value = "GO Puente Codex — resultado de ejecución\nID: " + selectedJob.id + "\nResultado: " + jobLabel(selectedJob.state) + "\nÉxito funcional verificado independientemente: NO\n\n" + (selectedJob.result.response || selectedJob.result.error || "Sin respuesta verificada."); notice("Resultado preparado como borrador. Todavía no se ha enviado a Trello.");});
el("prepareWrite").addEventListener("click", event => action(event.target, async () => {
  const actionName = el("writeAction").value, payload = {};
  if (actionName !== "create") payload.card_id = el("targetCard").value.trim();
  if (["create", "move"].includes(actionName)) payload.list_id = el("targetList").value;
  if (["create", "update"].includes(actionName)) {payload.name = el("writeName").value; payload.description = el("writeText").value;}
  if (actionName === "comment") payload.text = el("writeText").value;
  operation = await api("/api/prepare-write", {action: actionName, payload});
  showOperation(operation);
  notice("Modificación preparada. Revisa la tarjeta/lista y el contenido exactos antes de autorizar.");
}));
el("approveWrite").addEventListener("click", event => action(event.target, async () => {
  if (!operation) return;
  const preview = await api("/api/write-preview", {operation:operation.operation});
  if (!window.confirm("AUTORIZACIÓN ÚNICA · " + operation.action + "\n\n" + JSON.stringify(preview.payload,null,2))) return;
  const result=await api("/api/approve-write", {operation:operation.operation,preview:preview.id,confirmation:"AUTORIZO ESTA MODIFICACION"});
  operation = {...operation,state:result.state}; el("writePreview").textContent=JSON.stringify(result,null,2); await refresh();
  notice(result.state === "verified" ? "Escritura confirmada mediante una lectura posterior de Trello." : "El resultado necesita revisión. No se repetirá el envío automáticamente.");
}));
el("reconcileWrite").addEventListener("click", event => action(event.target, async () => {if(operation){el("writePreview").textContent=JSON.stringify(await api("/api/reconcile-write",{operation:operation.operation}),null,2); await refresh();}}));
el("refresh").addEventListener("click", event => action(event.target, refresh));
el("prepareRetry").addEventListener("click", event => action(event.target, async () => {
  if(!selectedJob)throw Error("Selecciona la ejecución anterior y revisa su resultado.");
  const job=await api("/api/prepare-retry",{job:selectedJob.id,reason:el("retryReason").value});
  await loadJob(job.id);await refresh();notice("Reintento preparado. Requiere una nueva autorización antes de ejecutarse.");
}));

function syncActions() {
  el("execute").disabled = !selectedJob || selectedJob.state !== "prepared" || selectedJob.data.agent !== "4";
  el("publish").disabled = !publication;
  el("approveWrite").disabled = !operation || operation.state !== "prepared";
}
function showOperation(record) {
  operation = {...record,state:"prepared"};
  el("writePreview").textContent = JSON.stringify(record,null,2);
  el("approveWrite").disabled = false; el("reconcileWrite").disabled = false;
  el("approveWrite").textContent = record.action === "move" ? "Autorizar ESTA tarjeta → lista " + record.payload.list_id : "Autorizar ESTE comentario → tarjeta " + record.payload.card_id;
}
el("publicationPreview").addEventListener("click",event => action(event.target,async () => {
  if (!selectedJob) return;
  publication = await api("/api/publication-preview",{job:selectedJob.id});
  el("publicationInfo").textContent = JSON.stringify(publication,null,2);
  el("publish").disabled = false;
  notice("Parche preparado para revisión. Nada publicado. Revisa los archivos, pruebas, destino y contenido completo.");
}));
el("publish").addEventListener("click",event => action(event.target,async () => {
  if (!publication || !window.confirm("PUBLICAR SOLO ESTE PARCHE EN origin/main\nTrabajo: " + publication.payload.job + "\nCarpeta: " + publication.payload.workspace + "\nBase: " + publication.payload.remote_main + "\nHuella: " + publication.sha256 + "\nHe revisado el parche íntegro. ¿Autorizar un único commit y push?")) return;
  const result = await api("/api/publish",{job:publication.payload.job,preview:publication.id,confirmation:"AUTORIZO ESTE PARCHE EN MAIN"});
  publication = null; el("publish").disabled = true;
  el("publicationInfo").textContent = JSON.stringify(result,null,2); await refresh();
  notice("Resultado de publicación registrado. Metro y comprobación iPhone son verificaciones independientes.");
}));
for (const [id,kind] of [["factoryComment","comment"],["factoryMove","move"]]) {
  el(id).addEventListener("click",event => action(event.target,async () => {
    if (!selectedJob) return;
    showOperation(await api("/api/factory/followup",{job:selectedJob.id,action:kind}));
    notice("Operación preparada, sin enviar. Revisa su contenido y autorízala separadamente en Trello.");
  }));
}

// Reviews are immutable snapshots. Background status refreshes must not rebuild an open review.
let reviewCards = [], wheelForms = [], wheelBusy = false, wheelActivationPending = false;
const wheelOperations = [
  ["A", "Ejecutar esta instrucción con Codex CLI y recuperar las dependencias locales si hace falta"],
  ["B", "Publicar sus cambios probados en origin/main"],
  ["C", "Añadir el comentario de comprobación a esta tarjeta"],
  ["D", "Mover esta tarjeta a COMPROBAR tras verificar el comentario"]
];
function wheelNode(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function wheelText(value, fallback = "Sin verificar") {
  if (value == null || value === "") return fallback;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function wheelReasonText(reason) {
  return ({FACTORY_JOB_FAILED:"La última tarjeta quedó bloqueada; revisa su informe antes de continuar.",
    WHEEL_CODEX_AUTH:"La sesión de Codex no está verificada.",WHEEL_CODEX_QUOTA:"La cuota de Codex no está disponible.",
    WHEEL_CODEX_SESSION_CHANGED:"Cambió la cuenta de Codex vinculada al lote.",WHEEL_SUBJECT_CHANGED:"Cambió la cola o una instrucción desde su revisión.",
    WHEEL_BATCH_ORDER_CHANGED:"El orden de Trello cambió desde la revisión.",WHEEL_WORKSPACE_BUSY:"Hay un trabajo en curso o pendiente de conciliar.",
    WHEEL_HEAD_DEPENDENCY_BLOCKED:"La alternativa de dependencia fue rechazada antes de iniciar el ejecutor.",
    FACTORY_METRO_OUTDATED:"La publicación existe en MAIN; Metro 8088 aún no confirmó el código servido. No se repetirá el push.",
    OWNER_PAUSED:"La fábrica está pausada por el propietario.",
    OWNER_STOPPED:"La fábrica está detenida. Revisa el lote antes de continuar."})[reason] || (reason ? "Bloqueo registrado: "+reason : "");
}
function renderWheel(wheel) {
  const grants = wheel?.grants || [];
  el("wheelState").textContent = !wheel ? "ESTADO SIN VERIFICAR · La rueda no está disponible en este coordinador."
    : (wheel.enabled ? (wheel.current?.job_state==="running" ? "PROGRAMANDO · "+wheel.current.title : "FÁBRICA ACTIVADA") : wheel.frozen_batch?.state === "completed" ? "FÁBRICA FINALIZADA"
      : wheel.reason === "OWNER_STOPPED" ? "FÁBRICA DETENIDA · " + wheelReasonText(wheel.reason)
      : wheel.reason && wheel.reason !== "OWNER_PAUSED" ? "FÁBRICA BLOQUEADA · " + wheelReasonText(wheel.reason)
      : "FÁBRICA PAUSADA") + (wheel.reason && wheel.reason === "OWNER_PAUSED" ? " · " + wheelReasonText(wheel.reason) : "");
  const current = wheel?.current;
  const last = grants.find(row => row.stages && Object.keys(row.stages).length) || {};
  const next = wheel?.queue_head || wheel?.next;
  el("wheelCurrent").textContent="Trabajo actual: "+(current?.title||"ninguno");
  el("wheelNext").textContent="Siguiente trabajo pendiente: "+(wheel?.grants?.filter(row=>row.state==="ready").sort((a,b)=>a.position-b.position)[0]?.title||next?.title||"ninguno");
  const frozen = wheel?.frozen_batch;
  const summary = el("wheelSummary");
  const rows = [
    ["Tarea actual", current && (current.title || current.card_id) || "Ninguna"],
    ["Estado técnico", current?.phase || current?.state || (wheel?.enabled ? "Vigilando" : "En espera")],
    ["Siguiente tarjeta", next?.title || next?.card_id || "Pendiente de selección"],
    ["Lote congelado", frozen ? frozen.cards.map(card=>card.title + (card.blocker ? " · " + card.blocker : "")).join("\n") : "Ninguno"],
    ["Pruebas", wheelText(wheel?.last_tests ?? last.stages?.tests)],
    ["Publicación MAIN", wheelText(wheel?.last_publication ?? last.stages?.main_sha)],
    ["Metro / API", wheelText(wheel?.metro ?? last.stages?.metro) + " / " + wheelText(wheel?.api ?? last.stages?.api)],
    ["Comentario / traslado", wheelText(wheel?.comment ?? last.stages?.comment) + " / " + wheelText(wheel?.move ?? last.stages?.move)],
    ["Cuota de Codex", quotaText(wheel?.quota) + (wheel?.reason === "CREDIT_LIMIT" ? " · Pausa anterior conservada" : "")],
    ["Recuperación", wheel?.recovery_required ? "Intento conservado. Requiere revisión y continuación de su sesión exacta; no se iniciará otra tarjeta." : "Puntos de recuperación persistentes; no se repiten etapas verificadas"]
  ];
  summary.replaceChildren();
  for (const [title,value] of rows) {
    const field = wheelNode("div");
    field.append(wheelNode("dt",title), wheelNode("dd",value));
    summary.append(field);
  }
  const list = el("wheelGrants");
  list.replaceChildren();
  for (const grant of grants) {
    const ops = Array.isArray(grant.operations) ? grant.operations.join(" · ") : wheelText(grant.operations,"");
    const record = wheelNode("details"), title = grant.title || grant.card_id;
    record.append(wheelNode("summary",title + " · " + wheelText(grant.state,"Pendiente") + " · " + ops));
    record.append(wheelNode("pre",JSON.stringify({tarjeta:grant.card_id,intento:grant.attempt,etapas:grant.stages,
      causa:grant.reason,revision_local:grant.local_review,ultimo_punto:grant.checkpoint,
      vencimiento:grant.expires_at ? new Date(grant.expires_at*1000).toLocaleString() : undefined},null,2)));
    list.append(record);
  }
  if (!grants.length) list.textContent = "Todavía no hay operaciones autorizadas.";
  syncWheelControls();
}
function quotaText(quota) {
  const labels = {available:"Disponible al consultar",limited:"Límite vigente al consultar",
    unauthenticated:"Sesión ChatGPT sin verificar",stale:"Comprobación caducada",unknown:"Sin comprobación disponible"};
  const windows = (quota?.windows || []).map(window=>window.used_percent + "% usado (" + window.minutes + " min)");
  return [labels[quota?.state] || labels.unknown,...windows].join(" · ");
}
function decisionOperations(card) {
  return card.work_kind === "diagnosis" ? "ACD" : "ABCD";
}
function linesOf(input) {
  return input ? [...new Set(input.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean))] : [];
}
function readDecision(form) {
  const operations = form.operations.filter(item=>item.input.checked).map(item=>item.code);
  if (!operations.length) return null;
  const allowed_files = linesOf(form.files), test_files = linesOf(form.tests);
  if (form.files && !allowed_files.length) throw Error("Indica los archivos permitidos de «" + form.card.title + "».");
  const expires_at = Math.floor(new Date(form.expires.value).getTime()/1000);
  if (!Number.isFinite(expires_at) || expires_at <= Date.now()/1000) throw Error("Revisa el vencimiento de «" + form.card.title + "».");
  return {card_id:form.card.card_id,binding:form.card.binding,operations,allowed_files,test_files,
    depends_on:Array.from(form.dependencies.selectedOptions || [],option=>option.value),backend_required:form.backend?.checked ?? false,expires_at};
}
function syncWheelControls() {
  const wheel = state?.factory?.wheel;
  const frozen = wheel?.frozen_batch;
  const ready = Boolean(wheel && state?.agents?.["4"]?.enabled && state.agents["4"].workspace);
  el("wheelReview").disabled = wheelBusy || !wheel;
  el("wheelQuota").disabled = wheelBusy || !wheel;
  const activate=el("wheelActivate");
  activate.classList.remove("state-active","state-paused","state-stopped","state-blocked","state-inactive","state-finished","state-pending","state-unknown");
  activate.classList.toggle("is-working",Boolean(wheel?.enabled&&wheel.current?.job_state==="running"));
  activate.title="";
  if(wheelActivationPending){activate.textContent="ACTIVANDO…";activate.classList.add("state-pending");activate.disabled=true;}
  else if(!wheel){activate.textContent="ESTADO SIN VERIFICAR";activate.classList.add("state-unknown");activate.disabled=true;}
  else if(wheel.enabled){activate.textContent="FÁBRICA ACTIVADA";activate.classList.add("state-active");activate.disabled=true;}
  else if(frozen?.state==="completed"){activate.textContent="FÁBRICA FINALIZADA";activate.classList.add("state-finished");activate.disabled=true;}
  else if(frozen?.state==="prepared"){activate.textContent="FÁBRICA DESACTIVADA";activate.classList.add("state-inactive");activate.disabled=true;}
  else if(frozen?.state==="active"&&frozen.policy==="independent-v2"&&wheel.grants?.some(grant=>
      ["ready","working"].includes(grant.state)&&grant.expires_at<=Date.now()/1000)){
    activate.textContent="FÁBRICA PAUSADA · REAUTORIZAR";activate.classList.add("state-paused");
    activate.disabled=wheelBusy||!state?.private_panel_url;
    activate.title="Abre la revisión privada para autorizar solo las operaciones pendientes.";
  }
  else if(frozen?.state==="active"&&(frozen.policy!=="independent-v2"||(wheel.reason&&wheel.reason!=="OWNER_PAUSED"))){
    activate.textContent=wheel.reason==="OWNER_STOPPED"?"FÁBRICA DETENIDA · REVISAR":"FÁBRICA BLOQUEADA · REVISAR EN PANEL PRIVADO";activate.classList.add(wheel.reason==="OWNER_STOPPED"?"state-stopped":"state-blocked");activate.disabled=true;
    activate.title=wheelReasonText(wheel.reason)||"Este lote necesita la revisión de activación del panel privado.";
  } else {activate.textContent="FÁBRICA PAUSADA · ACTIVAR";activate.classList.add("state-paused");activate.disabled=wheelBusy||!ready||Boolean(frozen&&frozen.state!=="active");activate.title="El servidor confirmará la activación antes de mostrar el estado verde.";}
  el("wheelPause").disabled = wheelBusy || !wheel?.enabled;
  el("wheelStop").disabled = wheelBusy || !wheel?.enabled;
  el("wheelRestart").disabled = wheelBusy || Boolean(state?.jobs?.some(job=>["running","detached"].includes(job.state)));
  el("wheelCondition").textContent = !wheel ? "El coordinador debe cargar la versión con rueda."
    : !ready ? "Para activar la rueda, asigna y habilita la carpeta del Agente 4."
    : wheel.enabled ? "La pausa impide iniciar la siguiente operación. Consulta el estado del trabajo en curso."
    : "La rueda respeta la primera tarjeta de Trello. Si falta permiso o está bloqueada, se detiene sin saltarla.";
  let reason = "", decisions = [];
  try { decisions = wheelForms.map(readDecision).filter(Boolean); } catch(error){ reason = error.message; }
  const count = decisions.length;
  const reviewMatches = frozen && decisions.length === frozen.cards.length &&
    frozen.cards.every((card,i)=>card.card_id === decisions[i].card_id && card.binding === decisions[i].binding &&
      decisions[i].operations.join("") === decisionOperations(card));
  if (frozen) {
    if (frozen.state !== "prepared") reason = "La decisión anterior queda conservada. Pulsa el botón principal para revisar y autorizar únicamente las operaciones pendientes.";
    else if (frozen.cards.some(card=>card.blocker)) reason = "Hay tarjetas que requieren revisión antes de autorizar el lote.";
    else if (!reason && !reviewMatches) reason = "Revisa el alcance y selecciona las operaciones de cada una de las " + frozen.cards.length + " tarjetas.";
  }
  el("wheelApprove").textContent = frozen?.state==="active" ? "Decisión anterior conservada" : frozen ? "Autorizar y arrancar lote congelado" : "Autorizar operaciones seleccionadas";
  el("wheelApprove").disabled = wheelBusy || !wheel || Boolean(reason) || !count || Boolean(frozen && !ready);
  el("wheelApprovalCondition").textContent = reason || (count ? count + " tarjeta(s) seleccionada(s) para revisar en la confirmación local."
    : wheelForms.length ? "Selecciona las operaciones que deseas conceder por tarjeta." : "Lee la cola para revisar las tarjetas elegibles.");
}
function labeledField(parent, label, input) {
  const wrapper = wheelNode("label",label);
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function checkbox(parent, label, checked=false) {
  const wrapper = wheelNode("label",null,"check"), input = wheelNode("input");
  input.type = "checkbox"; input.checked = checked;
  wrapper.append(input,label);
  parent.append(wrapper);
  return input;
}
function scopeField(parent, label, suggested) {
  const field = wheelNode("textarea",null,"wheel-compact");
  field.rows = 2; field.spellcheck = false; field.value = (suggested || []).join("\n");
  return labeledField(parent,label,field);
}
function renderReview(cards) {
  reviewCards = cards; wheelForms = [];
  const container = el("wheelCards"); container.replaceChildren();
  if (!cards.length) container.textContent = "La cola no contiene tarjetas para revisar.";
  for(const card of cards) {
    const box = wheelNode("fieldset",null,"grant-card");
    box.append(wheelNode("legend",card.title || card.card_id));
    box.append(wheelNode("small","Tarjeta " + card.card_id + " · Posición " + wheelText(card.position,"sin verificar")));
    container.append(box);
    if (!card.eligible || !card.binding) {
      box.append(wheelNode("p",card.reason || "Esta tarjeta no está disponible para autorización.","wheel-note"));
      continue;
    }
    const info = wheelNode("details"); info.append(wheelNode("summary","Instrucción íntegra y destino"));
    info.append(wheelNode("pre",card.instruction,"instructions"));
    info.append(wheelNode("p","Agente " + card.agent + " · " + card.workspace + "\nTablero " + card.board + "\nCOLA " + card.origin +
      " → COMPROBAR " + card.destination + "\nHuella " + card.instruction_sha));
    if(card.cli_settings) info.append(wheelNode("p","Configuración del ejecutor " + JSON.stringify(card.cli_settings)));
    box.append(info);
    const diagnosis = card.work_kind === "diagnosis";
    if (diagnosis) box.append(wheelNode("p","Diagnóstico de solo lectura. Se verifica el informe sin publicar en MAIN.","wheel-note"));
    const operations = wheelOperations.filter(([code])=>decisionOperations(card).includes(code))
      .map(([code,label])=>({code,input:checkbox(box, code + " · " + label)}));
    const fullCycle=wheelNode("button",diagnosis ? "Seleccionar A, C y D" : "Seleccionar A–D","secondary");
    fullCycle.type="button";
    fullCycle.addEventListener("click",()=>{operations.forEach(item=>{item.input.checked=true;});syncWheelControls();});
    box.append(fullCycle);
    const files = diagnosis ? null : scopeField(box,"Archivos o carpetas permitidos · una ruta por línea, / al final para una carpeta",card.suggested_files);
    const tests = diagnosis ? null : scopeField(box,"Regresiones iniciales · también se ejecutarán las pruebas nuevas o modificadas",card.suggested_test_files);
    const dependencies = wheelNode("select"); dependencies.multiple = true;
    const dependencyOptions=new Map([...cards,...(state?.factory?.wheel?.grants || [])].map(row=>[row.card_id,row]));
    for(const other of Array.from(dependencyOptions.values()).filter(row=>row.card_id !== card.card_id)) {
      const option = wheelNode("option",other.title || other.card_id); option.value = other.card_id;
      dependencies.append(option);
    }
    if(dependencyOptions.size>1) labeledField(box,"Depende de estas tarjetas (opcional)",dependencies);
    const backend = diagnosis ? null : checkbox(box,"Requiere comprobar el backend alojado y su persistencia",Boolean(card.hosted_required));
    if (backend && card.hosted_required) backend.disabled=true;
    const expires = wheelNode("input"); expires.type = "datetime-local";
    const expiry = new Date(Date.now()+24*3600*1000);
    expires.value = new Date(expiry.getTime() - expiry.getTimezoneOffset()*60000).toISOString().slice(0,16);
    labeledField(box,"Vigencia de esta autorización (hora local)",expires);
    box.addEventListener("input",syncWheelControls);
    box.addEventListener("change",syncWheelControls);
    wheelForms.push({card,operations,files,tests,dependencies,backend,expires});
  }
  syncWheelControls();
}
async function wheelAction(callback) {
  if (wheelBusy) return;
  wheelBusy = true; syncWheelControls();
  try { await callback(); } catch(error) { notice(error.message); await refresh().catch(()=>{}); }
  finally { wheelBusy = false; wheelActivationPending=false; syncWheelControls(); }
}
el("wheelReview").addEventListener("click",()=>wheelAction(async()=>{
  renderReview([]);
  const review = await api("/api/wheel/review");
  if (!Array.isArray(review.cards)) throw Error("La lectura de COLA no devolvió una revisión válida.");
  renderReview(review.cards);
  notice("Cola revisada. " + review.cards.filter(card=>card.eligible).length + " tarjeta(s) disponible(s) para autorizar.");
}));
el("wheelApprove").addEventListener("click",()=>wheelAction(async()=>{
  const decisions = wheelForms.map(readDecision).filter(Boolean);
  const frozen = state?.factory?.wheel?.frozen_batch;
  if (!decisions.length) return;
  // Discard this snapshot even on transport failure. A new review reconciles the outcome before another submission.
  renderReview([]);
  wheelActivationPending=Boolean(frozen);syncWheelControls();
  await api("/api/wheel/approve",frozen ? {decisions,start_frozen_batch:true} : {decisions});
  wheelActivationPending=false;
  await refresh();
  notice(frozen ? "Lote autorizado y arrancado." : "Las operaciones aprobadas están registradas en Tarjetas y operaciones.");
}));
for (const [id,enabled] of [["wheelActivate",true],["wheelPause",false]]) {
  el(id).addEventListener("click",()=>{if(enabled)wheelActivationPending=true;wheelAction(async()=>{
    if(enabled && (!state?.factory?.wheel || !state.agents?.["4"]?.enabled || !state.agents["4"].workspace)) return;
    if(enabled&&state.factory.wheel.frozen_batch?.state==="active"&&state.factory.wheel.grants?.some(grant=>
        ["ready","working"].includes(grant.state)&&grant.expires_at<=Date.now()/1000)){
      window.open(state.private_panel_url,"_blank","noopener,noreferrer");
      notice("Revisa en GO · Fábrica privada las operaciones pendientes y confirma allí la nueva autorización.");
      return;
    }
    await api("/api/wheel/toggle",{enabled});
    await refresh();
    notice(enabled ? "Rueda activa para tarjetas preautorizadas." : "Pausa solicitada. Consulta la tarea en curso.");
  });});
}
el("wheelStop").addEventListener("click",()=>wheelAction(async()=>{
  await api("/api/wheel/stop",{});
  await refresh();
  notice("Fábrica detenida. Revisa el lote antes de una nueva activación.");
}));

el("wheelRestart").addEventListener("click",()=>wheelAction(async()=>{
  await api("/api/wheel/restart",{});
  notice("Reinicio solicitado. El panel recuperará el estado automáticamente.");
}));
el("wheelQuota").addEventListener("click",()=>wheelAction(async()=>{
  const quota = await api("/api/wheel/codex-quota",{});
  await refresh();
  notice(quotaText(quota));
}));

refresh().catch(error => notice(error.message));
setInterval(() => refresh().catch(() => {}), 5000);
