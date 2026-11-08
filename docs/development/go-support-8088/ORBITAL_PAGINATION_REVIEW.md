# EQUIPO — continuación validada, publicación pendiente de autorización

## Estado actual — 8 de noviembre de 2026

Se ha continuado el parche existente de `codex/fabrica-agente4-20261108`, sin reiniciar el desarrollo ni perder su informe anterior. HEAD y el MAIN remoto comprobado coinciden en `66a0afc3741e985f5c724cdfe2e883c8d80527ff`. No existen commits propios nuevos ni se ha hecho push.

La instalación offline anterior ya no tiene ningún proceso PNPM activo. Los paquetes presentes resuelven correctamente al ejecutar las comprobaciones con el propietario de Windows: TypeScript 6.0.3, React 19.3.0, Expo 58.0.19 y PNPM 10.17.1. No se inició otra instalación, no se ejecutaron scripts de instalación y no se modificaron versiones, package.json ni pnpm-lock.yaml. El bloqueo anterior de resolución de módulos queda superado en este entorno; no era una corrección pendiente del paginador.

## Corrección funcional preservada y completada

- Se mantiene la paginación existente de siete miembros más SOPORTE para avanzar. El controlador de la última página comprueba `hasNext` incluso ante una invocación directa.
- GO se dibuja antes de los satélites y las cajas orbitales tienen prioridad táctil explícita. Sus coordenadas, radios y tamaños no cambian.
- Las posiciones deshabilitadas conservan una caja nativa receptora (`pointerEvents="auto"`) sin acción, para que no dejen pasar la pulsación al rectángulo de GO situado debajo. Los satélites activos conservan `box-none` y reciben sus acciones nativas.
- `PremiumOrbitBtn` conserva todos sus estilos; recibe únicamente el estado opcional `disabled=false`, que se transmite al TouchableOpacity y a accesibilidad. Solo EQUIPO le pasa el estado deshabilitado de su descriptor.
- Búsqueda, apertura de ficha, retroceso, edición, alta, desactivación y datos de demostración siguen utilizando sus mecanismos existentes. No se cambia la clave de AsyncStorage ni se reinicializan los registros anteriores.

## Pruebas ejecutadas

- **35/35 pruebas específicas de EQUIPO**, incluidas dentro de **176/176 pruebas de regresión**. Se ejecutan el callback de montaje de `app/index.tsx` y el componente `PremiumOrbitBtn`, además de los controladores de la pantalla.
- Casos de 0, 1, 7, 8, 13, 15 y 100 miembros, contrato de fuente sintético y demostración local; avance hasta el final, retroceso, apertura de ficha conservando página, búsqueda, estados deshabilitados, ambas manos y pantallas compactas.
- Persistencia local de creación/edición y aislamiento por cuenta/directorio, con almacenamiento simulado; ningún registro productivo ni permiso real se modifica.
- TypeScript móvil con `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false`: correcto.
- `git diff --check`: correcto.
- Exportación iOS Expo SDK 58: correcta, bundle `entry-8c6e4989d46dda87497d074d060eaf63.hbc`, salida local ignorada `.cache/ios-team-completion-20261108`.

La primera ejecución de la ampliación de pruebas reveló una diferencia de espacios introducida por el lector de texto simulado, no una pérdida de selección. Se normaliza ese espacio exclusivamente en la aserción del código del miembro; se conservan las verificaciones de identidad, página y contenido.

Dos pruebas generales usaban una referencia textual que ya fallaba en MAIN. Se auditaron y actualizaron únicamente las huellas `PremiumOrbitBtn`, `openAi` y `universalSwipeGesture`. Las dos últimas funciones son idénticas a MAIN y no se modifican; las demás huellas permanecen iguales. Las **21 expresiones de estilo** del botón compartido son idénticas antes y después. Se conservan las aserciones originales. El detalle reproducible está en `visual-baseline-audit.json`, fuera del repositorio.

## Alcance exacto pendiente de commit

