# NOTAS V1 — ficha única, destinos y protección pendiente

Estado: notas ordinarias implementadas para validación. NOTAS V1 no está congelado. NOTA DE SEGURIDAD permanece desactivada y no admite datos sensibles.

## Modelo y guardado

La nota es un único registro GoEntry del almacén local existente go_log_v1. El campo opcional note.version=1 conserva título, contenido, destino, configuración temporal, adjuntos, coordenadas, revisión, identificador de operación e historial de movimientos. No se crean tablas ni se modifica el backend.

GoNoteEditor reutiliza GoScreenModal/GoScreenHost, GoScreenCloseSurface, GoCloseButton, el teclado nativo compatible con SDK 58, el selector compacto de recordatorios y el micrófono existente. Abre TÍTULO y CONTENIDO inmediatamente, sin enfoque automático. Configuración opcional y GUARDAR están en la misma ficha; el botón permanece fuera del scroll, encima del teclado.

El flujo anterior dividía el borrador entre la ventana NOTA, el formulario secundario y el Calendario. La validación antigua exigía título y el guardado estaba en otra fase. La causa exacta del último fallo físico no se ha capturado en el iPhone; no se atribuye a un backend sin evidencia. El nuevo flujo guarda directamente mediante la cola compartida updateGoLog, comprueba usuario/contexto, valida únicamente lo configurado, espera la escritura y relee AsyncStorage antes de confirmar. Una frase sin título, fecha, duración o aviso es válida. El mismo ID y la misma operación permiten reintentos sin duplicados; conflictos de edición, fallos de disco, verificación o cambio de identidad conservan el borrador y muestran error.

La persistencia es local al proyecto Expo y al dispositivo: no se promete sincronización entre teléfonos ni recuperación después de desinstalar/borrar datos. Conservar nombre/slug de validación evita cambiar accidentalmente el contenedor de almacenamiento.

## Destinos y acciones

- ARCHIVO conserva información de consulta. Una nota nueva no tiene ningún destino seleccionado: el usuario debe elegir CALENDARIO, PENDIENTES o ARCHIVO antes de guardar. No equivale a REALIZADA, retirada o eliminación.
- PENDIENTES conserva una acción sin programación. Fecha/hora/duración opcionales permanecen en sus metadatos y no generan un evento ni un aviso ordinario.
- CALENDARIO exige una fecha y hora válidas, sin obligar a duración o recordatorio.

La columna NOTAS es plegable y se inserta inmediatamente a la izquierda de PENDIENTES en día, semana y mes. Los días mantienen su ancho. Abrir, consultar y editar reutiliza el mismo editor; Pendientes mueve el registro y Programar abre el editor para confirmar fecha/hora. El arrastre existente de Pendientes a un día mantiene ID y contenido: no escribe ni inventa una hora antes de confirmar. Cancelar conserva el destino anterior. El movimiento múltiple de notas sin hora no recibe una hora inventada; su programación debe confirmarse individualmente.

Las proyecciones ordinarias excluyen ARCHIVO de Landing, IA operativa, pendientes y avisos. Las acciones de PENDIENTES/CALENDARIO usan el sistema existente de confirmación explícita, su historial y permisos. No se crea otro sistema de ejecución, ni se marca REALIZADA por transcurso del tiempo o por archivar. La identidad de seguimiento utiliza la programación conservada, evitando perder la decisión al plegar o cambiar de destino.

## Adjuntos, ubicación, IA y dictado

DocumentPicker e ImagePicker reales copian los archivos al directorio persistente privado del proyecto, separado por usuario e ID de nota; el guardado verifica su existencia y tamaño. Se admiten fotografías, PDF/documentos compatibles y enlaces http(s). Abrir archivos utiliza la hoja del sistema; enlaces y ubicaciones compartidas pueden incorporarse mediante su URL. La búsqueda/ubicación actual usa expo-location y conserva texto y coordenadas. No se instalan servicios ni se inventan resultados de ubicación.

Los adjuntos ordinarios no están cifrados por esta función. Quitar una referencia no elimina archivos de notas anteriores. La limpieza de archivos huérfanos queda pendiente de una política segura; no se realiza borrado masivo. La recepción directa mediante la extensión Compartir de otras apps no está implementada en Expo Go; no hay un botón que simule esa integración.

El guardado y la clasificación manual no requieren IA ni HTTP. GO utiliza la captura de voz, interpretGoActions y el reconocimiento conservador de fechas/horas ya existentes para preparar un borrador editable. No guarda, selecciona destino ni crea eventos por sí solo. Las horas ambiguas permanecen sin completar y las ediciones manuales posteriores tienen prioridad frente a respuestas tardías. Si voz o IA no están disponibles se informa sin inventar texto; el servicio sigue deshabilitado en el entorno de validación. GO y GUARDAR permanecen junto al pulgar dominante, y la distribución de controles se invierte con la lateralidad existente sin invertir el texto. La transcripción real y el dictado nativo requieren prueba física; la selección del cursor no se fuerza desde JavaScript.

