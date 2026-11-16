# GO Compras — parche local para revisión

Esta entrega actualiza la experiencia V1 descrita en `compras-v1-local.md`. Las dos capturas mencionadas en la tarjeta no están adjuntas en este entorno y no se han consultado. Se ha seguido la especificación escrita. No se ha realizado una revisión física en iPhone.

## Comportamiento implementado

- Pantalla «Compras» blanca con azules suaves, supermercado seleccionable y dos importes: «Cogido» y «Previsto». Cada uno separa los productos sin precio aplicable; las monedas se suman por separado. Un precio observado en otra tienda no se traslada al cambiar de supermercado.
- Filas con marca persistente, variedad, formato y tamaño opcionales, cantidad con −/+, entrada decimal, precio por unidad y subtotal. «Cogido» es la acción grande; «IR» es secundaria. Solo los controles explícitos ejecutan acciones. Marcar cogido conserva una cantidad provisional en edición.
- «Lista» permanece abajo a la izquierda y «Añadir» a la derecha. El cierre flotante de Compras está abajo a la derecha y responde al teclado. Los controles frecuentes de la fila cambian de lado para zurdos; el orden de lectura y las pestañas no se invierten.
- «Añadir» muestra GO en el centro de ocho órbitas completas. «Otros» ocupa el sector inferior derecho e «Higiene» el superior izquierdo. Las ocho entradas agrupan las doce categorías existentes; no se elimina ninguna. El conjunto baja hasta el espacio disponible y permite desplazamiento en pantallas cortas. El texto ampliado aumenta el espacio vertical entre órbitas sin sacar GO del centro.
- Categoría → productos habituales o sugerencias locales → edición corta: producto, cantidad, unidad, marca y formato. El resto de campos está plegado en «Más opciones». Marca y precio no son obligatorios. Favoritos distinguen marca, variedad, formato y tamaño.
- «Más acciones de compra» mantiene habituales, favoritos, compras realizadas, orden de secciones e incorporación confirmada de notas antiguas. «Guardar compra» conserva una instantánea de los artículos cogidos y todos sus precios; los retira de la compra activa sin borrar el catálogo.
- En «NOTA», un solo grupo flotante reúne carrito → flecha existente → papelera. Se quitan el acceso largo a Compras, la papelera superior y la reserva lateral de anchura. La disponibilidad del carrito y las funciones de eliminación/retirada y confirmación siguen dependiendo de los callbacks existentes. El grupo se limita al espacio de escritura, fuera del pie y del teclado. Si el espacio con teclado es menor que el grupo, se recoge hasta ocultar el teclado con la flecha inferior.

## Datos, órdenes de GO y rutas

Se conserva la única lista canónica, su identidad, la cola de escritura y lectura de verificación de `go_log_v1`, los borradores, el orden de categorías y las observaciones antiguas. Las extensiones del documento V1 son opcionales; no se ejecuta ninguna migración ni se toca backend, API, permisos o infraestructura. La posición de la lista se recuerda por cuenta y contexto durante la sesión; el componente permanece montado al abrir categorías o paneles.

Los subtotales convierten g/kg y ml/l y usan contenido declarado para paquetes y unidades. Las comparaciones requieren producto, moneda, dimensión normalizada, marca, variedad y formato equivalentes. Las observaciones antiguas sin identidad explícita de producto se conservan; no se presentan como comparaciones verificadas. Las nuevas observaciones conservan esa identidad y no se reutilizan al renombrar el artículo como otro producto.

GO ejecuta órdenes delimitadas mediante interpretación local: «Añade 2 kg de manzanas», «Cantidad de manzanas a 1,5», «Marca cogido manzanas», «Quita manzanas», «Qué queda» y «Ruta». Las presentaciones ambiguas requieren elegir una fila y las órdenes compuestas no se ejecutan. Quitar retira de la compra sin eliminar el producto ni su historial. La eliminación permanente sigue requiriendo la confirmación existente. No se integra un nuevo modelo remoto ni se afirma comprensión general de lenguaje natural. El dictado reutiliza `useBookingVoice` y su transcripción real; sus permisos, disponibilidad y errores se muestran mediante el flujo existente. No se ha verificado el servicio de transcripción en un dispositivo físico.

La ruta manual usa pendientes y el orden guardado, dejando refrigerados al final y congelados en último lugar. «IR» muestra la referencia anotada para ese producto y supermercado o informa de que no se conoce. Se pueden guardar referencias manuales sin pedir ubicación. No hay una fuente real de planos interiores ni posicionamiento conectada a esta pantalla. El adaptador de motor acepta un grafo de pasillos real por tienda, usa distancias por sus conexiones, ordena las paradas dentro de cada grupo de temperatura y añade una caja conocida. Se prueba con un grafo de prueba; no acredita disponibilidad de un plano comercial ni navegación física. Nunca declara navegación interior disponible.

## Comprobación local

Comandos ejecutados desde `artifacts/go-app-mobile` (salvo `git diff --check`, desde la raíz):

```text
node --test tests/shopping-experience.test.mjs tests/unified-notes.test.mjs tests/unified-notes-access-routing.test.mjs tests/go-note-floating.test.mjs tests/go-note-functions.test.mjs tests/go-note-lateral-unified.test.mjs tests/go-note-layout.test.mjs tests/go-note-keyboard-back.test.mjs tests/go-note-tool-lifecycle.test.mjs
node --test tests/shopping-experience.test.mjs tests/unified-notes.test.mjs
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/expo/bin/cli export --platform ios --output-dir .expo/compras-redesign-ios-validation
git diff --check
```

La regresión ampliada terminó con 192 pruebas aprobadas y ningún fallo. La revalidación final terminó con las 48 pruebas del modelo y controles de Compras aprobadas, TypeScript sin errores y la exportación local de iOS completada. Los registros están en `.expo/compras-redesign-tests.tap`, `.expo/compras-redesign-final-tests.tap` y `.expo/compras-redesign-ios-export.log`. Las pruebas montan los componentes reales con puertos nativos de prueba y reabren almacenamiento temporal; no sustituyen la revisión visual o táctil en iPhone. Se cubren pantallas de 320/390/430 puntos, otras anchuras, ambas manos, texto ampliado, teclado, independencia de acciones, privacidad por cuenta, escritura fallida, idempotencia, precios, historial y recorridos con y sin grafo.

No se han hecho commits, push, despliegues ni escrituras en Trello. La aprobación del parche exacto, publicación y comprobaciones de los servicios corresponden al coordinador. La exportación aquí mencionada es un artefacto local.

## Revisión personal de Raúl

La guía ordenada de acciones concretas en iPhone figura en `GO_FACTORY_EVIDENCE.validation` de la entrega. Revisar en un iPhone pequeño y otro grande, con ambas lateralidades y texto ampliado; especialmente posiciones flotantes, campos decimales y recorrido sin plano. No se dispone de datos de plano comercial para una prueba física de navegación interior.
