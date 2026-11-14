# GO · Alta de empresa y prueba gratuita V1

## Estado de entrega

El código de API, iPhone, administración y las pruebas acompañan al borrador
`business_trial_onboarding.sql`. **El SQL no se ha aplicado a producción.**
`GO_BUSINESS_TRIAL_ONBOARDING` queda desactivado por defecto, de modo que
Railway y Expo conservan el flujo empresarial anterior mientras se autoriza
la transición. No configurar ni activar proveedor de SMS, WhatsApp o correo.

## Orden obligatorio para activar

1. Confirmar desde el Supabase del proyecto `goapp` el esquema real, las
   políticas RLS, `admin_memberships`, `storage` y las migraciones ya aplicadas.
   El preflight existente es `booking_live_preflight.sql`; preparar uno específico
   para este cambio y ejecutar **solo consultas**.
2. Realizar respaldo real y **probar una restauración** en un entorno aislado.
   Sin restauración comprobada, detener la activación.
3. Revisar este SQL con el esquema alojado, registrarlo con la CLI de Supabase
   como migración nueva y probarlo en una base de prueba. Verificar las políticas
   de Storage, el rechazo de acciones anónimas y la conservación de negocios
   previos. No reutilizar números de migración ni alterar los ya desplegados.
4. Obtener autorización expresa para aplicar esa migración concreta a Supabase
   real. Ejecutar solo la migración aprobada y cotejar sus efectos.
5. Establecer `GO_BUSINESS_TRIAL_ONBOARDING=enabled` **solo después** de
   confirmar el esquema. No modificar ninguna otra variable ni servicio.
6. Probar con dos cuentas controladas de empresa y una de cliente:
   teléfono/consentimientos → prueba aceptada → identidad y documentos fiscales
   privados → solicitud → admin solicita cambios/rechaza/aprueba → acceso a los
   ocho pasos únicamente después de la aprobación. Comprobar 30 días desde
   aprobación, caducidad, reserva cruzada y aislamiento entre cuentas y DEMO.
7. Verificar la versión de GitHub MAIN, Railway, Metro 8088 e iPhone físico.
   **No actualizar 8089 automáticamente.**

## Límites deliberados

- Los avisos quedan registrados en `go_notification_outbox` y el estado de
  aprobación se consulta desde la aplicación. No hay proveedor seleccionado
  ni un trabajador de envío; **no se envían mensajes externos**.
- No se realizan cargos ni renovaciones automáticas. Si termina la prueba,
  el negocio conserva sus datos y pierde el acceso operativo hasta definir el
  alta comercial posterior.
- Los archivos se guardan en Storage privado con JWT, RLS y tamaño máximo
  5 MB. Solo la cuenta dueña y la administración autorizada pueden verlos.
- No se migran las empresas locales de prueba ni los datos DEMO a Supabase.
- Antes de abrir el registro al público faltará publicar las versiones finales
  de las condiciones de uso y la política de privacidad junto al consentimiento.

## Validación local de código

`pnpm run typecheck` en `artifacts/api-server` y `artifacts/go-app-mobile`;
`node --test tests/business-access.test.mjs tests/business-trial-onboarding.test.mjs`
para API y `node --test tests/business-access.test.mjs` para móvil.
