# Prompt 3 — Integración Landing + IA + Calendario

Fecha: 2026-10-08. Validación local automatizada; sin Expo Go, push ni despliegue.

## Base independiente

- Worktree: C:\Users\Usuario\.codex\worktrees\go-v1-calendario-ia-landing\goapp-profile-logout
- Rama: integration/go-v1-calendario-ia-landing
- Origen del nuevo worktree: Calendario 767a0e21d8385ef452e099c34ca6d8cd0af9065d.
- Merge Landing/Calendario: f769368; creado después de 85 pruebas móviles, 2 pruebas ADMIN del servidor, typecheck móvil y comprobaciones de diff correctas.
- El segundo merge incorpora IA 54a2779, este informe y las adaptaciones de pruebas descritas abajo. Se confirma únicamente tras superar la validación conjunta.

## Fase 1 repetida directamente

| Agente | Rama original | HEAD comprobado | Estado inicial |
| --- | --- | --- | --- |
| Landing | batch/go-ux-2026-10-05 | 40e2d6e2c05f6318b4e7d7e1a4e4db59598c65cf | Limpio |
| IA | codex/agent-2-ia-reservas-v1 | 54a2779c5536f6bec32aef1b72089068057a20da | Limpio |
| Calendario | codex/agent-3-calendario-v1 | 767a0e21d8385ef452e099c34ca6d8cd0af9065d | Limpio |

Landing e IA aparecían inactivos en Codex. Se repitieron limpieza y lectura de referencias al terminar las pruebas; las ramas originales continuaban en esos mismos commits. Main conserva 9249d1b0a1e10f26f002620be6be9ab75a31f76d.

Trazabilidad conservada mediante merges, sin cherry-pick, squash ni reescritura:

- Landing: 45c6826, 336fa41, b65f929, 57925a1, 37a60a5 y 40e2d6e.
- IA: f6f3121, a04b4fc, f09f630, 5b199e4, 983d905, edaa30a y 54a2779.
- Calendario: 076c81e, 4b10680, 0f7c373 y 767a0e2.
- Se conserva además la base e0796a5 y su historial anterior.

## Cambios compartidos y resolución

### app/index.tsx

Git combinó los cambios sin conflicto de texto. Se revisó el resultado frente a cada rama: permanece la superficie V1 y sus permisos de Landing, el toque del GO central abre la entrada IA existente, las dos etiquetas de creación rápida siguen usando traducciones y las lecturas/escrituras de agenda usan la cola compartida aportada por IA.

Las pruebas nuevas ejecutan los callbacks reales del GO central y de ambos botones de tarea, con textos ES/EN y conservación de la fecha elegida. Las pruebas existentes cubren los límites de gestos, autenticación y persistencia. No se eligió una copia completa de ningún agente para reemplazar el archivo.

### GoReservasConfigScreen.tsx

Git combinó los cambios sin conflicto de texto. Se conservaron useGoLog, la proyección sin duplicados de reservas y las mutaciones por la cola de IA, junto con el selector de vistas, fecha seleccionada y cierres jerárquicos de Calendario. Se comparó expresamente el resultado con IA y Calendario. Las pruebas de navegación y sincronización verifican ambos conjuntos de comportamiento.

### artifacts/api-server/src/routes/index.ts

Único conflicto de contenido: ambos agentes insertaban una ruta después de healthRouter. Se conservaron las importaciones y montajes de /supabase/admin y /booking-assistant. Las rutas específicas permanecen antes del router general /supabase. Se mantuvo el endpoint /booking-assistant/plan exactamente como en 54a2779.

La prueba nueva del registro combinado ejecuta los routers reales de ADMIN e IA a través de sus prefijos finales. Verifica rechazo sin sesión, rechazo de metadata editable, autorización con perfil ADMIN y planificación local con fecha y hora. Los routers ajenos a esa prueba se simulan; ningún servicio real recibe solicitudes.

### Adaptadores de pruebas

