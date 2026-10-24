# Recuperación integral GO Peluquerías V1 — revisión local

24/10/2026. Repositorio oficial: `goappdev01/goapp`.

**Versión consolidada preparada para revisión local. No publicada, no activada en Expo y sin cierre comercial.** Los requisitos con dependencias externas o sin una instrucción identificable siguen abiertos. No se atribuye a esta rama la validación física de otra versión.

## Rama y puntos de recuperación

- Rama única: `codex/go-peluquerias-v1-recovery-127-20261023`.
- Checkout: `work/go-peluquerias-v1-recovery-127-20261023`, dentro del espacio de GO existente.
- Base publicada y MAIN local/remoto: `aa5c137968bad97eae35cc49bf52b1f85517afe4`.
- Commit de contraseña conservado: `a44bd644f1d50009f681aaaecebbbaf81b78d37d`.
- Commit de recuperación conjunta: `2a57f705ca0c6311e898be1777bb30bd17856a83`.
- Commit de proyección DEMO y validaciones de interfaz: `4d453a8afb5fd76c51a3cbf3cde7375b796da84e`.
- Referencia de respaldo: `refs/backup/go-peluquerias-before-recovery-127-20261023`.
- Respaldos, parches previos, informes de agentes y TAP íntegros: `go-recovery/go-peluquerias-recovery-127-20261023`, fuera del repositorio. `resume-20261024` conserva el diff y los archivos nuevos encontrados al reanudar. El bundle final se verifica y registra junto a ellos.

No se creó otra rama de recuperación, no se descartaron archivos y no se rehicieron los paquetes conservados.

## Qué estaba guardado al reanudar

Se recuperaron el commit de contraseña y las modificaciones aún sin commit de variantes ADMIN/satélites, Notas, modelo de vencidas, conexiones a agenda y política de publicación del piloto. Se conservaron sus pruebas y los resultados anteriores de TypeScript. El pase amplio anterior se había detenido con fixtures que no resolvían las nuevas dependencias; no estaba superado.

También estaban preparadas la guardia de `useGoLog` frente a callbacks retenidos durante la hidratación/cambio de contexto y la conciliación de la cola nativa. Se conservaron esas reparaciones y las fuentes canónicas publicadas de reservas.

## Recuperación y conciliación realizadas

1. **Contraseñas:** componente compartido de ojo persistente, texto controlado intacto y detección fiable de CapsLock web. Autenticación, permisos, SecureStore y servidor no se sustituyen. iOS/Android no muestran un estado de CapsLock inventado. No existe un campo separado de confirmación en los formularios actuales; el componente tiene prueba para ese uso condicional.
2. **Variantes y satélites:** herramientas A/B/C/D limitadas al ADMIN autorizado; USUARIO conserva su preferencia asignada. Se recuperan los nombres funcionales de satélites. Los estilos, zonas táctiles y callbacks permanecen protegidos por las regresiones.
3. **Notas:** edición con teclado, dictado reutilizado, once anticipaciones, persistencia y aviso único al adjuntar la nota a un GO. Modificar/cancelar reutiliza la cola existente y conserva avisos independientes. Se conciliaron Notas, vencidas y recordatorios en una sola cola nativa.
4. **Vencidas:** modelo completo de decisiones personales REALIZADO/PENDIENTE, siete decisiones rápidas, reintento individual y PROPONER CAMBIO mediante el flujo actual. No se convierte una reserva en pendiente solo por haber pasado su hora ni se cambia su estado global de aceptación/pago al decidir personalmente.
5. **Reservas y calendarios:** conservados servicios múltiples, Guardar, duración/importes, fases exactas, recursos, recibo, idempotencia, cambios propuestos y una proyección canónica por reserva. No se recuperó el puente antiguo que habría reemplazado esa fuente.
6. **Visibilidad progresiva:** política compartida de entorno y audiencia; el primer piloto muestra solo Peluquería. ADMIN verificado con `development` conserva pruebas internas, sin permisos nuevos sobre datos empresariales privados. Categorías, búsqueda, recientes, entradas por ID y nuevas operaciones HTTP aplican el mismo registro. Se conserva la gestión histórica de reservas ocultas. Las demás funciones generales de GO permanecen.
7. **Categoría ficticia:** alias exacto `Belleza Peluquería` → `peluqueria`, sin transformar registros almacenados ni deducir actividades por el nombre del establecimiento.

