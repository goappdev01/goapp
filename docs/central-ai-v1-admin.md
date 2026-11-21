# IA central GO V1 — entrega preparada, activación pendiente

Base: `origin/main 4050dcf71177562b01bb9e915c4488fbd7218153` (21/11/2026).

## Implementación encontrada y reutilizada

El GO central ya abría `GOChatScreen` → `BookingAssistantScreen`. Comunicación
usa ese mismo asistente dentro de su pantalla; no se crea otro chat ni otra ruta
móvil. El modo de consulta existente permite conversación sin despachador de
reservas/tareas. `useBookingVoice` ya graba con expo-audio y limpia el archivo
temporal después de procesarlo. Expo Speech también estaba instalado.

ADMIN validado por `GoAdminAccessContext` utiliza ahora el modo generalista sobre
la misma pantalla. Los demás perfiles conservan el asistente V1 aprobado. No se
modifican órbitas, botón GO, Comunicación ni navegación exterior.

## Código entregado

- `lib/api-zod/src/central-assistant.ts`: contrato estricto de mensajes de usuario/
  asistente; sin roles de sistema ni parámetros de herramientas suministrados por
  el cliente. Registro de herramientas vacío, sin ejecutores habilitados.
- `artifacts/api-server/src/routes/central-assistant.ts`: capacidades, respuesta
  de texto y transcripción; todas las rutas usan el middleware ADMIN existente
  que verifica identidad y membresía activa con el JWT del solicitante.
- `artifacts/go-app-mobile/lib/centralConversation.ts`: contexto conversacional,
  consentimiento, interrupción, historial local opcional por identidad y borrado.
- `artifacts/go-app-mobile/lib/centralAssistant.ts`: transporte autenticado HTTPS,
  comprobación de ADMIN y de continuidad de identidad antes/después de la petición.
- `CentralAssistant.tsx`, `GOChatScreen.tsx`, `BookingAssistantScreen.tsx` y
  `useBookingVoice.ts`: composición del chat/voz ya existentes y controles de
  privacidad. No hay un segundo editor de chat ni un motor de grabación paralelo.
- Registro de rutas y tamaño permitido del cuerpo de audio en `app.ts`/`routes/index.ts`.

Solo se transmiten los mensajes que se escriben o dictan en esta conversación.
No se envían reservas, contactos, documentos, ubicación, memoria de otros módulos
ni fuentes de AYUDA. No hay acceso a herramientas ni operaciones sobre esos datos.

## Privacidad y límites

El consentimiento de transmisión comienza desactivado y se revoca al cerrar,
cambiar sesión o dejar la app en segundo plano. El permiso de micrófono solo se
pide tras comprobar consentimiento y disponibilidad. La lectura de respuestas
es otra opción explícita, desactivada inicialmente. Se puede parar la respuesta
o comenzar otra captura; no se promete escucha simultánea continua/full duplex.

Recordar el chat es voluntario y local (AsyncStorage existente, clave por cuenta).
No es almacenamiento cifrado ni sincronización entre dispositivos. El historial
local no restaura permiso para enviarlo. Desactivar Recordar lo retira del disco;
Borrar conversación elimina el contexto local. Las escrituras se serializan para
que una operación pendiente no pueda resucitar lo borrado. Un fallo de guardado
se comunica; no se finge persistencia.

Se conserva un contexto acotado, no memoria ilimitada: hasta 20 mensajes y 12.000
caracteres; al formar una petición se recortan los turnos más antiguos para dejar
espacio a la respuesta. Mensaje individual de hasta 4.000 caracteres. Son límites
técnicos, no cuotas comerciales. El proveedor recibe `store:false`, sin ID remoto
de conversación ni `previous_response_id`. Esto no equivale a prometer retención
cero por el proveedor ni borra datos que ya se hayan transmitido.

## Configuración pendiente de Nelson — requiere autorización específica

No se han desplegado servicios, modificado dependencias del proyecto, credenciales,
activado modelos de pago ni cambiado variables de ningún entorno. No se han
realizado llamadas reales a OpenAI durante este trabajo.

Para completar el criterio de conversación real falta:

1. Autorizar y verificar el despliegue del backend de esta versión, una vez
   comprobado su entorno de despliegue por el responsable.
2. Autorizar el procesamiento externo y gasto de una prueba controlada de OpenAI,
   con un presupuesto decidido por el propietario. Configurar exclusivamente en
   el servidor la clave `OPENAI_API_KEY`; nunca en Expo ni en variables públicas.
3. Decidir/configurar `GO_CENTRAL_AI_MODEL`, `GO_CENTRAL_AI_MAX_OUTPUT_TOKENS` y
   `GO_CENTRAL_AI_REQUESTS_PER_MINUTE`. Solo entonces activar
   `GO_CENTRAL_AI_ENABLED=true`. No se impone un modelo ni plan comercial.
