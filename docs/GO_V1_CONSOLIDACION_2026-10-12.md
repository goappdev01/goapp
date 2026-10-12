# GO V1 — consolidación local, fase A — 12/10/2026

## Estado

Candidato: integration/go-v1-consolidacion-2026-10-12. Parte del HEAD 7786872 de integration/go-v1-calendario-ia-landing y del estado completo guardado en su worktree. El checkpoint 97d1a17 incorpora los cambios posteriores sin commit. La integración añade los tres commits pendientes de IA/voz hasta 41cd3b9.

Main local permanece en 9249d1b0a1e10f26f002620be6be9ab75a31f76d; la referencia remota comprobada es e0796a5b523944131539e51208d1c9ba7c8fd45a, ya antecesora del candidato. No se publica ni se fusiona durante esta fase.

## Trabajo conservado en la base común

| Origen | Incorporación |
| --- | --- |
| Agente 1 | Landing y órbitas conservadas, autenticación, ADMIN por membresías UUID, propietario/técnico, contextos independientes, ayudas por contexto, autorización empresarial del servidor, adaptación DEMO, idiomas, ubicación y teléfonos. |
| Agente 2 | IA de reservas, creación/gestión de tareas y vínculo con agenda, ergonomía de teclado/scroll/cierre, ubicación y preferencias compartidas, escucha explícita consumida una vez, indicador dorado pasivo, contratos aislados de transcripción nativa. |
| Agente 3 | Calendarios, slots, contenedores y cierres, múltiples empresas DEMO, persistencia por propietario/empresa, archivo/recuperación/exportación/importación, búsqueda y reserva completa, calendarios cliente/profesional, cancelación y liberación, protección de duplicados y fechas locales ante DST. |
| Ramas anteriores | SDK 57, backend/autenticación, confirmación de correo y reservas ya contenidas en la integración. Los parches ADMIN 6c58139, 9c6eda3 y 7786872 son equivalentes por patch-id. |
| Experimentos anteriores | Las 18 fuentes pendientes del worktree SDK 57 previo y los diffs b8254e5/4eb295f están conservados en development/archive/expo57-before-integration, con hashes y documentación. Permanecen inactivos. |
| Entorno privado | Fuentes y 36 pruebas de la pasarela incluidas en tools/go-private-gateway. Sus servicios, lista de rutas y restricciones no se modifican. |

El origen de integración tenía 54 rutas pendientes. Se restauraron desde las copias verificadas; 53 contenían cambios para commit. expo-env.d.ts tenía contenido idéntico. Solo se normalizaron dos líneas vacías finales del candidato para superar diff --check. Los originales no se editaron.

No se sustituyen el Landing reciente, las guardas de identidad ni las reservas UTC por los archivos del experimento antiguo. Los desarrollos experimentales permanecen como fuentes recuperables en este mismo árbol, no exclusivamente en otras ramas.

## Conflicto resuelto

BookingAssistantScreen.tsx tenía un conflicto entre la ergonomía actual y el indicador de un estado anterior. Se incorporó el indicador sobre el código actual: se mantienen el dock compartido, teclado, escucha única tras onShow, scroll manual y cierres existentes. El indicador mide el contenido real dentro del ScrollView flexible, no su altura expandida. No intercepta pulsaciones.

Se adaptaron los simuladores de assistant-location y listening-indicator; ninguna aserción anterior se eliminó. Se añadieron tres regresiones de escucha única, medición y scroll. El simulador backend integration-routing dejó de autorizar por profiles.role y utiliza la membresía vigente, conservando la prueba de rechazo de metadatos falsificados.

Se conserva el registro de previsualizaciones generado por mockupPreviewPlugin para que la comprobación de tipos de ese paquete auxiliar no dependa de una carpeta generada ausente. No añade pantallas GO ni negocios ficticios.

## Verificación ejecutada en el candidato

| Comprobación | Resultado |
| --- | --- |
| Suite móvil anterior restaurada | 389/389 |
| Suite móvil consolidada | 418/418, sin skips |
| Suite backend | 16/16 |
| Pasarela privada | 36/36 |
| TypeScript | Bibliotecas, móvil, backend, mockup-sandbox y scripts correctos; ejecución secuencial |
| Backend build | Correcto |
| Arranque del compilado | Loopback efímero; health 200; auth/me, ADMIN y gestión sin sesión 401; cero peticiones externas |
| Build auxiliar | Correcto, mediante su generador existente |
| Expo iOS SDK 57 | Bundle Hermes generado; contiene conexiones nuevas de contexto, DEMO multiempresa y voz |
| Dependencias | 145 paquetes contrastados con pnpm-lock.yaml: ninguno ausente ni discrepante |
| Secretos | Revisión del historial preparado y archivos nuevos, sin valores sensibles detectados |
| Integridad | Contenido, HEAD y estados de los nueve worktrees originales coinciden con el respaldo |