### Correcciones nuevas estrictamente necesarias

La combinación exige conservar contexto durante las esperas asíncronas. Se utiliza la guardia opcional de la cola compartida para evitar escrituras con callbacks de un contexto anterior, sin adoptar registros históricos sin propietario.

En esta continuación se reprodujo una segunda carrera en **guardar y editar Notas**: con el mismo usuario, cambiar de empresa durante la última lectura de identidad permitía iniciar una escritura tardía. Dos regresiones con el store real fallaron antes del arreglo. Ambos métodos revalidan ahora el contexto inmediatamente antes de admitir el commit. Las pruebas comprueban cero escrituras tras A→B, integridad de las notas de B y recuperación de la misma cola. Esto no revoca una escritura al sistema operativo que ya se hubiera iniciado.

Los fixtures se adaptaron para cargar la política, los helpers y el componente de contraseña reales. No se eliminaron aserciones de autenticación, permisos, disponibilidad, callbacks, persistencia ni cancelación. Las comparaciones estructurales antiguas se ajustaron únicamente a los cambios autorizados: resolución personal explícita, nuevos imports y filtro de publicación. El hash previo del renderer se sigue comprobando tras retirar solo la proyección autorizada del catálogo.

La comprobación adicional del recorrido cliente encontró un fallo real en DEMO: `entryFor` omitía `slotKey`, aunque la reserva lo tenía guardado. Calendario no abría su ficha completa con Proponer cambio y Cancelar. La proyección compartida usa ahora la clave vigente del mismo booking; los registros históricos sin campo la derivan de sus propios identificadores e intervalo. No escribe ni migra datos para obtenerla. Las pruebas reales de interfaz verifican cliente canónico y DEMO, confirmación explícita, horario vigente hasta el acuerdo, aceptación/reapertura y ausencia de escrituras o contaminación entre empresas al leer una reserva histórica.

## Funciones conservadas y límites de la comparación

- Tierra conserva el blob `54c71fbb07b0d19f5ad98137e727013815891d75`; no se reconstruye.
- Sin diferencias en los assets, los archivos de geometría/paneles/anclaje del Landing, el layout raíz ni las rutas aprobadas.
- Sin cambios en Humanity ni su regla de visibilidad.
- Sin cambios al lockfile, versiones o contrato de autenticación. Instalación normal `pnpm install --frozen-lockfile --offline`, reutilizando el almacén del equipo, sin enlaces prestados de otro worktree.
- SQL, motores y rutas de timeline/catálogo/negociación conservan el código publicado. Sus evidencias PostgreSQL anteriores se reutilizan para ese código sin cambios; no se presentan como otra ejecución de SQL.
- GO Imprimir, su rama y sus puertos no se intervinieron. No se afirma que sus servicios estén operativos por esta comprobación.

## Validación real de esta recuperación

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| Móvil, 83 archivos | 1.471 casos distintos correctos | El pase completo de 1.467 registró 1.465 correctos y dos fallos de fixture; ambos recorridos DEMO pasaron después. Se añaden cuatro casos nuevos y se verifican las 134 regresiones afectadas por la proyección compartida. No se presenta como un único pase de 1.471 |
| Backend HTTP/unitario | 36/36 | Datos ficticios, rutas de publicación, permisos y regresiones de autenticación/gestión |
| Pasarela | 94/94 | Contrato, CORS, login, refresh, circuito de sesión y nuevos metadatos; sin sustituir el servicio activo |
| Notas, incluido store real | 40/40 | También los dos casos de cambio de empresa antes del commit; incluidos en la cobertura móvil, no sumados otra vez |
| TypeScript | Librerías, móvil y backend correctos | Comprobación final tras la guardia de Notas; salidas 0 |
| `git diff --check` | Correcto | Sin conflictos o errores de whitespace pendientes |
| Revisión de publicación | Sin archivos privados ni patrones de claves detectados | Solo el delta de la rama; no equivale a auditoría de producción |
| Dispositivo físico | Pendiente | No se activó esta recuperación en Expo Go |

