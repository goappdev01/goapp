# Listados: altura útil, tarjetas y cierre compartido

Base: MAIN `67e7cbaedd8741d2432a88bd9615d1e9316e2e8a` (205).
Corrección exclusivamente de presentación, con datos y callbacks existentes.

## Causas y cambios

- `BottomSheet` limitaba el scroll a 460 puntos. Listados opta ahora a una altura
  flexible hasta `safeArea.top + 8`, con scroll interior y pie existente. Se
  conservan minimización, reapertura y cierre por gesto en dos niveles. Los demás
  sheets conservan su tamaño; Notas mantiene su único adaptador de teclado.
- El antiguo cierre redondo se construía dentro del pie. Se retira solo ese
  control y se reutilizan `GoCloseButton` (cuadrado redondeado/flecha abajo) y
  `DraggableFAB` (pulsación larga de 500 ms, posición persistente y límites).
  El flotante está fuera del reconocedor de arrastre del panel, para que moverlo
  no cierre Listados. Su región respeta zona segura, teclado y altura medida del
  pie. Inicio a derecha/izquierda según mano; preferencia de posición por mano.
- Las reservas usaban el estado como fallback de categoría. La proyección de
  lectura incorpora `bookingCategory` desde el establecimiento, sin cambiar su
  estado o identidad. Belleza/peluquería usan el amarillo `#eab308` del catálogo
  orbital existente en una barra de 3×24 puntos, en lugar de todo el lateral.
  No se deduce una categoría por el nombre del negocio ni se recolorean tareas,
  notas o reservas de categorías distintas. Si la categoría no consta se conserva
  la presentación previa de su lateral, sin inventarla.
- Las tarjetas de reserva usan marco neutro y sombra discreta, menos padding y
  títulos completos. El estado contractual sigue visible. REALIZADA/PENDIENTE
  conservan sus callbacks y selección exclusiva, con superficies atenuadas y
  áreas táctiles de al menos 44 puntos. La papelera roja de 44×44 va junto a la
  cabecera, con espacio reservado al texto. Reutiliza la confirmación existente:
  oculta la ficha personal, no cancela ni elimina la reserva compartida.

No se cambia el editor NOTA, navegación de reservas, persistencia, autenticación,
backend, permisos o datos. Los filtros, menús y barra inferior conservan sus
acciones/estilos; solo desaparece de ellos el cierre obsoleto solicitado.

## Comprobaciones

Suite afectada conjunta: **201/201**. TypeScript, diff check y exportación iOS
SDK 58 correctos (2550 módulos).

- Render real de Listados y manejadores: tarjetas Belleza frente a deporte/tarea,
  categoría de la proyección real, estados done/pending, confirmación destructiva,
  datos e identidad, filtros USER/ADMIN y regreso de Notas/ficha de reserva.
- Geometría opt-in: 320×568, 375×667, 390×844, 430×932 y 844×390, ambas manos.
  Scroll flexible, margen superior, minimización y región flotante independiente.
  Gesto rápido sobre contenido desplazado no cierra el listado; se conserva el
  gesto a dos niveles cuando el contenido está arriba y sin teclado.
- Componente real `DraggableFAB`: 500 ms, movimiento sin salto, persistencia,
  límites y recuperación tras cambio de altura/teclado; soltar no invoca cierre.
- Regresiones de propuestas, acciones, Notas, Calendario y reservas; TypeScript,
  diff check y exportación iOS SDK 58. Mapa de exportación contrastado con las
  fuentes exactas de index, acciones compartidas y proyección de reservas.
- Una comprobación adicional antigua de `action-completion.test.mjs` falla por
  el hash de `PremiumOrbitBtn` desactualizado en su fixture. El hash actual y el
  de MAIN son idénticos (`475fdb7563cfec45b5009161842f84fbb3b71e546878025f14ebadd300acd873`),
  frente al fixture antiguo `425add841653eba981c674f4774f2192e8d277bc3c7ec201a4c8af2cabfa2444`.
  No se modifica el orbital ni se actualiza un baseline ajeno para ocultarlo.

Estas comprobaciones automatizadas de estilos, estado y gestos no equivalen a
render ni interacción física de UIKit. Pendiente del propietario en iPhone:
apertura a altura máxima, lectura con texto aumentado, aspecto de tarjetas,
pulsación/arrastre del cierre, scroll, minimización y retorno desde Notas.
