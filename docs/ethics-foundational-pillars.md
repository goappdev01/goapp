# Pilares fundamentales de ética

Base ética inicial, versión documental 1, pendiente de desarrollo y validación
multidisciplinar. Los seis textos iniciales corresponden a la instrucción del
propietario. La ventana se incorpora a Roadmap GO → GO Humanity → Ética,
conservando el árbol anterior y todas las pantallas de revisión 11/99.

El catálogo `artifacts/go-app-mobile/lib/ethicsPillars.ts` separa identidad estable,
número de presentación, títulos, párrafos e idiomas. Añadir un pilar no requiere
reconstruir la pantalla: esta representa el catálogo mediante fichas desplegables.
Las traducciones de presentación no sustituyen el texto original español.

Cada ficha incluye una colección documental `relations`, inicialmente vacía,
para futuras referencias validadas a principios, protocolos, criterios, indicadores,
tablas 11/99 o Núcleo 55. `kind` identifica la familia y `targetId` una referencia
real que deberá validarse antes de incorporarla. No se han asignado equivalencias,
valores ni contenidos nuevos de las tablas o del Núcleo 55.

Esta estructura no se importa en el motor de IA ni en políticas de acceso,
confirmaciones, puntuaciones o decisiones sobre personas. No envía datos,
no escribe almacenamiento, no solicita permisos y no realiza llamadas al proveedor.

Pruebas dirigidas: fidelidad y orden de los seis textos, independencia de los
desplegables en español e inglés, atributos de accesibilidad, texto sin recortes
forzados, navegación por la pila existente y preservación del árbol previo y de
la revisión 11/99. TypeScript y bundle iOS se comprueban por separado.
Revisión visual adicional mediante representación web del componente en 390 × 844
y 320 × 740, con texto al 150 % en esta última. No es una emulación de iOS ni una
comprobación táctil del iPhone. El fixture histórico de ADMIN incorpora el mock
del teclado ya utilizado por esa pantalla para poder ejecutar sus regresiones.

Pendiente de comprobación física del propietario: lectura con texto ampliado,
scroll de la sexta ficha, apertura/cierre y regreso con los controles habituales
en ambas lateralidades. Las pruebas automáticas no equivalen a esa validación.