Total de resultados distintos de móvil, backend y pasarela: **1.601**, sin sumar rechecks, las 134 regresiones afectadas ni las pruebas de Notas otra vez. [VALIDACION.json](VALIDACION.json) registra los resultados exactos y SHA-256 de los logs externos, incluidos los fallos ya corregidos.

No se han repetido las baterías PostgreSQL ni se ha creado otra base o instancia. Las pruebas de transporte usan servidores efímeros de loopback y cuentas ficticias; no son servicios que el propietario deba gestionar.

## Estado de los 127 requisitos

[MATRIZ-127.md](MATRIZ-127.md) y [MATRIZ-127.json](MATRIZ-127.json) conservan por ID el estado original en MAIN, la recuperación local, archivos, pruebas, regresiones y límites. Incluyen tres requisitos adicionales documentados, sin alterar el denominador original.

| Estado local | Requisitos |
| --- | ---: |
| Automatizados recuperados/implementados | 43 |
| Automatizados conservados | 55 |
| Conservados en código, sin elevar su evidencia a prueba funcional | 5 |
| Pendientes de comprobación física | 14 |
| Parciales por dependencia | 6 |
| Dependencia externa de dictado | 1 |
| Sin evidencia suficiente o campo condicional inexistente | 3 |
| **Total** | **127** |

Los 98 requisitos con comprobaciones automáticas no equivalen a 98 recorridos físicos cerrados. Una tarjeta con dependencias o pruebas físicas pendientes no se califica como completa. Las tarjetas 2, 7 y 13 no tienen un conjunto de requisitos original identificable y se registran aparte, sin inventarlos.

### Situación de las tarjetas

| N.º | Trabajo | Estado de esta rama |
| --- | --- | --- |
| 1 | Contraseña y CapsLock | Recuperado; comprobación real de dispositivo pendiente; campo separado de confirmación inexistente |
| 2 | Cinco comprobaciones de backend | Instrucción exacta no recuperada; no se sustituye por cinco controles inventados |
| 3 | Limpieza de Nueva reserva | Conservada; revisión visual pendiente |
| 4 | Vencidas, fluidez y textos | Modelo completo recuperado y probado; validación física pendiente |
| 5 | Horarios adaptativos, agendas y reservas | Motor conservado; parciales cuenta profesional independiente, datos antiguos y activación real |
| 6 | Asociaciones de catálogo | Conservadas; ventas/stock pendientes; recorrido físico pendiente |
| 7 | Orden de citas vencidas | Regla exacta no recuperada; no se atribuye automáticamente el orden del modelo recuperado |
| 8 | Servicios múltiples, ubicación y dos subapartados | Funciones conocidas conservadas y probadas; geolocalización física y dos instrucciones exactas pendientes |
| 9 | Variantes ADMIN y satélites | Recuperado y probado; revisión de dispositivo pendiente |
| 10 | Notas | Recuperado y probado; dictado nativo bloqueado por conexión privada; teclado/avisos físicos pendientes |
| 11 | Publicación progresiva | Cliente y backend HTTP preparados; límites directos de base, activación y dispositivo pendientes |
| 12 | Tres mejoras de reservas | Conservadas y con regresiones correctas; recorrido físico pendiente |
| 13 | Funcional adicional | Sin identificación inequívoca; no sustituida por cierre |
| Cierre | Consolidación, publicación y copia de GitHub | Recuperación local consolidada; merge/push prohibidos en esta fase; no se declara cierre |

## Dependencias y bloqueos que permanecen

