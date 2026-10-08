# Agente 2 · GO IA / Reservas V1

## Estado de reanudación y aislamiento

Al inspeccionar el worktree `C:\Users\Usuario\.codex\worktrees\9998\goapp-profile-logout`, HEAD era `e0796a5b523944131539e51208d1c9ba7c8fd45a`, separado de una rama, y Git no mostraba cambios pendientes. No había una implementación parcial de IA que recuperar en este checkout. Se conservó ese estado base y se creó exclusivamente `codex/agent-2-ia-reservas-v1`.

Origen: https://github.com/goappdev01/goapp.git. El checkout principal no se ha editado. No se ha realizado merge, migración remota ni deploy.

## Implementación

- La entrada existente GO abre el asistente V1 e intenta escuchar inmediatamente. Si falta soporte, permiso, sesión o configuración de voz, lo informa y permite escribir.
- Micrófono de dos toques, estado real y texto progresivo en navegadores con SpeechRecognition. En iOS/Android se graba y se transcribe al detener, con autenticación del servidor; la grabación temporal se elimina. Se cierra al salir o pasar a segundo plano.
- Cinco botones: Menú, Adjuntar, Acciones, Zona y GO. GO puede ocupar derecha, centro o izquierda. La preferencia se guarda y derecha/izquierda actualizan la ergonomía general existente.
- Menú limitado a nueva conversación, mis reservas y ayuda. Nueva conversación no cancela reservas.
- Adjuntos locales mediante cámara nativa, biblioteca de fotos y selector de documentos. Se muestran como referencias; V1 no interpreta su contenido. No se suben automáticamente. Cámara se oculta en web.
- Zona compartida entre conversación y panel: destino escrito o dictado, GPS opcional, radio positivo sin máximo artificial, seis accesos rápidos y distancia personalizada. Guardar zona habitual requiere selección expresa.
- Geocodificación de destino/direcciones con caché, consulta reducida por actividad y catálogo. Una empresa identificada por nombre prevalece sobre el radio. No hay descubrimiento web de disponibilidad.
- Burbujas diferenciadas por posición, etiqueta y colores de contraste alto; resumen progresivo, tarjetas de catálogo y horarios, resumen final y confirmación explícita.
- Acciones según contexto: fecha/hora, servicio, profesional, cancelar búsqueda, consultar/cancelar reservas y teléfono del negocio vinculado. Modificar reserva se oculta porque no existe una operación remota para ello.
- Se conserva íntegro el antiguo asistente en GOChatLegacyScreen, detrás de GO_BOOKING_ASSISTANT_V1. Más y las funciones futuras permanecen allí.
- Landing solo recibe la conexión de ergonomía y recarga de su agenda local al cerrar IA; su diseño y navegación no se reconstruyen. El engranaje de Expo no se reproduce.

## Una sola autoridad de reservas

La interpretación devuelve únicamente campos validados, nunca IDs, precios, horarios o instrucciones ejecutables. La IA no tiene herramientas de escritura.

El catálogo, profesionales y ventanas proceden de los endpoints existentes. Se reutilizan `getAvailableSlots`, `claimSlot`, `cancelBooking` y el puente existente hacia la agenda. La confirmación refresca servicio/precio/duración, empresa, profesional y horario antes de llamar al mismo `POST /api/supabase/bookings` que Reservas manuales. El backend identifica al cliente por JWT y conserva RLS/validaciones/conflictos. No se ha creado otra tabla, motor ni endpoint de creación de reservas.

Los errores no se convierten en reservas locales de demostración. Mis reservas exige lectura remota; la agenda es solo una proyección. Una respuesta de confirmación incierta obliga a consultar Mis reservas antes de reintentar.

La disponibilidad comparte las limitaciones previas del flujo manual: la lectura de reservas está sometida a RLS y no existe un endpoint agregado de ocupación de otros clientes. La base de datos debe rechazar conflictos al escribir. La comprobación concurrente con dos clientes reales queda pendiente en un entorno de pruebas; no se ha debilitado RLS ni añadido una segunda agenda para resolverlo.

## Configuración de servidor

Usar las variables de `.env.example` exclusivamente en el servidor:

- `OPENAI_API_KEY`: activa interpretación avanzada y transcripción. Nunca tiene prefijo EXPO_PUBLIC.
- `GO_ASSISTANT_MODEL`: modelo de interpretación con Structured Outputs.
- `GO_TRANSCRIPTION_MODEL`: modelo de transcripción.
- `GO_GEOCODER_URL`: instancia Photon; el valor inicial es el servicio público. Las distancias se etiquetan como aproximadas porque provienen de direcciones geocodificadas.
- Mantener `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y la URL de API móvil ya existentes.

Sin clave se conserva la extracción escrita local en español. No se ha introducido ninguna clave real ni realizado llamadas de pago. Los endpoints de IA pagados comprueban sesión, limitan tamaño/frecuencia y usan tiempos de espera. No guardan audio, texto ni credenciales en logs. Las consultas de ubicación pasan por el servidor; no se envían coordenadas GPS al proveedor de IA.

Referencias: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [transcripción](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create), [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/), [Photon](https://github.com/komoot/photon/blob/master/README.md).

## Validación

Pruebas automáticas con upstreams simulados y sin acceso a producción:

- 72 pruebas móviles: incluyen extracción/contexto, radio y empresa explícita, confirmación, conflicto, diálogo, ergonomía y ciclos de micrófono.
- 10 pruebas de servidor: incluyen autenticación, esquema estricto, caída del proveedor, límites, transcripción, caché de lugares y reglas de reservas existentes.
- Tipos del workspace, build del servidor y exportación de bundles web/iOS/Android.
- Revisión local a 390 × 844: barra en las tres posiciones, Menú, Zona, solicitud escrita y errores honestos sin catálogo remoto.

El primer chequeo global encontró el módulo autogenerado ausente del sandbox de maquetas. Se ejecutó su build habitual para generarlo antes de repetir los tipos; no se cambió su código.

Antes de pilotos: configurar el servidor de pruebas, probar micrófono/cámara/selectores en dispositivo físico y comprobar creación, cancelación y conflicto de dos clientes contra su base de datos. Compilar bundles no sustituye esas pruebas. No se ha actuado en producción.