La primera suite móvil falló en nueve simuladores por un import nuevo no simulado; tras corregirlos pasa completa. TypeScript inicialmente encontró paquetes auxiliares sin enlaces de dependencias y su registro generado ausente; se reutilizaron exclusivamente paquetes instalados y el generador existente. No se instalaron ni actualizaron paquetes.

expo install --check devuelve recomendaciones de versiones posteriores (Expo, Constants, Linking, Notifications, Router y TypeScript). Las versiones usadas coinciden con el lockfile y el bundle funciona; esta consolidación conserva las dependencias probadas. Actualizar las recomendaciones queda para una tarea separada autorizada.

Las pruebas de Supabase/backend utilizan respuestas simuladas. No se ejecutan migraciones ni se valida de nuevo la base real. Las comprobaciones SQL anteriores no se contabilizan como pruebas ejecutadas en esta fase.

## Límites y pendientes

- Transcripción nativa 15B: contratos y coordinación probados; no hay adaptador nativo activo ni autorización nueva de proveedores/costes.
- Variantes visuales y prototipo antiguo de renovación de sesión: fuentes completas inactivas; activarlos requerirá compatibilizarlos con las guardas actuales. No se pierden ni se presentan como funciones activas.
- Los módulos internos aún prototipo conservan su implementación; conservarlos no implica que todas sus operaciones remotas estén terminadas.
- DEMO sincroniza localmente en el mismo dispositivo y UUID; exportar/importar es explícito. No hay sincronización automática entre dispositivos ni publicaciones al backend.
- El recorrido búsqueda → reserva confirmada fue aceptado físicamente en la integración anterior. Falta validar físicamente el candidato, especialmente calendario profesional, reapertura/persistencia y cancelación.
- Metro 8086 continúa sirviendo el worktree original. No se ha sustituido su proceso ni el backend 3000 o la pasarela 3001. Reload allí no prueba los cambios nuevos de voz del candidato.

## Validación física propuesta

1. Programar un cambio controlado del único Metro 8086 al worktree candidato, conservando cuenta, proyecto, configuración local privada y puertos de la pasarela. No usar otro backend ni publicar datos.
2. Abrir GO con la cuenta del propietario; comprobar selector privado ADMIN / EMPRESA DEMO / USUARIO y la etiqueta roja en pantallas profundas y retorno de segundo plano. Una cuenta normal conserva Empresa | Usuario y no obtiene ADMIN.
3. ADMIN: comprobar órbitas y módulos originales. EMPRESA DEMO: comprobar empresas existentes, sus cuatro puestos y configuración independiente, sin reinicializar documentos.
4. USUARIO DEMO: buscar la empresa configurada, seleccionar servicio/profesional/horario y confirmar una sola vez. Comprobar una reserva en cliente y en el profesional correcto; otra empresa/profesional no debe recibirla.
5. Reabrir GO y comprobar persistencia; cancelar esa reserva de prueba y comprobar que el horario queda libre. No repetir altas ya aceptadas.
6. IA: tocar GO una vez; comprobar una captura y el indicador dorado, scroll/teclado/cierres intactos. No probar un proveedor nativo que sigue inactivo ni consumir API para esta consolidación.

## Recuperación y fases siguientes

Se conserva el bundle de todas las referencias originales, los parches staged/unstaged, índices y 2.777 archivos pendientes con SHA-256. Las credenciales, .env privados y dependencias ignoradas permanecen intactos en sus ubicaciones originales y no entran en commits.

La referencia local refs/backup/go-v1/pre-consolidation-main-20261012 conserva main antes de esta operación. Se genera un segundo bundle con el candidato final y se verifica su recuperación en un repositorio independiente. No se elimina ninguna rama o worktree.

La descripción de un único PR está preparada localmente. Push y apertura del PR requieren autorización expresa. Tras revisar el PR, merge a main necesita otra autorización específica. La etiqueta de recuperación propuesta es go-v1-consolidada-2026-10-12 y se creará solo sobre el commit de main finalmente autorizado. No se crea ni publica ahora.
