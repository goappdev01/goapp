# Fotos de catálogo: biblioteca compartida y almacenamiento pendiente

Las imágenes de ejemplo locales se seleccionan desde la misma galería en DEMO y empresas reales. Una empresa real guarda solamente la referencia estable `demo-catalog:<id>` (o `none`) en `services.ui_metadata.photoUri` mediante las rutas de catálogo existentes con autenticación y comprobación de propiedad. El cliente resuelve únicamente identificadores incluidos en el paquete; no descarga imágenes de terceros ni interpreta una URL arbitraria. Las fotografías propias siguen limitadas a DEMO: allí son datos locales, no fotos sincronizadas entre dispositivos.

En el servidor actual, `go-business-documents` y `go-support-private` son almacenes de documentos privados con contratos y permisos distintos. No sirven como catálogo público y no se reutilizan para este fin. El endpoint de servicios acepta metadatos JSON genéricos; Nelson debe añadir validación de `photoUri` en servidor antes de considerar esta restricción garantizada frente a clientes modificados. La interfaz de GO solo transmite referencias de ejemplo válidas.

Para habilitar fotografías propias de empresas reales se necesita autorización específica para un almacenamiento Supabase de catálogo y sus reglas. Intervención concreta para Nelson, a preparar y probar primero en entorno aislado:

1. Ruta de objeto por empresa e identificador estable de servicio/producto; el cliente nunca decide el identificador de empresa a partir de texto libre.
2. Bucket de catálogo nuevo, separado de documentos privados; políticas de almacenamiento y rutas de API para subir, sustituir, consultar y retirar mediante identidad autenticada y propiedad o autorización empresarial verificadas en servidor. Lectura pública solo de versiones publicadas; borradores privados.
3. Validación del contenido real JPEG/PNG, límite de tamaño, reescalado y eliminación de metadatos de cámara antes de guardar; referencia al objeto y versión en `services.ui_metadata` u otro campo ya autorizado, nunca el archivo binario en SQL.
4. Sustitución atómica de la referencia: conservar el objeto anterior hasta confirmar el nuevo. Retirada de objetos huérfanos solo tras reconciliar referencias y con procedimiento de recuperación.
5. Validar en servidor las referencias `demo-catalog:<id>` contra un listado permitido y las referencias de objeto propias contra empresa y artículo. Nunca aceptar URL externa o `data:` en el catálogo real.
6. Pruebas de acceso cruzado, sesión caducada, publicación y retirada, errores de red, límites de tamaño, coste y reversión. Verificar el despliegue con dos empresas de prueba antes de presentar la función como operativa. Después conectar los botones Galería/Cámara existentes al contrato de subida, sin crear un segundo selector.

No se han creado buckets, políticas, RLS, permisos, migraciones, endpoints ni datos productivos por esta entrega. La preferencia de visualización del cliente se guarda solo en el dispositivo; no es un permiso ni una publicación de imágenes.
