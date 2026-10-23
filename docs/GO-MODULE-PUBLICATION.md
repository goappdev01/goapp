# Publicación progresiva de módulos GO V1

## Implementación preparada

La política compartida está en `lib/api-zod/src/module-publication.ts`. Separa visibilidad, habilitación de operación y autorización sobre datos. No cambia `SECTORS`, las tablas de negocio, las preferencias ni las reservas existentes. Los componentes y motores siguen siendo compartidos con los sectores ocultos.

El perfil predeterminado del primer piloto expone únicamente `belleza/peluqueria`. Las demás subactividades de Belleza y los demás sectores se conservan para pruebas internas. Contactos, Calendario, Comunicación, IA, Notas y el resto de funciones generales conservan sus accesos actuales. GO Imprimir solamente figura como metadato de desarrollo: no se importa ni se integra su proyecto.

`BookingSearchOverlay` aplica la misma proyección a categorías, texto, recientes y selección por ID. `GoProveedorReservaSheet` rechaza entradas de actividades no habilitadas. La normalización exacta `Belleza Peluquería` → `peluqueria` resuelve el formato histórico comprobado sin deducir la actividad del nombre de un negocio ni transformar datos almacenados.

Un repositorio DEMO no habilita sectores por sí solo. USUARIO, incluso cuando pertenece al propietario, conserva la experiencia del piloto. ADMIN verificado con permiso `development` puede probar módulos internos. La presentación EMPRESA DEMO del propietario puede utilizar sus adaptadores locales existentes; esta autorización visual no habilita solicitudes internas contra datos remotos.

## Control del servidor

Las rutas de descubrimiento de negocios, servicios, profesionales y disponibilidad filtran sectores no publicados. El middleware anterior a las rutas comprueba el negocio real antes de:

- POST `/supabase/bookings` (contrato antiguo y servicios múltiples).
- POST `/supabase/bookings/timeline`.
- POST `/supabase/bookings/catalog`.
- POST `/supabase/catalog/quote`.
- GET `/supabase/booking-availability`.

El identificador de actividad procede del negocio consultado con las restricciones existentes. Un campo `role`, `internal` o categoría enviado por el cliente no concede acceso. El encabezado `X-GO-Internal-Modules: 1` solicita una comprobación viva de ADMIN y de su permiso `development`; no es una credencial. Las consultas internas del catálogo público mantienen el acceso anónimo y su RLS, por lo que ADMIN no obtiene lectura adicional de datos privados.

El historial, la cancelación, la negociación de reservas existentes y los endpoints de gestión empresarial conservan sus controles de propiedad/RLS. Ocultar un módulo no elimina citas ni desactiva su gestión histórica.

## Consultar y preparar activaciones posteriores

ADMIN → panel general → **Publicación de módulos GO** consulta el mismo registro del servidor. La consulta está protegida por el control ADMIN existente. No presenta un interruptor local que finja publicar un módulo.

Configuración de servidor por entorno, sin secretos:

```json
{
  "version": 1,
  "audience": "pilot",
  "stages": {
    "reservas.peluqueria": "pilot",
    "reservas.restaurante": "internal",
    "go.imprimir": "development"
  }
}
```

Este JSON se proporciona mediante `GO_MODULE_PUBLICATION` en el backend del entorno autorizado. Las etapas posibles son `development`, `internal`, `pilot` y `public`. `pilot` solo se ofrece cuando la audiencia configurada es `pilot`; `public` también se ofrece a la audiencia `general`. Puede cambiarse una actividad concreta o un sector completo. Las configuraciones inválidas vuelven a la proyección mínima del piloto. No existe autorización basada en `NODE_ENV`, en un correo ni en `user_metadata` editable.

Una activación requiere un cambio de configuración autorizado en ese entorno. Este trabajo no cambia variables, reinicia servicios ni publica módulos para usuarios reales. La infraestructura aún no tiene un registro administrativo persistente de cohortes: esta entrega ofrece perfiles por entorno y acceso interno por permisos, sin inventar un sistema de pilotos/usuarios nuevo.

## Pasarela privada

El contrato local incorpora únicamente GET `/api/supabase/module-publication` y GET `/api/supabase/admin/module-publication`. El primero es metadato público sin cuentas ni registros empresariales; el segundo conserva la comprobación del propietario de la pasarela. El encabezado interno se admite en CORS de las lecturas permitidas, desde el origen de desarrollo ya autorizado. No se añaden escrituras ni se amplía la lista de orígenes.

La pasarela activa y los demás servicios no se han sustituido. Si una instancia conserva su compilado anterior, no debe considerarse validada la nueva política en ejecución.

## Límite de seguridad antes de publicar el piloto

El código del backend evita saltarse la interfaz utilizando sus rutas HTTP. **No se ha probado ni modificado la exposición directa de PostgREST/Supabase de producción.** Una función RPC de reservas accesible directamente con la clave pública y JWT podría eludir el middleware de publicación aunque siga respetando los permisos de datos existentes.

Antes de habilitar el piloto comercial, Nelson debe comprobar que las operaciones reales entran por este límite y que los permisos/RLS/RPC directos aplican una política equivalente, o preparar una protección transaccional de base de datos compatible con el contrato de publicación. Cambiar solo botones, CORS o el backend no sustituye esa comprobación. No se afirma que la base real ya esté protegida por esta política; no se ejecutó SQL ni se cambió producción durante su preparación.

## Pruebas ejecutadas y pendientes

- Ocho pruebas móviles de política y del hook real: perfil piloto, catálogo conservado, configuración posterior, categorías históricas, identidad y contexto DEMO.
- Diez casos HTTP de integración (once resultados contando su contenedor): consultas públicas, IDs directos, cuatro rutas POST y disponibilidad, ADMIN legítimo/forjado/revocado, permisos de datos, historial, fallo temporal y JSON de recursos malformado.
- Dos casos nuevos de pasarela y diecinueve regresiones CORS: 21/21.

Estas pruebas utilizan datos ficticios y no acreditan notificaciones o interacción física. TypeScript, la regresión conjunta y la comprobación visual final de iPhone se registran en el informe de consolidación general. Activación de servicios, revisión de accesos directos/RLS y validación física quedan separadas de la implementación local.
