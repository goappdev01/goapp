# QR comercial V1 — checkpoint aislado

La migración aditiva `20261126151423_go_commercial_qr_v1.sql` se aplicó el 26/11/2026 al proyecto Supabase `goapp` (`xiyxziyjpgnqfecbhmqn`). Los siete almacenes privados tienen RLS; `anon` y `authenticated` no disponen de acceso directo al esquema. El código de API y app continúa aislado en esta rama hasta su publicación y despliegue verificados. La función comercial aún no está lista para pilotos.

## Preparado

- Identidad automática por el `businesses.id` inmutable y resolución pública solo para empresas verificadas con reservas habilitadas.
- Contratos aislados para lotes físicos, autorización previa por ADMIN, asignación por titular, revocación y auditoría.
- Adquisición inicial inmutable y atribución de elegibilidad por reserva, sin tarifas ni cobros.
- Ruta HTTPS en el servicio API existente, entrada por esquema `go-app`, y pantallas empresariales que dejan de compartir el enlace de ejemplo cuando el servidor no confirma publicación.
- Panel ADMIN para emitir y recuperar lotes, autorizar o revocar códigos y configurar el enlace externo del proveedor. La empresa puede introducir el ID físico, previsualizar y confirmar la asignación autorizada; el enlace A6 solo aparece si el servidor lo habilita.
- Cartel original aprobado (1055 × 1491 px) conservado sin alterar, con QR ilustrativo cubierto exclusivamente por el QR vectorial real. PDF A6 exacto y lote de cuatro carteles en A4 con márgenes y guías de corte. El enlace de cada QR se decodificó de los PDF renderizados en A6 y A4.
- Descarga autenticada y compartición del PDF empresarial A6 y del lote ADMIN A4 preparadas en la app.
- Prueba PostgreSQL aislada de asignación, aislamiento, atribución y límite de emisión; pruebas PDF; TypeScript de app y API; compilación local API.

## Pendiente antes de MAIN y producción

1. Probar el enlace HTTPS, esquema `go-app`, lectura física del QR y compartir PDF en una build real. Expo Go no valida enlaces universales ni continuidad tras instalar desde la tienda. Si se pierde el origen al instalar, exigir nuevo escaneo; dejar origen `unknown` mientras tanto.
2. Verificar la migración y las rutas con cuentas autorizadas y dos empresas reales, incluido aislamiento, concurrencia, persistencia entre sesiones y titularidad. El preflight de producción del 26/11/2026 mostró cero empresas y cero reservas, por lo que el recorrido real aún no es posible.
3. Definir retención y limpieza controlada de referencias de visita no reclamadas. El límite de emisión reduce el abuso, pero no sustituye esa política.
4. El arte aprobado no tiene un área para el nombre público. El PDF identifica la empresa mediante QR único; añadir el nombre visible requeriría alterar el arte fuera del QR. No declarar cartel nominal hasta resolver ese punto.

El dominio histórico `go.teso.app/b/mi-negocio` no es un destino válido. El borrador usa el dominio HTTPS ya existente del servicio Railway y no cambia DNS ni infraestructura.
