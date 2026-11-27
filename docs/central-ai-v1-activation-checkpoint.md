# GO IA V1: activación, presupuesto y primera reserva

Base inspeccionada: `origin/main f8a7b66ef2a9501515e096ad2464a4e3b462ea63`.

Estado del checkpoint: código conservado en `codex/openai-v1-activation`, sin
integrar a MAIN ni desplegar trabajo incompleto. La migración se ha probado solo
en PostgreSQL local; no se ha aplicado a Supabase. No se han cambiado variables
ni credenciales Railway. La sesión oficial API está esperando intervención del
propietario. PC1 `100.105.48.111:8088` no respondió desde este equipo (HTTP 000,
tiempo de conexión agotado); no se intervino en PC1 ni se actualizó Metro PC2.

**Trabajo sin cierre funcional:** la plataforma API pidió inicio de sesión del
propietario. No se ha acreditado organización, titularidad, saldo, beneficio
Business ni restricción del proyecto/clave existente. No se han hecho inferencias,
pagos ni reservas reales. No se han creado cuentas en GO. La fábrica permanece
fuera de esta intervención.

## Diferencias respecto a la entrega anterior

Se reutilizan chat, compositor, consentimiento, transporte ADMIN, historial optativo,
lectura del dispositivo, API de catálogo, disponibilidad, cotización y creación de
reservas. No se crea otro chat ni otro motor de reservas.

- `centralAiBudget.ts`: modelo fijo `gpt-5.4-mini`, límites cerrados, contabilidad
  duradera con JWT del solicitante y capacidad exclusiva del servidor.
- `centralAiResponse.ts`: Responses API, `store:false`, nivel estándar, razonamiento
  `none`, hasta cuatro llamadas por turno, 1.200 tokens de salida por llamada
  (incluido razonamiento), payload de hasta 32.768 bytes. Sin reintentos, audio,
  modelos alternativos ni herramientas facturables del proveedor.
- `centralAiBookingTools.ts`: registro compartido de herramientas de lectura y
  preparación. Solo establecimientos expresamente autorizados de Peluquería y
  catálogo publicado. No hay herramienta del modelo que cree una reserva.
- `go_central_ai_test_budget.sql`: tablas privadas con RLS y sin grants al cliente.
  Límite **acumulado**, máximo 4 USD, sin reinicio mensual. Inicialmente desactivado,
  sin secreto ni cuentas/negocios habilitados. RPC exige simultáneamente JWT,
  membresía ADMIN activa, cuenta incluida y capacidad secreta del servidor.
- La reserva máxima es 0,20 USD por turno completo: cuatro llamadas de hasta
  0,05 USD. El máximo calculado por llamada con estos límites queda por debajo
  de 0,05 USD a la tarifa estándar verificada. Se guardan tokens y coste real y
  se devuelve el sobrante cuando el consumo es conocido. Un fallo incierto mantiene
  el máximo reservado; nunca se libera por caducidad ni cambio de mes.
- Margen preventivo mínimo 0,10 USD y como máximo dos turnos simultáneos; un turno
  por cuenta. Un proceso caído puede bloquear su cuenta hasta conciliación manual:
  se conserva el cargo máximo y se evita gastar sin control.
- Las propuestas son duraderas, por identidad, con vigencia de quince minutos.
  Corregir o descartar invalida la propuesta. Confirmar exige pulsación expresa
  y usa la cotización/horario exactos y el JWT original contra `/bookings/catalog`.
  El motor existente revalida titularidad, disponibilidad, precios y permisos.
  Una respuesta incierta conserva el mismo `request_key` inmutable para reintentar.
- Móvil muestra el resumen, precio, zona horaria, confirmación y resultado verdadero
  `PENDING`/`CONFIRMED`, más coste del turno y presupuesto seguro restante.
- Con `GO_CENTRAL_AI_TEST_MODE=true`, las antiguas rutas de interpretación dejan
  de utilizar la clave con otros modelos y conservan su motor gratuito de reglas.
  La transcripción de pago queda bloqueada. Los perfiles no ADMIN no acceden a
  las capacidades nuevas; no se amplían membresías ni derechos sobre reservas.

## Activación que falta comprobar personalmente