1. **Dictado nativo de Notas:** reutiliza `GET /api/booking-assistant/capabilities` y `POST /api/booking-assistant/transcribe`. La allowlist actual de 3001 no permite esas rutas: devolvería 404/405. No se ha abierto una ruta de transcripción ni cambiado esa restricción. El backend ya tiene el contrato autenticado y su límite; su conexión/activación requiere una decisión autorizada. Web utiliza reconocimiento del navegador; tampoco se declara probado físicamente.
2. **Visibilidad y acceso directo a la base:** el middleware rechaza nuevas operaciones HTTP de sectores ocultos, pero un RPC/PostgREST expuesto directamente podría eludirlo. Antes del piloto comercial debe revisarse la configuración real y aplicar una política equivalente en el límite autorizado. No se modificaron RLS, grants ni SQL de producción. Véase [GO-MODULE-PUBLICATION.md](../GO-MODULE-PUBLICATION.md).
3. **Profesional independiente (5.22):** falta verificar su identidad/membresía legítima y sus políticas de lectura. Una agenda filtrada de empresa no acredita acceso independiente seguro. No se crea un vínculo de cuenta ni un privilegio artificial.
4. **Datos antiguos y circuitos (5.25):** no se migran automáticamente `ManualBlock` históricos sin identificar propiedad. DEMO/AsyncStorage y PostgreSQL aislado no son circuitos equivalentes. SQL publicado sigue siendo un borrador pendiente de activación expresamente autorizada.
5. **Ventas/stock (6.16/6.17):** se conserva el detalle de complementos y se rechazan los productos que exijan una autoridad de stock inexistente. No se inventa un sistema de ventas, facturación o stock. Esa conexión futura no queda declarada operativa.
6. **Fuentes ausentes:** no se recuperaron sin ambigüedad las cinco comprobaciones de la tarjeta 2, la regla exacta de orden de la 7, una decimotercera funcional distinta ni los dos subapartados 8.15/8.16. La captura disponible muestra doce funcionales más cierre. El modelo de vencidas no se atribuye automáticamente a una instrucción desconocida.

## Comprobación física pendiente, una vez autorizada la activación

La rama **no está activa** en 8088. Los puertos 3000/3001/8086/8087/8088 conservan sus procesos. No se ha modificado la autenticación habitual del entorno del propietario ni se han borrado sesiones/datos.

La revisión posterior debe usar esta misma versión y el entorno existente, sin crear puertos adicionales. Antes de mostrarla hay que autorizar su activación y distinguir qué backend incorpora la política preparada. Después comprobar:

1. Ojo en acceso/registro y teclado físico CapsLock; cierre/inicio normales de sesión.
2. Herramientas de variantes solo en ADMIN; apariencia asignada y nombres funcionales conservados en USUARIO/EMPRESA. Tierra, Humanity, tres controles fijos, cabeceras, anclaje GO y gestos sin regresiones.
3. Vencidas: REALIZADO, PENDIENTE y PROPONER CAMBIO, decisiones rápidas, cambio de contexto y reapertura.
4. Notas: teclado, título/detalle, once anticipaciones y edición/cancelación. Dictado solo cuando su conexión esté autorizada. Aviso único nota/GO y avisos independientes, también con el dispositivo bloqueado.
5. Reservas: uno/varios servicios, total, fases/esperas/recursos, complementos y consentimiento; confirmar, proponer/rechazar/aceptar, cancelar, reabrir y localizar una sola cita en calendarios.
6. Piloto USUARIO: solo Peluquería en categorías, búsqueda, recientes e ID; ADMIN interno conserva sectores sin obtener acceso privado adicional. Comprobarlo contra el backend que realmente sirva la política.

Las notificaciones aquí son locales. La [documentación de Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) mantiene su disponibilidad en Expo Go y distingue las limitaciones del push remoto. La entrega, permisos, sonido y comportamiento del sistema operativo siguen necesitando dispositivo físico.

**MAIN sigue intacto. Sin merge, push, despliegue, SQL aplicado, modificación de datos ni reinicio de servicios. Esta entrega permite revisar la recuperación; no declara GO Peluquerías listo para el piloto comercial ni entregado a Nelson.**
