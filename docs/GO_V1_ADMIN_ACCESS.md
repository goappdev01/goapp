# GO V1 — acceso administrativo individual

- La selección pública contiene Empresa (izquierda) y Usuario (derecha), con las tarjetas originales.
- ADMIN no es un tipo de cuenta seleccionable. Su acceso interno solo aparece después del login normal y de una comprobación de servidor satisfactoria.
- La autoridad es `public.profiles.role = 'admin'` para el UUID autenticado. No se consulta el correo para autorizar ni se confía en `user_metadata`, AsyncStorage, la verificación de empresa o un flag del cliente.
- El backend valida el token en Supabase Auth y consulta el perfil actual en cada petición de `/api/supabase/admin/*`. No se cachea el permiso. Una revocación se aplica a la siguiente operación aunque el token no haya cambiado.
- Los grants y RLS existentes impiden a `anon`/`authenticated` insertar perfiles o actualizar `profiles.role`. La comprobación de solo lectura del 07/10/2026 confirmó ambos permisos denegados en el proyecto GO. El registro público solo admite Usuario/Empresa.
- Conceder o retirar ADMIN requiere una operación de administración de confianza sobre el perfil de una identidad concreta. No se introduce un endpoint público para ello, una contraseña compartida ni una autoaprobación. Este cambio no concede ni retira privilegios a ninguna cuenta.
- El móvil no persiste permisos ADMIN. Comparte comprobaciones concurrentes, invalida respuestas de sesiones antiguas y vuelve a comprobar al regresar a primer plano y antes de abrir el dashboard. Un error de red/servidor deniega acceso sin borrar la sesión.
- Se conservan el dashboard y sus pantallas. También se protegen el acceso directo al módulo Admin de Empresa y la opción ADMIN del panel QR. No se modifica el resto de módulos.
- Las pantallas ADMIN actuales contienen prototipos/datos mock locales; no existen operaciones administrativas remotas de lectura/escritura implementadas. Cualquier futura operación real debe añadirse bajo el router protegido, con autorización en cada petición. Un bundle móvil no debe contener datos administrativos secretos.

## Despliegue y prueba

Este cambio no despliega producción ni aplica SQL/migraciones. Mientras Railway no incorpore `/api/supabase/admin/access`, el móvil mantiene ADMIN cerrado incluso para una cuenta autorizada; un 404 nunca concede acceso.

En Expo Go puede comprobarse ahora la selección Empresa | Usuario y la ausencia de ADMIN con sesión cerrada o cuenta normal. Tras publicar expresamente el backend, comprobar con identidades reales autorizadas: login normal, apertura ADMIN, logout, rechazo de una cuenta normal y revocación individual en servidor. Usuario/Empresa y su autorización empresarial permanecen independientes.
