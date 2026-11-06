# Navegación gris humo — 6 de noviembre de 2026

Base: f7798689745d52a0cfdf2ccf82cb96cf588a22ab.

El componente compartido conserva dimensiones de 64 puntos, manejadores,
accesibilidad y estados. Flecha izquierda, X y engranaje sin etiquetas visibles.
Fondo gris translúcido y borde discreto; contraste según superficie clara/tema.
Los iconos permanecen opacos con halo de contraste incluso al 11 %.

Herramientas → Personalización incluye regulador continuo 11–99 %, paso 1,
valor inicial 75 y tres vistas previas. El almacén local notifica inmediatamente
a todos los consumidores; serializa escrituras, evita que una lectura tardía
sobrescriba una edición y comunica errores de persistencia. La API del hook
admite contexto de pantalla para futuras excepciones, sin interfaz adicional.

Calendario reservaba siempre 188 puntos para un grupo que a menudo medía
108 o 64: la diferencia era un margen invisible a la derecha. Se calcula ahora
el ancho de los hijos realmente visibles (64/108/136/180). El host ya mide el
viewport seguro completo de Calendario: no está dentro de sus columnas.
No se cambia DraggableFAB ni sus límites globales. Prueba del reconocedor real:
ambas manos, varios tamaños, topes izquierdo/derecho/superior/inferior y
restauración de preferencias. El último control alcanza el borde seguro de
8 puntos sin recorte. No se alteran filtros, arrastres de fichas ni navegación.

Validación: pruebas dirigidas de apariencia, almacenamiento, callbacks,
lateralidad, arrastre, teclado NOTA y asistente; TypeScript, diff check y
exportación iOS SDK58. La revisión física final corresponde al propietario.
No se modifican API, backend, datos, permisos ni infraestructura.