4. Para dictado, decidir `GO_CENTRAL_AI_TRANSCRIPTION_MODEL` y activar
   `GO_CENTRAL_AI_TRANSCRIPTION_ENABLED=true`, con autorización de gasto/procesado.
5. Verificar que la URL de API del entorno real es HTTPS y alcanza la nueva ruta
   con autenticación ADMIN. No se alteró el proxy o API local para conseguirlo.

La limitación por minuto entregada es de este proceso, por identidad y compartida
entre texto/audio. No es un control de facturación global ni un presupuesto entre
réplicas. Es necesaria la configuración de gasto del proyecto proveedor antes de
activar. Las respuestas parciales/incompletas y errores no se presentan como éxito.

## Expo y entorno observado

Se verificó Metro 8088, proceso 5184, con el proyecto existente en
`C:/Users/Usuario/AppData/Local/GO-Metro-MAIN-90747de967e3/artifacts/go-app-mobile`,
manifiesto `GO APP 8088 TESO — PC2`, SDK 58.0.0. El manifiesto no declara cuenta
Expo/owner; no se inventa ese dato. 8089, proceso 1316, se conserva sin cambios.
No se encontró un listener local activo en 8765 en esta sesión; no se arrancó ni
reparó el puente. La URL de API configurada no pudo confirmarse a partir de los
archivos públicos del lanzador/manifiesto. No se cambió para desbloquear la prueba.

expo-audio y expo-speech constan en el proyecto SDK 58 y sus bibliotecas incluyen
soporte Expo Go. Esto acredita compatibilidad técnica, no audio físico. La voz
central del navegador se rechaza expresamente para no usar reconocimiento externo
del navegador bajo un consentimiento referido a OpenAI. No se instala otro build.
En iPhone debe verificarse además el permiso de micrófono y el modo silencio para
la síntesis. No se requieren ni modifican notificaciones para este alcance.

Fuentes técnicas consultadas:
[Responses](https://developers.openai.com/api/reference/resources/responses/methods/create),
[Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/),
[Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/),
[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Pruebas y limitaciones

41 pruebas móviles dirigidas: contexto general/correcciones, consentimiento,
persistencia/borrado por cuenta, interrupción/respuesta tardía, autorización cliente,
continuidad de sesión, voz central separada del transporte de reservas y regresiones
del asistente/controles existentes. Dos pruebas de servidor (contrato y HTTP Express real) recorren el
middleware ADMIN real, consentimiento, configuración desactivada, rechazo de roles
falsos, payload Responses, límites, transcripción y ausencia de ejecución. Proveedor,
transporte de autenticación están adaptados. Una de las dos pruebas usa Router
y servidor HTTP Express reales; ninguna contacta con OpenAI ni Auth reales.

TypeScript móvil se comprobó con una configuración temporal que resuelve el código
local del workspace: los enlaces de dependencias apuntan al checkout que sirve
Metro y aún no contenían el nuevo contrato. No se cambiaron esos enlaces.
`git diff --check` se ejecuta antes de publicar. Después se verifica MAIN y el
bundle iOS realmente servido, por separado del backend.

**Dependencia del checkout verificada y aislada para pruebas:** no existe `artifacts/api-server/node_modules`
en este checkout. La copia de Express disponible en caché falla con
`Cannot find module 'body-parser'`; falta también el paquete de tipos
`express-serve-static-core`. Se validó la ruta nueva, su middleware y contratos con TypeScript usando paquetes
fijados en una carpeta temporal, y se ejecutó HTTP con Express 5.2.1 real allí.
No se reinstaló el workspace ni se cambiaron procesos activos. El primer acceso
al registro falló por certificado; se utilizó el almacén de CA de Windows con
`--use-system-ca`, sin desactivar TLS. Los tests usan exclusivamente datos
sintéticos. El typecheck del proyecto backend completo sigue sin acreditarse
en este checkout parcial; la comprobación dirigida de lo modificado sí pasó.

Quedan pendientes: comprobaciones completas del entorno backend de despliegue, su publicación,
autorización/configuración de gasto y secretos, conversación real de texto y voz,
y comprobación física de permisos/sonido/interrupción en iPhone. No se considera
cumplido el criterio funcional final mientras esas pruebas sigan pendientes.

Reproducción: `node --test artifacts/api-server/tests/central-assistant.test.mjs`.
La prueba HTTP requiere `GO_CENTRAL_TEST_DEPS` apuntando al directorio de
validación con Express fijado; sin ese valor se identifica como omitida, no
como superada. Pruebas móviles: desde artifacts/go-app-mobile,
`node --test tests/central-assistant.test.mjs tests/support-assistant.test.mjs
tests/voice-processing.test.mjs tests/assistant-floating-close.test.mjs`.
