# EQUIPO: eliminar un trabajador sin confundirlo con Inactivo

Base revisada: fbb3f3795d883cf7183bca6400103425296ff342 (MAIN, 236 commits).

## Procedimiento

Editar persona muestra una papelera roja junto al título, con superficie táctil de 44 × 44 puntos y disposición adaptada a la mano dominante. No cambia las órbitas, el núcleo GO, el buscador ni la paginación existente.

La papelera pregunta «¿Desea eliminar permanentemente este trabajador?», identifica el nombre y código y ofrece Cancelar o Sí, eliminar. Cancelar conserva el registro y el borrador. Confirmar elimina sin exigir GUARDAR y cierra el editor únicamente después de persistir el resultado. El estado Inactivo conserva al trabajador en plantilla; nunca ejecuta esta eliminación.

## Alcance y seguridad

La pantalla actualmente conectada utiliza la demostración local explícita. Su papelera elimina solo el registro elegido de ese directorio y cuenta; la eliminación persiste al reabrir. Los demás trabajadores se conservan. Un directorio vacío permanece vacío y los identificadores eliminados no se reutilizan.

El contrato reutilizable de fuente real incorpora una capacidad específica de eliminación y exige confirmación del servidor para el mismo identificador. Los permisos de edición o de inactividad no conceden esta capacidad. Sin conexión y autorización de borrado, la papelera queda deshabilitada y se informa de su indisponibilidad. No se implementa ni se activa un endpoint productivo por esta intervención; tampoco se elimina ninguna cuenta de usuario, pertenencia de otro equipo, historial ni dato productivo.

Las confirmaciones son de un solo uso; se impiden dobles pulsaciones, respuestas tardías de otra sesión y cambios de cuenta. Si falla el almacenamiento o no se confirma el servidor, se conserva el editor y no se comunica éxito ni se reintenta automáticamente.

## Verificación

- 47/47 pruebas específicas de EQUIPO, ejecutando los manejadores reales del componente con primitivas nativas simuladas.
- 188/188 pruebas del conjunto de regresión: EQUIPO, AYUDA, navegación flotante, QR, geometría del Landing, acciones y referencias visuales.
- TypeScript sin errores, salida 0.
- git diff --check sin errores.
- Exportación iOS Expo SDK 58 completada: .cache/ios-team-deletion-20261108.
- No se modifican dependencias ni lockfile.

Se comprueban confirmación/cancelación, persistencia, inactividad independiente, eliminación del último registro, páginas, ambos modos de mano, permisos, errores de almacenamiento/servidor, duplicados, cambio de cuenta y ausencia de papelera de borrado permanente en un alta sin guardar.

La publicación de este parche requiere una autorización específica nueva antes del commit y push. La autorización anterior correspondía exclusivamente a la corrección de paginación ya publicada. No incluye escribir ni mover tarjetas de Trello.

## Comprobación física pendiente

En Expo Go: abrir EQUIPO de demostración, editar una persona, comprobar la papelera y cancelar; después confirmar y verificar su ausencia al reabrir. Cambiar otra persona a Inactivo y comprobar que se conserva. Revisar la cabecera compacta con ambas manos y teclado. Las pruebas automatizadas y la exportación no acreditan una prueba táctil en iPhone. La eliminación productiva de trabajadores requiere conectar una fuente autenticada con autorización y persistencia reales.