La primera ejecución conjunta tuvo dos fallos por imports desconocidos en adaptadores antiguos, sin fallos de comportamiento de producción:

- calendar-navigation.test.mjs: se añadió el adaptador de useGoLog para comprobar los cierres del componente integrado.
- customer-booking.test.mjs: se carga el módulo real goTaskAccess en la prueba de proyección de reservas al cruzar medianoche.

Ambas suites pasaron tras la adaptación (13 pruebas). Después se repitió toda la suite móvil: 148 correctas.

## Validación final

Desde artifacts/go-app-mobile:

    node --test --test-concurrency=1 --test-reporter=spec tests/*.test.mjs

Resultado: 148 pruebas correctas, 0 fallos, 0 omitidas.

Desde artifacts/api-server:

    node --test --test-concurrency=1 --test-reporter=spec tests/*.test.mjs

Resultado: 15 pruebas correctas, 0 fallos, 0 omitidas; incluye /plan y el registro combinado de rutas.

Desde la raíz:

    pnpm.cmd --filter @workspace/go-app-mobile typecheck
    git diff --check
    git diff --cached --check

Resultado: correcto.

| Área | Evidencia |
| --- | --- |
| Landing y accesos | Superficie pública V1, login, registro, cierre de sesión, gestos y autorización empresarial/ADMIN. |
| GO central e IA | Callback real del GO central y pruebas del asistente existente. |
| Calendario y Reservas | Navegación diaria/semanal/mensual, cierres y conservación de contexto; restricciones de catálogo y confirmaciones. |
| Tareas | Creación, consulta, edición de fecha/hora, ambigüedad, borrado con confirmación y reapertura. |
| Propiedad y cuenta activa | Propietario inmutable, rechazo de tareas ajenas y comprobación de cuenta al ejecutar la cola de IA. |
| Persistencia y duplicados | Registro go_log_v1 único, escrituras serializadas, snapshots obsoletos, errores de almacenamiento y proyecciones de reservas sin perder tareas. |
| Traducciones | TAREA INTERNA/EXTERNA en español, INTERNAL/EXTERNAL TASK en inglés; ambos botones siguen abriendo el mismo formulario. |

Se comprobó que los módulos de propiedad, gestión y persistencia y el endpoint /plan son idénticos a IA 54a2779; AgendaOperativa, configuración, hook del reloj, componentes comunes y translations.ts conservan el código de Calendario. LoginRegisterPanel, permisos ADMIN y política de superficie conservan el código de Landing.

Se reutilizaron dependencias ya instaladas mediante enlaces locales ignorados. Los paquetes @workspace utilizados por las pruebas apuntan al código de este worktree. No se ejecutaron instalaciones ni migraciones.

## Pendientes heredados y límites

- El Prompt 2 sigue parcial: HORAS/MINUTOS, contraste de SALTAR HORA y conexión visual de SIN DURACIÓN continúan pendientes en app/index.tsx según su informe. Esta integración conserva lo validado; no inicia esas correcciones.
- Los cierres que requerían cambios en el contenedor compartido siguen con los pendientes documentados del Bloque 2; la integración no amplía su alcance.
- Tareas antiguas sin ownerUserId permanecen intactas y excluidas de gestión por IA. Establecer su propietario requiere una fuente fiable.
- El aislamiento probado pertenece a las operaciones de IA y a los permisos del servidor. La migración del aislamiento global de las pantallas antiguas de Landing/Calendario sigue fuera del alcance heredado; no se declara resuelta.
- La edición conversacional de tareas cubre fecha/hora. Notas y listas permanecen desactivadas conforme a IA V1.
- No se valida interfaz en dispositivo, micrófono físico, autofill iOS ni servicios remotos reales. No se abrió Expo Go ni se desplegó el endpoint.
- No se modifica main, no se sobrescriben ramas originales y no se eliminan worktrees. No se inicia el Prompt 4.

La base conjunta queda validada por las pruebas locales indicadas, con estos pendientes explícitos.
