# COMPRAS V1 — implementación y validación

Acceso: ámbito personal de una cuenta autenticada → Listados → botón «Notas» → pantalla «NOTA» → «COMPRAS · LISTA PERSONAL». El mismo acceso está en el editor ordinario de NOTAS abierto desde Calendario. Abrir la nota canónica guardada muestra directamente «COMPRAS». Volver conserva el borrador de la nota ordinaria y el origen de navegación.

## Implementación

- `lib/unifiedNotes.ts`: extensión opcional y tipada `NoteDocument.shopping`; mantiene el documento unificado.
- `lib/shoppingNote.ts`: categorías, unidades, validación decimal, artículos, borrador recuperable, precios, estimaciones, filtros, orden y operaciones estructuradas.
- `lib/shoppingNoteStore.ts`: creación canónica idempotente, comprobación de sesión/contexto, operaciones en la cola existente y lectura de verificación del almacenamiento.
- `components/notes/GoShoppingNote.tsx`: pantalla completa, controles manuales, edición, selección para próxima compra e incorporación expresa de notas antiguas.
- `components/notes/ShoppingReorderSurface.tsx`: asas con Pan nativo tras 500 ms; reutiliza `boardDropTarget` de GO. Conserva el gesto durante la respuesta visual, limita el destino al mismo bloque y acota el autodesplazamiento a 240 puntos/s y al contenido existente. Cancelar detiene los frames y conserva el orden.
- `components/notes/GoNoteEditor.tsx` y `app/index.tsx`: entrada y navegación; no cambia el formulario ordinario cuando no se abre COMPRAS.
- `lib/unifiedNoteStore.ts`: impide que un guardado genérico sustituya, cambie de destino o adjunte la nota especializada; dirige a COMPRAS.
- `tests/unified-notes.test.mjs` y `tests/unified-notes-access-routing.test.mjs`: pruebas adicionales de almacenamiento, controles y navegación.

Se utiliza exclusivamente `go_log_v1`, `NoteDocument` y `updateGoLog` existentes. No se añaden tablas, almacenes genéricos, servicios remotos ni migraciones. La nota queda en PENDIENTES y mantiene su identidad, propietario, contexto y revisiones. La identidad canónica incorpora cuenta y contexto personal; DEMO y LIVE siguen siendo ámbitos separados de GO. Los contextos de empresa y administrador no pueden abrir una lista personal por esta vía. La UI oculta sus datos mientras no se verifica la cuenta o cambia la sesión.

Las notas antiguas llamadas «Compras» no se adoptan ni modifican. La persona revisa líneas, selecciona nombres y confirma su incorporación; se omiten nombres ya presentes. Se informa de que las líneas se incorporan como nombre y cantidad 1 para revisar, sin interpretar sus cantidades como si se conocieran. Los borradores pendientes no se pierden al incorporar notas o modificar otro artículo. Documentos incompatibles, dañados o canónicas duplicadas producen error y se conservan para revisión.

## Uso manual y persistencia

«AÑADIR PRODUCTO» admite nombre, cantidad por defecto 1 y datos opcionales. Una categoría local exacta puede proponer panadería para Pan o limpieza para Detergente; ante incertidumbre propone Otros. A–L contiene las doce secciones solicitadas. Se recuerdan categorías corregidas, bloques contraídos y recorrido elegido. «ORDENAR SECCIONES» presenta las asas de todos los bloques; «TERMINAR ORDEN DE SECCIONES» vuelve a productos. Para arrastrar productos se elige TODOS. Cambiar de sección se hace expresamente en EDITAR.

Los números se recalculan sobre las filas visibles; los IDs no cambian. COMPRADO es reversible y no elimina. TODOS conserva también los artículos retirados de la compra. DETALLES permite incluir/retirar de la compra o eliminar con confirmación. «PREPARAR PRÓXIMA COMPRA» comienza sin selección: solo los habituales elegidos y confirmados vuelven a pendiente. Los demás mantienen su estado.

Los campos sin terminar se guardan como borrador en el mismo documento: «1,» no se convierte en una cantidad válida. Tras un cierre se recupera el borrador reconocido por almacenamiento; una interrupción anterior al reconocimiento puede perder la última pulsación, pero no sustituye el artículo confirmado. Un fallo de escritura o de verificación permanece visible y permite reintentar. Reintentar el mismo guardado tras fallo de lectura no duplica el producto ni el precio. Una edición concurrente de cantidad/categoría/precios se rechaza conservando el borrador; los cambios de COMPRADO no causan conflictos de edición innecesarios.

