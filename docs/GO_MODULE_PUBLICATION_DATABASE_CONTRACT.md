# Contrato de publicación de módulos GO en base de datos — Fase 1

## Alcance

La migración `20261102090000_go_module_publication_registry.sql` introduce la fuente de verdad de publicación en la base de datos. No cambia las políticas RLS existentes, no modifica RPC de reservas y no activa módulos nuevos.

El registro está en el esquema privado `go_module_publication_private`. Las aplicaciones no leen ni escriben su tabla directamente. Solo pueden consultar estas funciones públicas de solo lectura:

- `go_module_publication_stage(module_id, parent_id)` devuelve `development`, `internal`, `pilot` o `public`.
- `go_module_publication_allows_public(module_id, parent_id)` devuelve si el módulo está disponible para el público de la audiencia actual.
- `go_module_publication_contract()` devuelve la versión, audiencia y etapas para que el backend pueda comparar su configuración durante una fase posterior.

## Etapas

| Etapa | Acceso público | Uso previsto |
| --- | --- | --- |
| `development` | No | Desarrollo; valor por defecto para claves desconocidas o configuración ausente. |
| `internal` | No | Pruebas internas; requerirá una autorización de administración persistente antes de habilitarse en RLS o RPC. |
| `pilot` | Solo con audiencia `pilot` | Piloto autorizado. |
| `public` | Sí | Disponibilidad general. |

Fase 1 no introduce una excepción para cabeceras, roles editables ni preferencias del cliente. Un futuro acceso `internal` tendrá que verificarse mediante una autoridad persistente de la base, no desde HTTP.

## Estado inicial seguro

La única actividad disponible al público es `reservas.peluqueria` bajo el padre `reservas.belleza`, con audiencia `pilot`. Todos los sectores de reserva restantes quedan en `internal`, `go.imprimir` queda en `development` y toda clave no reconocida se resuelve como `development`.

Esto preserva Peluquerías y evita publicar actividades nuevas si falta una clave, una fila o una configuración válida.

## Activación posterior

1. Crear y validar la migración en una base aislada con datos sintéticos.
2. Verificar que el contrato persistente coincide con la configuración que sirve el backend.
3. Añadir guardias RLS y de RPC en una fase independiente, primero en modo de observación o en una instancia aislada.
4. Activar un módulo solo cambiando el registro con una ruta administrativa autorizada que deje auditoría. Esa ruta no forma parte de la fase 1.

## Reversión operativa

Si una fase posterior detecta un bloqueo inesperado, conservar el registro y fijar temporalmente el contrato seguro inicial: audiencia `pilot`, Peluquerías en `pilot` y el resto cerrado. Restaurar el backend anterior solo después de verificar compatibilidad con las reservas existentes. No eliminar la tabla, las funciones ni reservas creadas como medida automática de reversión.

La migración de fase 1 no altera RLS, por lo que revertirla no es necesario para restaurar el comportamiento actual de acceso a tablas; basta con no utilizar sus funciones en guardias posteriores.
