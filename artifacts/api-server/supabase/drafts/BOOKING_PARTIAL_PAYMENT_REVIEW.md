# Pago parcial de reservas — intervención de servidor pendiente

El `paymentPolicy` empresarial se guarda en la configuración existente de cada
negocio; la nueva cifra `bookingDepositPercent` cabe en ese mismo documento, sin
una tabla adicional. Los modos anteriores (0 = sin anticipo, 1 = completo) no
requieren migración. La configuración parcial puede prepararse en la app, pero
**no se aplica a reservas reales ni solicita cobros**.

La reserva actual congela `catalog_snapshot` (servicios, complementos y total),
pero no congela las condiciones de pago del negocio. El endpoint de creación
recibe una cotización esperada que la RPC compara con la cotización calculada
por el servidor; añadir datos solo en el cliente rompería el contrato o perdería
la instantánea. `paymentStatus: none` tampoco acredita un pago.

## Cambio mínimo a autorizar por separado

1. Tomar y restaurar una copia actual de la base en un entorno aislado.
2. Añadir a `public.bookings` una instantánea inmutable de condiciones de pago
   (porcentaje, total, importe inicial y saldo en céntimos), sin tocar reservas
   existentes ni recalcularlas. Las antiguas quedan con estado «sin condiciones
   parciales registradas».
3. Extender la RPC **existente** de reserva de catálogo para leer las condiciones
   del mismo negocio en la transacción, validar 1–99 en modo parcial, calcular el
   anticipo redondeado y el saldo por diferencia, y devolver la instantánea.
   Rechazar un cambio de condiciones entre revisión y confirmación.
4. Exponer la instantánea en las lecturas actuales para cliente y empresa;
   conservar las comprobaciones de identidad y aislamiento. No marcar `paid` ni
   emitir recibos sin una pasarela y confirmación real independientes.
5. Probar concurrencia, retrocompatibilidad, RLS vigente, reservas históricas y
   reversión antes de desplegar. La reversión funcional restaura la RPC anterior;
   no borra la columna ni datos nuevos durante una incidencia.

No se ha ejecutado SQL, cambiado RLS, desplegado backend ni activado pagos.