1. `artifacts/go-app-mobile/components/landing/SupportTeamPanel.tsx`.
2. `artifacts/go-app-mobile/app/index.tsx`.
3. `artifacts/go-app-mobile/tests/support-team-orbit.test.mjs`.
4. `artifacts/go-app-mobile/tests/fixtures/landing-visual-baseline.json`.
5. Este informe.

No se modifican GO Puente Codex, Metro 8088, Tailscale, API, Railway, Supabase, credenciales ni configuraciones ajenas. Metro no sirve aún este parche, porque no está publicado. El directorio real de trabajadores continúa dependiendo de su fuente autenticada; no se presentan los registros de demostración como personal real.

## Tarjeta y autorizaciones pendientes

Se conserva la relación local con la tarjeta `6aefc336d351c290aec83202`, tablero `6abc770a895998672bb4294e`, comentario original `6aefc3457a1a416e0a49b748`, intento 1, trabajo original `facaed535448429db828f1e4c745b884`. La referencia procede de los metadatos de preparación existentes, consultados solo en lectura.

**Siguiente autorización necesaria:** crear el commit del parche exacto y publicarlo en MAIN. No se utiliza la autorización anterior del puente para hacerlo. Tras recibirla: volver a comprobar MAIN, integrar sin sobrescrituras, publicar y verificar por separado GitHub, fuentes servidas por Metro, manifiesto y API. No se solicita al usuario que ejecute comandos.

El comentario técnico de Trello y el destino COMPROBAR se dejan preparados fuera del repositorio. Publicar ese comentario y mover la tarjeta requieren otras dos autorizaciones individuales. No se han hecho escrituras de Trello ni se ha iniciado otra tarjeta.

Queda pendiente la validación física en iPhone de pulsaciones, prioridad táctil y ergonomía. Los eventos nativos simulados y la exportación no se presentan como una comprobación física.

---

# Historial de revisión anterior — conservado íntegramente

# Revisión local de avance orbital — 2026-11-08

Estado: **bloqueado para validación completa**. Parche candidato local, pendiente de autorización del propietario. Sin commits, merges, push, publicación, migraciones ni escrituras en Trello.

## Base y alcance

- HEAD y el `origin/main` almacenado apuntan a `66a0afc3741e985f5c724cdfe2e883c8d80527ff`.
- `git ls-remote origin refs/heads/main` no pudo conectar con GitHub. No se acredita que esta copia sea el último MAIN remoto.
- El árbol de trabajo estaba limpio al comenzar. Solo se modifican el panel EQUIPO, el estado desactivado del botón orbital compartido y sus pruebas; este informe acompaña el parche.
- No se han leído secretos del puente ni modificado su coordinador, servicios, API, Tailscale, backend, permisos o bases de datos.

## Hallazgo y parche candidato

La paginación de `orbitalPeople.ts` ya divide correctamente en grupos de siete. Con 13 registros devuelve siete y seis miembros, con `hasNext` verdadero únicamente en la primera página.

La geometría existente hace que las cajas rectangulares de GO y de las órbitas diagonales se solapen, aunque los círculos dibujados estén separados. GO estaba después de los satélites en el árbol. Es un posible punto de interceptación táctil identificado estáticamente; **no se ha reproducido el fallo en una interfaz real**.

El panel coloca ahora GO antes de los satélites y asigna prioridad a las cajas táctiles orbitales, con tamaños explícitos y contenedores `box-none`. No cambia coordenadas, tamaños ni radios. El controlador de avance comprueba `hasNext`, incluso si se invoca directamente estando desactivado.

`PremiumOrbitBtn` recibe un `disabled` opcional, falso por defecto, y lo transmite al `TouchableOpacity` y a su estado de accesibilidad. EQUIPO lo enlaza con el descriptor de cada órbita. Se conservan el contraste de opacidad activa/desactivada y la respuesta existente de escala al pulsar. No se cambia el estilo del botón.

Se conserva `nextLabel`, cuyo valor predeterminado es SOPORTE. No se modifica la demostración, su clave de almacenamiento ni sus registros. El directorio real sigue sin conectarse. Los datos de prueba del contrato de fuente son sintéticos; no representan autenticación ni conexión productiva.

