# Navegación V1: sustitución visual

Base remota revisada: `7301a88ef987959cccd4fd11bc85272101d644e7`.
Se conserva la reversión de Listados publicada en esa base y el trabajo local ajeno.

## Equivalencias

- La flecha simple pasa a ATRÁS: cuadrado naranja de 64 puntos, icono curvado
  blanco y texto blanco debajo.
- La doble flecha pasa a SALIR: mismo tamaño, rojo, X blanca y texto blanco.
- Brillo, degradado y sombra son moderados. La geometría compartida elimina
  las direcciones y padding heredados que podrían descentrar icono/etiqueta.
- Los textos accesibles contextuales y los callbacks originales se conservan.
  SALIR no recibe un destino nuevo por la leyenda de la imagen de referencia.

`GoCloseButton` centraliza el diseño. Se han sustituido también los dibujos
directos de navegación en acceso, perfil, administración/empresa, herramientas,
plano, proveedor, reservas, mensajes, contactos, tableros, seguimiento, archivo
de compras, Humanity y capas de Landing. Calendario, fichas, Listados, Notas y
AYUDA heredan el mismo componente. No se convierten flechas de filtros,
ordenación, desplegables ni indicaciones gestuales; las órbitas y GO central
conservan sus formas, colores y acciones.

## Posición y arrastre

Los grupos flotantes usan el `DraggableFAB` existente (pulsación larga de
500 ms), con anchura/altura reales del grupo de 64 puntos o 136 para dos botones.
`GoNavigationFloating` aporta una superficie táctil completa y mide el espacio
local. No existe otro reconocedor de arrastre.

La lateralidad procede del estado GO existente, sin nueva preferencia. Las
posiciones se guardan por pantalla, grupo y mano; se respeta la posición anterior
diestra cuando existe. Una lectura tardía no puede recuperar la posición de la
otra mano. El teclado/tamaño disponible limita la posición visible sin borrar
la preferencia recuperable. Los controles integrados en formularios mantienen
sus emplazamientos y las zonas de navegación flotante respetan sus controles.

La liberación posterior al arrastre no ejecuta navegación; una nueva pulsación
normal sí. No se introducen esperas para navegar. En NOTA el hueco del pie
mantiene GUARDAR y GO en su distribución; los botones reales pueden moverse
en la capa flotante, por encima del teclado y con los mismos callbacks de
retroceso jerárquico, descarte y salida confirmada. Los dos controles existentes
de una nota guardada quedan juntos.

## Validación y límites

- Inventario de 62 callbacks originales y el retroceso del asistente que antes
  usaba `IconButton`: comparación estructural exacta, sin callbacks nuevos ni
  duplicaciones. Pruebas de acciones, teclado, borradores y permisos sintéticos.
- Pruebas del componente y del reconocedor reales: pulsación normal,
  pulsación larga, límites, liberación sin navegación, persistencia/remontaje,
  derecha/izquierda, teclado y tamaños representativos de iPhone/orientación.
- Comprobaciones de Listados y reservas mantienen sus gestos y datos.
- Batería ampliada: 903 casos. La primera ejecución final dio 862 correctos;
  las tres expectativas visuales del diseño anterior se actualizaron y se
  repitieron de forma dirigida, 3/3 correctas. Resultado acumulado: 865 casos
  correctos y los 38 previos indicados abajo, sin nuevos fallos de este cambio.
  Los fallos heredados se contrastan leyendo las
  fuentes de la base indicada, sin cambiar infraestructura ni lógica para
  conseguir un resultado verde. Se han reproducido 38 fallos previos:
  adaptadores sin dependencias/contexto de rutas actualizado, fixtures de
  catálogo/publicación y snapshots anteriores; faltan además `esbuild`/`zod`
  en las raíces usadas por tres pruebas no móviles. Los registros se conservan
  temporalmente en `go-navigation-baseline*.log`. No se declara toda esa batería
  libre de errores ni se consideran corregidos esos problemas por esta tarea.
- Las nuevas expectativas visuales se prueban aparte y no sustituyen las
  comprobaciones funcionales. TypeScript, diff y exportación iOS SDK 58 son
  requisitos independientes antes de publicar.
- No hay prueba física de iPhone. El propietario debe comprobar brillo/tamaño,
  posición, ambas manos, teclado, arrastre y la misma acción de ATRÁS/SALIR en
  cada módulo; especialmente NOTA, Listados y Reserva.

No se modifican datos, permisos, backend, Railway, Supabase, API ni servicios.
La sincronización de Metro se verifica cotejando fuentes del bundle, no mediante
la etiqueta SHA del manifiesto de arranque.
