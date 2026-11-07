# GO AYUDA: activación pendiente

`go_support_v1.sql` es un borrador ejecutable, probado en PostgreSQL aislado mediante
`tests/support-db.test.mjs`. Su presencia en MAIN no aplica cambios a producción.

El API `/api/supabase/support` reutiliza el JWT del usuario y las funciones de
Supabase. La aplicación conserva `GO_SUPPORT_LIVE_ENABLED = false` hasta que
esquema, API desplegada, permisos, almacenamiento y pruebas reales estén verificados.
Por tanto, la interfaz no anuncia una recepción que aún no existe.

## Revisión antes de activar

1. Confirmar una copia de seguridad recuperable y revisar el esquema productivo.
   El borrador presupone `auth.users`, `public.profiles`, `public.businesses`,
   `public.admin_memberships` y Storage. No modifica sus registros existentes.
2. Revisar y autorizar específicamente el SQL completo. Crea cinco tablas públicas,
   una tabla privada, funciones `SECURITY DEFINER` con `search_path` vacío, políticas
   RLS y el bucket privado `go-support-private`. La función
   `go_support_purge_expired` contiene `DELETE` de solicitudes, mensajes, eventos,
   adjuntos y claves de idempotencia **solo tras el plazo de 12 meses desde archivo**.
   No se debe aplicar este borrador sin autorización concreta de producción.
3. Aplicar primero en un entorno de pruebas equivalente. Comprobar lectura y
   escritura con identidades reales de prueba de USUARIO y ADMIN, aislamiento entre
   empresas, archivos privados, reintentos, concurrencia y restauración.
4. Desplegar el API y verificar `/api/supabase/support/requests`: sin sesión debe
   devolver 401, nunca 404. Activar el cliente únicamente tras comprobar el ciclo
   envío → bandeja ADMIN → respuesta → MIS SOLICITUDES con persistencia real.
5. El borrador ofrece una operación de purga segura y reintentable que borra primero
   objetos privados y después filas vencidas. Aún falta un ejecutor periódico con
   identidad de servicio restringida, gestión de secretos, observabilidad y control
   de errores. La limpieza disparada al abrir Archivo no garantiza el plazo. No
   anunciar borrado automático hasta instalar y probar ese ejecutor.

La reversión antes de recibir solicitudes consiste en retirar el API y las
estructuras nuevas tras comprobar que siguen vacías. Una vez haya datos reales,
la reversión debe preservar expedientes y archivos; no ejecutar `DROP` ni borrar
el bucket como respuesta a un fallo de despliegue.
