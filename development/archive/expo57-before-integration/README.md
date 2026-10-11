# Desarrollo anterior conservado

Estas fuentes son la copia exacta del trabajo pendiente del worktree SDK 57 anterior a la integración. Se conservan dentro de la base común y están inactivas.

- Las variantes Profesional y Máxima confianza, sus superficies, selector y preferencia local permanecen completas en esta carpeta; el parche histórico conserva también la condición GO amarillo exclusiva de Máxima confianza.
- El borrador de renovación de sesión, mobileSession y sessionManager permanece completo. Su activación requiere adaptar conjuntamente todas las rutas y las guardas de identidad actuales.
- La autorización ADMIN, los contextos actuales, el Landing validado, la normalización UTC de reservas y el aislamiento DEMO utilizan las implementaciones de artifacts; estas fuentes antiguas no las reemplazan.
- La posición antigua de Humanity y el formulario de acceso antiguo se conservan como referencia, pues los actuales incluyen correcciones posteriores.
- expo-env.d.ts y la regla generada de .gitignore ya están representados en la aplicación activa. Los node_modules.respaldo son copias de dependencias, no módulos de producto; permanecen protegidos fuera de los commits.

manifest.json vincula cada fuente a su SHA-256 original. pending-original.patch conserva los cambios sobre ae3e3d6; landing-variants-original.patch conserva b8254e5 y 4eb295f. No hay importaciones activas desde esta carpeta.

Para recuperar un experimento, adaptar su parche sobre artifacts, comprobar la autorización del contexto y ejecutar las pruebas. No sustituir el archivo app/index.tsx completo.
