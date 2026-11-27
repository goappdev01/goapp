# Evidencia técnica y límites

Fecha: **27/11/2026**. Base: `f8a7b66ef2a9501515e096ad2464a4e3b462ea63`.
Cambios aislados en `codex/go-compliance-v1`. El checkpoint pendiente de GO IA
se conserva en `codex/openai-v1-activation`, commit
`c6141e1e616d34c88052ebc0f0abaab54dd4e5d4`, sin cambios ni integración.

## Pruebas superadas

| Comprobación | Evidencia | Límite |
| --- | --- | --- |
| Inventario | 17 módulos, 16 fuentes oficiales; referencias y cobertura de rutas verificadas | No decide aplicabilidad legal ni audita producción |
| Salvaguardas nuevas | 17 pruebas en `scripts/tests/go-compliance.test.mjs` | Transporte, sesión y proveedores adaptados; ninguna llamada externa |
| Regresión móvil | 78 pruebas en las seis suites indicadas debajo | Datos sintéticos locales, no usuarios reales |
| Contextos no revisados | 2 casos nuevos en reservas/tareas: no llegan al transporte remoto | Rechazo técnico del contrato, no clasificación automática de sensibilidad |
| TypeScript | Móvil completo, con el código compartido de este checkout | Dependencias existentes; no reinstalación del workspace |
| Diff | `git diff --check` | No sustituye pruebas funcionales/visuales |

Total: **97 pruebas**. Las dos regresiones de contexto se ejecutaron después de
las 78 existentes; no se cuentan dos veces las pruebas repetidas.

Comandos, desde la raíz salvo donde se indica:

```sh
node scripts/check-go-compliance.mjs
node --experimental-strip-types --experimental-vm-modules --test scripts/tests/go-compliance.test.mjs
# Desde artifacts/go-app-mobile:
node --test tests/booking-assistant.test.mjs tests/task-creation.test.mjs tests/catalog-ai-import.test.mjs tests/support-gateway.test.mjs tests/location-access.test.mjs tests/central-assistant.test.mjs
node --test --test-name-pattern 'unreviewed context' tests/booking-assistant.test.mjs tests/task-creation.test.mjs
```

El fixture del test histórico de reservas no tenía registrado el adaptador
`deviceLocation` ya existente. Se añadió su importación al fixture, sin cambiar
el mecanismo de localización ni las expectativas del flujo. Se conservan sus
pruebas de confirmación y ausencia de escritura antes de revisión.

TypeScript utiliza el compilador 5.9.3 existente y una configuración temporal
derivada del `tsconfig.json` móvil. Solo resuelve `@workspace/api-zod` al código
de este checkout y `zod` a los tipos existentes; `@/*` sigue apuntando al móvil.
No se cambian enlaces ni archivos de la copia que sirve Metro para realizarlo.

## Revisión de publicación y entorno

La igualdad del SHA remoto y del checkout servido debe contrastarse al terminar
la integración, y se comunica en la entrega. Un HTTP 200 no prueba una versión:
comprobar raíz del manifiesto, SHA del checkout y presencia del nuevo aviso y
los controles en el bundle iOS. No se instala otro Metro ni se repite el reinicio
que había sido rechazado en una incidencia anterior.

En esta sesión se identificó el 8088 disponible de **PC2**, proceso 9656,
checkout `GO-Metro-MAIN-90747de967e3`. Tenía el MAIN base y una modificación
preexistente en `expo-env.d.ts`, que debe conservarse. PC1
`100.105.48.111:8088` agotó el tiempo de conexión (HTTP 000); no se interviene
en PC1 para desbloquear esta revisión. La copia congelada 8089 queda fuera
de toda actualización.

CI queda definido para PR relevantes y ejecución manual, sin disparador al
push ni llamadas a proveedores. No se presenta una ejecución local como un
job remoto completado y no se modifica facturación/permisos externos.

## Lo que no se declara probado ni realizado

- Cumplimiento legal integral, evaluación de impacto completa o dictamen jurídico.
- Contratos, bases por finalidad, retención efectiva del proveedor o transferencias.
- Derechos de usuarios ejercidos sobre datos reales ni borrado de almacenamiento.
- Validación de representación/edad o accesibilidad por personas vulnerables.
- Inmunidad a prompt injection: solo se prueban las fronteras y permisos cubiertos.
- Conversaciones, inferencias facturables o reservas reales de la tarjeta GO IA.
- QA visual/táctil física en iPhone, incluido texto ampliado y lectura del aviso.

No se han cambiado rutas/backend, migraciones, RLS, cuentas, secretos, API,
proveedores, planes o datos. No se despliega ni activa una fábrica. Las decisiones
que requieren validación humana están en README y la matriz; no se ejecutan
por registrar su necesidad.
