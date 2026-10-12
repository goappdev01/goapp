# Calendario / Reservas — bloque 2: navegación y cierres

Base: `076c81e`. Rama: `codex/agent-3-calendario-v1`, worktree `f418`.

## Alcance implementado

- `GoCloseButton`: componente común con ↓ para el panel actual y ⇓ para su
  contenedor, esquinas redondeadas y superficie de 44 × 44. Cada instancia
  recibe su acción: el componente no navega ni modifica datos.
- Migración limitada al cierre de configuración de `AgendaOperativa`, al detalle
  de reserva y a los flotantes de GO Reservas y su selector mensual. Conserva
  los anclajes laterales inferiores. Los flotantes de Reservas tienen 8 px de
  separación y se ocultan mientras su selector mensual está abierto.
- GO Reservas sin panel interno muestra solo ⇓ y ejecuta `onClose`, volviendo
  al contenedor que lo abrió. Desaparece el par permanente de flechas de cierre.
  Dentro del selector mensual, ↓ cierra solo el selector; ⇓ conserva la salida
  existente mediante `onGoToLanding`, o `onClose` cuando no hay esa acción.
- `GoCalendarViewSelector`: el indicador muestra DÍA, SEMANA o MES y permite
  elegir las tres vistas existentes. Se utiliza en `AgendaOperativa` y en la
  cabecera de GO Reservas cuando su pestaña Calendario está activa.
- `AgendaBoard`: conecta `onSelectDay` en la cabecera de cada fecha y repara las
  flechas de mes, incluyendo los cambios de año. Usa el callback de mes del
  padre o un mes local si no existe. La semana sigue siendo una ventana de siete
  días, con Pendientes y Eliminados; puede mostrar la fecha elegida fuera del
  intervalo actual, sin desplazarlo al elegir otra fecha dentro de él.
- La navegación externa a una fecha de Reservas ahora conserva también el día,
  además del mes. El selector mensual se cierra sin desmontar `AgendaBoard` ni
  reiniciar su selección o sus referencias de desplazamiento.

## Pendientes por el límite de app/index.tsx

- **Apartado 2: PENDIENTE.** Nueva tarea pertenece a `app/index.tsx`:
  `calQuickCreateOpen`, `handleCalQuickCreate` y `openFieldSelector`. La apertura
  actual cierra el calendario antes de abrir el formulario. Convertirlo en capa
  interna y comprobar ↓ con conservación de fecha, scroll y contexto necesita
  autorización específica para modificar ese contenedor. No se ha simulado ni
  duplicado el formulario en `AgendaBoard`.
- **Apartado 3: IMPLEMENTADO** como estándar reutilizable y migración limitada.
- **Apartado 6: PARCIAL.** Selectores operativos en Reservas y `AgendaOperativa`,
  más reparación mensual y de selección en `AgendaBoard`. El calendario
  principal se monta directamente como `AgendaBoard` desde `app/index.tsx`; su
  indicador superior y el puente de su cuadrícula global siguen pendientes.
- **Apartado 7: PARCIAL.** Migrados los cierres locales descritos. Los flotantes
  principales del calendario y los de Nueva tarea están en el contenedor
  protegido y permanecen pendientes.
- `onAddEntry` y `onSelectItem` no se han conectado en este bloque: no son
  necesarios para el selector de vistas y abrirían recorridos del contenedor
  compartido cuyo cierre aún no puede repararse aquí.

## Validación y límites

Pruebas locales de navegación mensual controlada/local, cambios de año, vistas
diaria/semanal con fechas fuera de hoy, selección de fecha, selector de vistas,
cierres de panel/contenedor y ausencia de ↓ redundante en la raíz de Reservas.
Se comprueba que cerrar el selector mensual no sale de Reservas y mantiene
fecha/vista, y se ejecutan las regresiones de reservas y gestos existentes.

- `node --test tests/calendar-navigation.test.mjs tests/customer-booking.test.mjs tests/landing-gestures.test.mjs`: 18 correctas (5 nuevas y 13 regresiones).
- `pnpm.cmd --filter @workspace/go-app-mobile typecheck`: correcto.
- `git diff --check`: correcto.

Los adaptadores nativos, reloj de animaciones, almacenamiento y datos externos
están simulados. No se ha validado Nueva tarea, scroll físico ni ergonomía en un
dispositivo real. No se modifican Landing, IA, reservas reales, backend,
disponibilidad, contratos de datos ni persistencia compartida.

El documento maestro continúa abierto. No se inicia el bloque 3.
