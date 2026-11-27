# GO IA: preferencias, privacidad y administración

27/11/2026. Cambio móvil sobre MAIN `3000ff0ac294cb68a56b167f30181924586a1d5f`.
El checkpoint de activación `c6141e1` se conserva; no se cambian servidor,
secretos, autorización de inferencia, presupuesto ni herramientas de reservas.

El engranaje propio de la conversación contiene idioma, acento, voz del
dispositivo, velocidad y lectura automática. Se enumeran las voces nativas:
no se inventan identificadores ni se infiere su género a partir del nombre.
Masculina/femenina solo se ofrecen si el proveedor nativo comunica ese dato.
El panel tiene fondo opaco y controles verticales con texto ajustable.

El panel general de GO incorpora Preferencias → Privacidad: autorización de
envío a OpenAI, historial local y sincronización existente cuando esté disponible,
borrado y condiciones/limitaciones. Chat y privacidad comparten el modelo de la
cuenta y las claves existentes; no se renueva automáticamente el consentimiento
ni se pierde el historial al cambiar preferencias. El borrado local se identifica
como tal; no se promete borrar un historial remoto sin comprobar disponibilidad.

Proveedor, modelo, presupuesto/consumo y disponibilidad se consultan únicamente
desde ADMIN · GO IA, con identidad ADMIN verificada y la API protegida existente.
No se amplía el acceso a conversación de EMPRESA o USUARIO. Cambiar de cuenta
invalida la exposición del estado técnico anterior. Interrumpir respuesta queda
en el pie medido de la conversación, accesible sin abrir configuración.

Pruebas dirigidas: catálogo nativo, persistencia por cuenta, preferencias antiguas,
autorización/revocación, interrupción de enumeración tardía, privacidad sin acceso
ADMIN, exclusión de datos técnicos y aislamiento al cambiar cuenta. Se conservan
las regresiones de chat, voz, panel general, lateralidad y aviso de limitaciones.
TypeScript y `git diff --check`; bundle iOS y publicación se verifican por separado.
Estas pruebas usan datos y transportes locales de prueba, sin inferencias de pago.

Pendiente del propietario en iPhone: inspección visual con texto ampliado,
selección y escucha de voces realmente instaladas, velocidad, entrada/salida y
revocación desde Privacidad, interrupción desde conversación y ambas lateralidades.
El adaptador de reconocimiento nativo y su limitación conocida en Expo Go no se
modifican ni se presentan como validados físicamente.
