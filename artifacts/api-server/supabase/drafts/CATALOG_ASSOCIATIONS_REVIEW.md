# GO Empresa — asociaciones de catálogo (borrador para revisión)

No activar en bases reales sin autorización. Esta rama aislada conserva los borradores anteriores de negociación, QR y tiempos; no es un paquete independiente listo para fusionar entero.

## Modelo reutilizado

`public.services` ya alimenta `BookableItem` y contiene las tarifas de los elementos del catálogo. Se conserva esa identidad. `ui_metadata.catalogKind` distingue explícitamente servicio/producto; los registros antiguos siguen siendo servicios. Un producto nuevo tiene duración cero, no un minuto ficticio. No se crea una tabla paralela de productos ni otro motor de reservas, precios de cliente o disponibilidad.

`go_catalog_private.associations` guarda referencias UUID de origen/destino, empresa, modo, activación y revisión optimista. Sirve para las cuatro combinaciones de producto/servicio. El mismo cierre dirigido expande incluidos y elecciones aceptadas, detecta obligatorios sin aceptar y evita cobrar dos veces un mismo elemento. Las asociaciones inactivas también intervienen en el control de ciclos, para que activarlas después no pueda introducirlos. Los elementos retirados pueden tener sus asociaciones eliminadas desde la configuración.

El precio procede exclusivamente de `services.price/currency` vigentes. Incluido conserva su tarifa de referencia y aporta cargo cero. Opcional no se selecciona ni cobra automáticamente. Obligatorio requiere aceptación expresa. Una moneda mezclada, una tarifa desconocida, una selección que ya no se ofrece o un elemento inactivo impiden confirmar. No se modifica ninguna tarifa, descuento, impuesto, pago, devolución ni factura automáticamente.

## Contratos

- `POST /api/supabase/catalog/associations`: `{businessId, operation: list|create|update|delete, input}`. Crear usa `sourceId,targetId,mode`; actualizar/eliminar usan `id,revision`. Actualizar puede cambiar `mode,active`.
- `POST /api/supabase/catalog/quote`: `{businessId,rootIds,selectedIds}`. Devuelve líneas, opciones, obligatorios pendientes, total, moneda e identificadores de servicios que necesitan agenda. Es el contrato reutilizable por un futuro flujo de venta; no finaliza ni registra una venta.
- `POST /api/supabase/bookings/catalog`: selección y presupuesto revisado, instante, profesional, plan temporal revisado y clave idempotente. Se vuelve a presupuestar bajo el mismo bloqueo de empresa y se compara el presupuesto aceptado. Se llama al motor temporal existente con todos los servicios aceptados. El servidor inserta una sola reserva y adjunta `catalog_snapshot`. Los productos no añaden tiempo ficticio.

Las rutas heredadas siguen funcionando para reservas sin asociaciones. No pueden saltarse el consentimiento cuando existen asociaciones. Una negociación conserva el presupuesto aceptado y el historial; cancelar libera los recursos mediante el circuito existente. El registro financiero `total_price`, cuando está instalado el borrador de servicios múltiples, utiliza el total aceptado sin doble cargo por servicios incluidos.

## Seguridad

Se reutilizan JWT del solicitante y permisos de empresa existentes; no se utiliza service_role. Gestionar asociaciones exige propiedad de esa empresa. El presupuesto de cliente exige empresa verificada y reservas habilitadas, o su propietario. Crear para otra persona reutiliza la autorización del motor de reservas; no se amplían permisos globales de trabajadores.

Tablas privadas con RLS, sin accesos directos para clientes ni escrituras directas de snapshots. Las funciones privadas privilegiadas comprueban auth.uid(), tienen search_path vacío y no son ejecutables por anon/PUBLIC. Las funciones públicas son wrappers deliberados. Clave idempotente, revisión de asociaciones, bloqueo por empresa y guardas de reserva protegen frente a dobles pulsaciones, ciclos simultáneos, cambios concurrentes y reintentos después de perder una respuesta.

## Conexiones móviles

`CatalogAssociationManager` se incorpora a Qué ofreces; lee los elementos persistidos por UUID y reutiliza createBookableItem/saveBookableItem y sus permisos para productos. Permite editar relaciones, activarlas/desactivarlas y eliminarlas. El guardado de configuración de servicios conserva los productos y no los asigna accidentalmente como servicios de un profesional.

`CatalogComplementSelector` es compartido por los dos formularios existentes de reserva. Presenta tarifa, condición y consentimiento, invalida elecciones al cambiar empresa/catálogo/cuenta y espera la respuesta del servidor. Los complementos de servicio usan los mismos selectores de fecha y hora y las mismas agendas, sin fichas duplicadas. La reserva recuperada desde Calendario/Listados mantiene catalog_snapshot en su recibo canónico.

## Dependencias y límites que Nelson debe revisar

1. Revisar y autorizar los borradores previos de negociación, QR y tiempos; después `catalog_associations_v1.sql`. El borrador de servicios múltiples es opcional y se ha probado como variante. Generar la migración oficial mediante la CLI disponible durante la consolidación; este archivo no es una migración aplicada.
2. En esta base no existe un registro operativo de ventas, facturación o stock. El contrato de presupuesto está preparado para ventas, pero no se inventa una venta ni se escribe en un sistema alternativo. La persistencia probada corresponde a la reserva existente.
3. Si un producto declara stock/inventario gestionado, el presupuesto se bloquea con `CATALOG_STOCK_INTEGRATION_REQUIRED` hasta enlazar su autoridad de inventario. No se inventan existencias ni se descuenta stock.
4. DEMO AsyncStorage no simula asociaciones. Se requiere el servidor de pruebas aislado para validarlas. Metro 8086 y su pasarela no se cambian ni se abren rutas de escritura.
5. La configuración de catálogo conserva los permisos actuales del propietario. El acceso de trabajadores a reservas de terceros necesita la política ya autorizada para ese rol; no se concede por conocer un nombre o un ID de profesional.
6. Cada elección representa una unidad del elemento, con referencias únicas, hasta 32 raíces y 64 elementos expandidos. No se incorpora un configurador nuevo de cantidades, descuentos ni impuestos.

## Validación reproducible aislada

Usar exclusivamente `GO_CATALOG_TEST_URL=postgresql://go_booking_test_owner@127.0.0.1:65439/go_catalog_association_test` y `GO_BOOKING_TEST_CONFIRM=isolated`. El helper comprueba nombre, propietario, interfaz y marcador antes de ejecutar SQL. `prepare-catalog-db.mjs` se niega a sobrescribir una base poblada sin rebuild explícito; no lee .env. `GO_CATALOG_MULTI_REFERENCE` permite la variante revisada de servicios múltiples.

`catalog-associations.postgres.test.mjs` utiliza PostgreSQL/PostgREST reales, JWT efímeros ficticios y Express en puertos locales aleatorios: incluidos/opcionales/obligatorios, cuatro tipos, cambios de tarifas, edición/borrado, privacidad, ciclos y confirmaciones simultáneas, reintentos, cancelación, recibos, negociación y reutilización en otro sector. Las pruebas móviles ejecutan el selector real y sus decisiones con transporte controlado; no equivalen a validación física.

Documentación consultada: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [cambios recientes](https://supabase.com/changelog). No se detectó un cambio de API relevante para estos contratos PostgreSQL/RPC existentes.
