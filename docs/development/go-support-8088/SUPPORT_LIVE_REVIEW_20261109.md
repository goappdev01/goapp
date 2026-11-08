# SOPORTE: código seguro y activación alojada pendiente

Base revisada: MAIN 2f6dc56d4de2e9b35c091e8b2b0dc77cadbd566e.
Worktree exclusivo: codex/agent4-support-live-20261109.
No se modificó el trabajo ajeno de AGENTE 4 VISUAL, el puente ni Trello.

## Cambios

- Borradores locales privados por cuenta/contexto empresarial, con copias durables
  de adjuntos y clave de idempotencia persistida antes del primer POST. Cerrar no
  descarta. Limpiar texto conserva archivos; un error conserva texto y reintento.
- Filtros personal/empresa explícitos en cliente, API y SQL, con autorización de
  titular verificado en servidor. No se amplían membresías ni permisos de empleados.
- Actualización de bandejas al primer plano y cada 30 segundos mientras son visibles.
  Invalidación inmediata al cambiar sesión y guardas contra resultados tardíos,
  incluida recuperación de borrador anterior. Doble pulsación de respuesta bloqueada.
- El único cambio en app/index.tsx es la clave React del formulario por empresa.
  No cambian estilos, posiciones, controles, QR, órbitas ni módulos ajenos.
- Preflight de lectura y deshabilitación no destructiva preparados, no ejecutados
  en producción. La creación SQL existente conserva su única fuente de datos.

## Verificaciones

- 100/100 pruebas móviles de SOPORTE, incluido EQUIPO existente, formularios reales
  montados, contexto, recuperación, adjuntos, sesión, claves React y teclado.
- 5/5 pruebas API: JWT, rutas, RLS, hilos, idempotencia, Storage, retención,
  Express con PGlite persistente y reapertura. Auth/Storage son adaptadores sintéticos.
- 1/1 prueba PostgreSQL nativo 15.19 persistente: tres tipos, titular empresarial,
  terceros denegados, notas internas, respuestas, reinicio y deshabilitación
  sin eliminar las tres solicitudes y sus tres mensajes. Cluster temporal propio,
  solo localhost y detenido al finalizar. No es un backup ni un E2E alojado.
- TypeScript móvil y API/contratos correctos; git diff --check.
- Exportación iOS Expo SDK 58 correcta:
  entry-288d7ab58591a302cfba88d15aa5b01f.hbc.
- La regresión ampliada ejecutó 453 pruebas: 436 pasaron y 17 fallaron.
  Una era la fixture de claves React que no incluía contexto de empresa; se corrigió
  y la suite SOPORTE final pasa 100/100. Los otros 16 fallos se reprodujeron, con
  los mismos nombres, en la copia limpia del mismo MAIN (44/60 y 16 fallidas).
  Corresponden a fixtures antiguas de Auth/Notas y comparaciones históricas de
  Calendario/Landing/navegación. No se ocultaron ni se modificaron módulos ajenos.

## Estado alojado y autorización

Supabase goapp / xiyxziyjpgnqfecbhmqn, PostgreSQL 17.6: no existen tablas,
RPC, esquema privado ni bucket SOPORTE. Las dependencias de perfiles, empresas
y membresías ADMIN sí son compatibles. No se ejecutó DDL ni se cambiaron datos.

Railway existente: healthz 200; capacidades sin sesión 401. Versión observada antes
de publicar: c259730fc6a1723f3f7da0faa5cda3d14f2a0906. Esto no demuestra recepción.
La versión desplegada debe comprobarse por separado del SHA móvil/GitHub.

GO_SUPPORT_LIVE_ENABLED permanece false porque no existe el almacenamiento alojado.
No hay cuentas/negocio de pruebas alojadas expresamente identificadas para esta
transacción. No se usaron sesiones de otras personas ni se crearon roles ADMIN.

La autorización específica de DDL/bucket/RLS sigue pendiente, y antes de pedirla
debe acreditarse respaldo alojado y restauración compatible en aislamiento.
El conector no expone backups y el navegador de Work está deshabilitado.
Se pidió únicamente habilitar ese acceso o identificar una exportación privada.
El dump local antiguo no acredita respaldo. Storage requiere recuperación de
bytes separada. La retención de doce meses no tiene todavía un programador e
identidad limitada autorizados; no se anuncia borrado automático garantizado.

El procedimiento exacto, huellas, alcance, pruebas alojadas y reversión están en
artifacts/api-server/supabase/drafts/GO_SUPPORT_ACTIVATION.md.
Ninguna prueba sintética acredita USUARIO → ADMIN → USUARIO alojado ni
EMPRESA → ADMIN → EMPRESA. Ambos circuitos siguen PENDIENTES.
La validación táctil final corresponde al propietario en iPhone.