## Diseño de bóveda — sin activar

NOTA DE SEGURIDAD es una opción informativa compacta en la cabecera: al pulsarla aparece una explicación flotante temporal. No activa la protección. El servicio rechaza security=true antes de escribir datos ordinarios y su contenido no se envía a GO. No existe bóveda operativa, cifrado de notas o acceso Face ID implementado en este cambio.

Para activarla se necesita un binario nativo propio y verificar estos requisitos:

1. Repositorio independiente de la agenda ordinaria: ningún título, texto, coordenada, metadato sensible, nombre de archivo o miniatura en go_log_v1, búsquedas generales, IA, logs, analítica o notificaciones.
2. Contenido y adjuntos mediante cifrado autenticado AES-256-GCM de proveedor mantenido, claves generadas por CSPRNG, nonce único por clave/objeto/versión y etiqueta de autenticación de 128 bits. AAD vincula usuario, ID opaco y versión. Fallos de autenticación nunca se convierten en texto vacío ni recuperación parcial.
3. Clave de bóveda protegida por Keychain con política de acceso del dispositivo y autenticación adicional; nunca código fuente, AsyncStorage o preferencias. Claves por objeto envueltas por la clave de bóveda permiten rotación sin compartir una clave en todos los archivos. Los límites de SecureStore impiden utilizarlo como contenedor de documentos grandes.
4. Autenticación del sistema al desbloquear, con Face ID o alternativa segura del dispositivo conforme a la política elegida. La biometría da acceso a las claves, no sustituye AES-GCM. Cancelación, bloqueo, cambio biométrico o clave inválida mantienen la bóveda cerrada.
5. Bloqueo al salir/cambiar cuenta/pasar a segundo plano; eliminar referencias descifradas y previsualizaciones, cubrir app switcher y revisar capturas, portapapeles, temporales, cachés, exportación y notificaciones. JavaScript no garantiza borrado físico de memoria; evaluar el tratamiento nativo de las claves y documentos.
6. Recuperación explícita con secreto aleatorio de recuperación custodiado por el usuario, que envuelva la clave mediante un mecanismo revisado. Sin contraseña maestra improvisada, claves universales ni puerta trasera de soporte. Sin secreto de recuperación, la pérdida de la clave puede hacer los datos irrecuperables: explicarlo antes de activar, sin fingir recuperación.
7. Backups/sincronización únicamente con sobres cifrados extremo a extremo, integridad, control de versiones/anti-replay y gestión de claves; no asumir que una copia ordinaria de Expo protege la bóveda. Cualquier backend/esquema/sincronización futura requiere autorización e implementación independientes.
8. Adjuntos siempre cifrados, sin URLs públicas ni nombres sensibles ordinarios. Acciones de Calendario únicamente mediante referencia neutra autorizada explícitamente. Desproteger exige autenticación, confirmación y transferencia transaccional; no permite arrastre accidental.
9. Antes de activar: vectores criptográficos y alteración de ciphertext/tag/AAD, nonce/reutilización, claves incorrectas/rotación, adjuntos, corrupción y escrituras interrumpidas, permisos y denegaciones, pérdida/restauración de claves, biometría cambiada, recuperación/backup y auditoría de todos los canales de exposición.

Expo SDK 58 ofrece AES-GCM en expo-crypto, pero su disponibilidad no prueba que una bóveda completa sea segura. SecureStore documenta restricciones de requireAuthentication en Expo Go y Face ID necesita un development build. Por ello este cambio no incorpora cifrado parcial ni permite almacenar notas sensibles.

Fuentes técnicas oficiales consultadas:
- [Expo Crypto SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/)
- [Expo SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)
- [Expo LocalAuthentication SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/local-authentication/)

## Validación y límites

Las pruebas ejecutan los componentes reales con adaptadores nativos deterministas, la cola de persistencia con archivos temporales, la sesión local, el planificador nativo y el finalizador real de arrastre. Las mediciones responsive usan React Native Web y un adaptador explícito de geometría del teclado: no sustituyen UIKit ni una prueba física en iPhone.

Pendiente de aceptación física: apertura con teclado frío/caliente, edición después de dictado nativo, guardar/cerrar/recargar recuperando notas, pickers y permisos reales, notificación en iOS, arrastre/scroll/modo zurdo y cierre de un solo nivel. El resultado técnico no congela NOTAS V1.