1. El propietario inicia sesión en la [facturación oficial API](https://platform.openai.com/settings/organization/billing/overview).
   Comprobar organización receptora, propiedad y saldo antes de cambiar nada.
2. Si procede el [beneficio de suscripción](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions),
   comprobar titularidad de organización y workspace, antigüedad y prorrateo.
   No asumir que Business implica crédito concedido ni cambiar vínculos existentes.
3. Reutilizar/crear proyecto GO V1, solo `gpt-5.4-mini`, límites de tasa y presupuesto,
   hard limit si disponible, alertas 50/80/100%, recarga automática desactivada.
   Las alertas y el prepago no reemplazan el límite duradero de GO.
4. Verificar que la clave de servicio pertenece a ese proyecto y permite Responses
   sin otros modelos/herramientas. El propietario introduce cualquier clave nueva
   directamente en `OPENAI_API_KEY` del servicio Railway existente, sin revelarla.
   **No reemplazar la clave existente sin identificarla.**
5. Configurar una capacidad aleatoria de al menos 32 bytes (64 caracteres hex) como
   `GO_CENTRAL_AI_LEDGER_SECRET`, solo en el servidor; su SHA-256 se guarda en la
   fila privada. No se comunica su valor por chat ni se incluye en Git.
6. Tras comprobar saldo/condiciones y el importe final autorizado, fijar un límite
   privado ≤4 USD (menor si procede), cuentas ADMIN existentes y establecimientos
   explícitamente autorizados. Habilitar la fila y
   `GO_CENTRAL_AI_MODEL=gpt-5.4-mini`, `GO_CENTRAL_AI_TEST_MODE=true`,
   `GO_CENTRAL_AI_ENABLED=true`. Tanto el interruptor de servidor como la fila
   privada permiten apagar inmediatamente el consumo.
7. Realizar pocos turnos reales con consentimiento y primera reserva del propietario
   en establecimiento autorizado. El propietario pidió continuar **sin crear cuentas
   ficticias**; no se sustituyen identidades ni se usan negocios ajenos.
8. Verificar tokens/coste contra uso API, aislamiento y escritura/lectura real de
   reserva. Después verificar versión PC1 8088 y comprobación física en iPhone.

Si no existe saldo y hace falta prepago, el mínimo oficial es 5 USD y la recarga
automática aparece habilitada por defecto. El propietario debe revisar EUR finales,
impuestos y retenciones y confirmar personalmente; si supera 5 EUR, no comprar.

## Pruebas realizadas

Pruebas de PostgreSQL en memoria (PGlite 0.5.12 ya fijado en el repositorio),
contratos y HTTP Express real con proveedor/Auth/GO adaptados: permisos, saldo
agotado, reserva atómica, conciliación, fallos inciertos, ausencia de reinicio mensual,
propuestas, correcciones, confirmación separada, JWT, doble envío e idempotencia.
No son inferencias ni reservas de producción. Fixtures exclusivamente locales,
sin crear cuentas alojadas ni tocar datos de negocios.

41 pruebas móviles de conversación/consentimiento, propuesta/cancelación/confirmación,
estado pendiente, aislamiento, contexto, voz existente y flotantes. TypeScript móvil
completo y dirigido de las rutas servidor modificadas usando dependencias existentes
en caché, sin reinstalar el workspace ni modificar Metro PC2. `git diff --check`.
El proyecto servidor completo sigue sin sus enlaces locales de dependencias;
el chequeo dirigido usa los tipos reales de Express y un contrato para el conector
Replit no utilizado en producción. El build Railway es una comprobación separada.
8 pruebas de servidor superadas (incluida la base PostgreSQL local y HTTP Express).
La suite histórica `support-assistant` falla al arrancar porque su fixture no
resuelve `GoAiIdentity`; no se modifica ni se presenta como superada.

Pendientes: sesión oficial API y facturación, credencial/proyecto acreditados,
activación y prueba real con consumo limitado, primera reserva autenticada,
verificación de lectura cliente/empresa y QA física. En Expo Go se conserva la
síntesis del dispositivo y el dictado del teclado; no se simula reconocimiento
nativo programático ni se instala un build ni audio API adicional.

## Fuentes oficiales comprobadas

- [Modelo y tarifa estándar](https://developers.openai.com/api/docs/models/gpt-5.4-mini):
  0,75 USD/millón entrada y 4,50 USD/millón salida. Soporta Responses, function
  calling y salida estructurada. Imágenes admitidas por el modelo, pero esta ruta
  no envía documentos ni adelanta la importación/OCR del catálogo.
- [Proyectos, restricciones y hard limit](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform):
  la aplicación del límite puede retrasarse; alertas no detienen solicitudes.
- [Prepago](https://help.openai.com/es-es/articles/8264644-setting-up-and-managing-prepaid-api-billing):
  también puede existir retraso al agotar saldo. No afirmar retención cero ni coste fijo.