## Comprobaciones ejecutadas

Desde la raíz:

```text
node --preserve-symlinks --preserve-symlinks-main .cache/verify-orbital-data.mjs
git diff --check
node --preserve-symlinks --preserve-symlinks-main --check artifacts/go-app-mobile/tests/support-team-orbit.test.mjs
```

Las tres comprobaciones pasaron. El script auxiliar local `.cache/verify-orbital-data.mjs` usa los módulos TypeScript reales mediante el eliminador de tipos de Node 22.14, sin instalar dependencias. Comprueba 0, 1, 7, 8, 13, 15 y 100 personas: recorrido completo de páginas, retroceso por índices, búsqueda por código, límite final y conservación de los registros existentes después de crear, editar, desactivar y serializar datos de demostración. También confirma el solapamiento geométrico. **No prueba AsyncStorage en un dispositivo ni eventos táctiles.** El auxiliar está en una carpeta ignorada por Git y no forma parte del parche de aplicación.

Desde `artifacts/go-app-mobile` se intentó:

```text
node --preserve-symlinks --preserve-symlinks-main --test tests/support-team-orbit.test.mjs tests/landing-support.test.mjs tests/floating-navigation.test.mjs
node --preserve-symlinks --preserve-symlinks-main node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node --preserve-symlinks --preserve-symlinks-main node_modules/expo/bin/cli export --platform ios --output-dir dist-ios-orbital-review
```

Bloqueados: faltan `react`, `typescript` y `expo`. No se generó una exportación iOS. La instalación local de dependencias tampoco pudo ejecutarse: pnpm encontró `EPERM` al resolver una ruta del entorno, y el registro de paquetes no era accesible. No se cambiaron permisos para resolverlo.

La regresión ampliada usa el callback real de `app/index.tsx` y `PremiumOrbitBtn`, con primitivas nativas simuladas. Incluye todos los tamaños de directorio solicitados, avance, retroceso, apertura de ficha sin perder página, estado desactivado, contraste, animación y prioridad táctil en tamaños de iPhone. Su ejecución está pendiente; tampoco sustituye la prueba física.

La huella textual del botón compartido en HEAD ya difiere de `tests/fixtures/landing-visual-baseline.json` (comparación estática del texto de la función). No se ha actualizado esa referencia ni se atribuye al parche un resultado de esas pruebas que no se haya ejecutado.

## Interfaz y servicios

- `http://127.0.0.1:8088/status` respondió HTTP 200. Esto acredita respuesta de Metro, **no** su rama ni que sirva este parche.
- El host de acceso al navegador no estaba disponible.
- El intento de seleccionar Chrome mediante Computer Use se detuvo porque no pudo determinar la URL actual con seguridad suficiente para aplicar su política. No se continuó con entradas de interfaz.
- No se verificaron pulsaciones reales, capas transparentes en ejecución, búsqueda con teclado de iPhone, conservación física de página ni navegación mediante la flecha en dispositivo.

## Validación pendiente cuando exista infraestructura

1. Visualiza EQUIPO en iPhone con 0, 1, 7, 8, 13, 15 y 100 personas de prueba, sin reinicializar la demostración existente.
2. Comprueba pulsaciones reales en el centro y bordes visibles de SOPORTE, recepción del controlador y ausencia de interceptación por GO u otras capas.
3. Prueba avance hasta el final, retroceso con la flecha, apertura y cierre de fichas, búsqueda por nombre/código, teclado y conservación de página.
4. Confirma seis miembros en la segunda página de un directorio de 13, contraste/animación activa y ausencia de avance al final.
5. Ejecuta TypeScript, regresión y exportación iOS con las dependencias instaladas. Revisa por separado la referencia textual preexistente del botón compartido.
6. Confirma la rama y procedencia del Metro compartido mediante el proceso autorizado del propietario; no se ha cambiado su ejecución.

La publicación requiere autorización posterior del parche exacto. Este informe no acredita aprobación ni validación independiente.
