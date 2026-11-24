# Fotos de catálogo: dependencia productiva pendiente

La interfaz y los recursos estáticos DEMO no activan subida de fotos para empresas reales. En el servidor actual, `go-business-documents` y `go-support-private` son almacenes de documentos privados con contratos y permisos distintos. No sirven como catálogo público y no se reutilizan para este fin.

Para habilitar fotografías reales se necesita autorización específica para un almacenamiento Supabase de catálogo y sus reglas. Preparar y probar primero en entorno aislado:

1. Ruta de objeto por empresa e identificador estable de servicio/producto; el cliente nunca decide el identificador de empresa a partir de texto libre.
2. Subida, sustitución y retirada mediante identidad autenticada y propiedad o autorización empresarial verificadas en servidor, con aislamiento entre empresas. Lectura pública solo de versiones publicadas; borradores privados.
3. Validación del contenido real JPEG/PNG, límite de tamaño, reescalado y eliminación de metadatos de cámara antes de guardar; referencia al objeto y versión en `services.ui_metadata` u otro campo ya autorizado, nunca el archivo binario en SQL.
4. Sustitución atómica de la referencia: conservar el objeto anterior hasta confirmar el nuevo. Retirada de objetos huérfanos solo tras reconciliar referencias y con procedimiento de recuperación.
5. Pruebas de acceso cruzado, sesión caducada, publicación y retirada, errores de red, límites de tamaño, coste y reversión. Verificar el despliegue con dos empresas de prueba antes de presentar la función como operativa.

No se han creado buckets, políticas, RLS, permisos, migraciones, endpoints ni datos productivos por esta entrega. La preferencia de visualización del cliente se guarda solo en el dispositivo; no es un permiso ni una publicación de imágenes.