## Precios e IA

Cada artículo guarda varias observaciones privadas con tienda, fecha, moneda, precio, contenido opcional, marca y formato. Añadir una observación no crea otro artículo ni elimina las anteriores. «USAR PARA ESTIMACIÓN» permite elegir una referencia conservando el historial; DETALLES distingue referencia elegida y última anotación.

Se normaliza g/kg, ml/l y unidades cuando existe contenido verificable; sin él se muestra «No comparable». La comparación conjunta requiere misma moneda, dimensión, marca y formato declarados. Tamaños diferentes se comparan por contenido; un envase menor no se considera más económico por su precio de envase. No se declara equivalencia de marca/formato desconocidos. Los precios por peso o volumen requieren contenido verificable para estimar. Un tamaño de artículo modificado utiliza el coste normalizado, sin trasladar ciegamente el precio de otro envase. El total es ESTIMADO, indica cuántos artículos carecen de precio aplicable y separa monedas.

No hay IA, voz ni transcripción conectadas a COMPRAS. La pantalla lo indica. `previewShoppingInput` produce una previsualización estructurada que exige corrección cuando faltan producto/cantidad/unidad o hay un producto existente sin seleccionar; el consumidor futuro debe mostrarla y confirmar antes de enviar su operación a `runShoppingOperation`, siempre sobre la canónica del usuario. No hay interpretación ficticia de frases, scraping, localización, pedidos, pagos ni compartición.

## Verificación local y límites de la entrega

Comandos de comprobación ejecutados desde `artifacts/go-app-mobile`:

```text
node --test tests/go-note-functions.test.mjs tests/unified-notes-access-routing.test.mjs tests/unified-notes.test.mjs
node --test --test-name-pattern="COMPRAS UI: measured long-press" tests/unified-notes.test.mjs
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/expo/bin/cli export --platform ios --output-dir .expo/shopping-ios-validation
```

Las pruebas de compra cargan los módulos reales y la sesión real de prueba, utilizan la cola existente con archivos temporales y reabren el almacén. Los controles se montan con React y ejecutan sus callbacks contra ese almacenamiento. Se prueban cuentas separadas, idempotencia, fallos de disco/lectura, cantidades, categorías, filtros, repetición, precios, borradores, rutas, arrastre con geometría medida y autodesplazamiento limitado/cancelado. Se ejercitan las propiedades de controles con 320/390/768 puntos, escalas 1/1,8/2 y ambas manos. Los eventos y medidas nativos se proporcionan mediante puertos de prueba: esto no acredita reconocimiento táctil, geometría física ni teclado de un iPhone real. También se ejecutan las regresiones aprobadas de NOTAS normales, destinos, adjuntos, privacidad y navegación.

Resultado observado: suite completa, 125 aprobadas, 0 fallos. Tras convertir el indicador de destino en una superposición que no cambia la altura de las filas, la prueba dirigida de arrastre volvió a pasar (1/1); comprueba también que el gesto conserva su instancia durante la respuesta visual. TypeScript terminó con código 0. La exportación iOS final terminó con código 0 y generó `_expo/static/js/ios/entry-731eb762f4c9d30c38e2f68de7af08b3.hbc` (12 MB). Registro de la suite: `.expo/compras-tests.tap`; registro de la última exportación: `.expo/compras-ios-export.log`. Son artefactos locales ignorados por Git.

La persistencia utiliza el almacenamiento local existente de este dispositivo; no se promete sincronización entre teléfonos. No hace falta un backend nuevo para la gestión manual. Se requiere la sesión local autenticada válida y el ámbito personal.

La implementación se inició en `26b03ce7` y se integró después sobre el MAIN vigente. Esta exportación iOS es local y, por sí sola, no acredita el contenido servido por 8088. La comprobación de Metro y la publicación se registran por separado. No se ha escrito en Trello.

Pendiente de Raúl en iPhone: ejecutar las acciones ordenadas de `GO_FACTORY_EVIDENCE.validation` del informe de entrega. Es una revisión física pendiente; no se declara realizada.
