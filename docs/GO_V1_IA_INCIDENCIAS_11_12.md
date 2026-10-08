# GO V1 — Incidencias 11 y 12

Continuación de `4d4881b`, rama `integration/go-v1-calendario-ia-landing`.
Worktree: `C:\Users\Usuario\.codex\worktrees\go-v1-calendario-ia-landing\goapp-profile-logout`.

## Auditoría y alcance

El texto técnico salía de `assistantApi` en `lib/bookingAssistant.ts` y se propagaba a los estados de conversación/voz/Zona.
La fila adicional estaba en `AssistantCloseControls`: altura 60 y área de arrastre limitada a esa fila.
Se reutilizan `GoCloseButton` y `DraggableFAB`, procedente del commit `946d196` (Restore GO from Replit).
No se reconstruye el gesto: conserva pulsación prolongada de 500 ms, Reanimated, haptics y AsyncStorage.
No se modifican Landing, Herramientas, Calendario, reservas manuales ni autenticación.

## 11 — Errores públicos e internos

La frontera HTTP convierte configuración ausente, conexión fallida, HTTP erróneo y respuestas inválidas en mensajes públicos contextualizados.
No se presenta el cuerpo de error del servidor ni excepciones de red/JSON al cliente.
Las búsquedas fallidas dicen que no pudieron realizarse; no se simulan ubicaciones ni éxito.
401 solicita iniciar sesión y 429 invita a reintentar más tarde.
El diagnóstico interno usa `console.info`, visible en logs de desarrollo/Metro, con código, categoría de operación y, si procede, estado HTTP.
No se utiliza `console.warn` para evitar avisos LogBox destinados al desarrollador dentro de Expo Go.
Nunca se registran URL, ruta del endpoint, consulta del usuario, cuerpo de solicitud/respuesta, sesión ni credenciales.
Ejemplo de código interno: `API_URL_MISSING`; su explicación se mantiene aquí y en código, no en el chat.

### Causa comprobada y configuración de desarrollo

En este worktree solo está `.env.example`; no existen `.env` ni `.env.local`.
En la sesión inspeccionada tampoco están definidas `EXPO_PUBLIC_API_URL` ni `EXPO_PUBLIC_DOMAIN`.
`.env.example` es una plantilla, no un archivo que Metro cargue automáticamente.
El script `dev` depende de variables REPLIT; los scripts `start`/`start:tunnel` no aportan por sí solos una URL de API.
Eso explica la falta de configuración local. No se ha inspeccionado el proceso Metro que generó el bundle del iPhone ni se afirma haber confirmado su entorno exacto.

Configuración para quien gestione el backend de desarrollo:

1. Poner en marcha una instancia de desarrollo del backend existente con sus variables privadas y un `PORT` válido. El servidor exige `PORT`; no hay un puerto predeterminado que deba suponerse.
2. Elegir una URL accesible desde el iPhone, preferentemente HTTPS. Para LAN, el teléfono debe poder alcanzar el host/puerto y estar en una red compatible. `localhost` en el teléfono apunta al teléfono.
3. Crear `artifacts/go-app-mobile/.env.local`, ignorado por Git, con esta plantilla sustituida por la dirección real del entorno de desarrollo:

   ```dotenv
   EXPO_PUBLIC_API_URL=https://<host-desarrollo>/api
   ```

4. La base termina en `/api`, sin `/booking-assistant`: el cliente ya añade ese prefijo. Verificar por GET que `<base>/booking-assistant/capabilities` devuelve JSON y `<base>/booking-assistant/places?q=Cieza` devuelve resultados o un error del servicio controlado, no 404.
5. Reiniciar Metro desde la raíz, limpiar su caché y volver a cargar Expo Go:

   ```powershell
   pnpm.cmd --filter @workspace/go-app-mobile exec expo start --lan --clear
   ```

   Si hace falta el túnel de Expo, usar `--tunnel` en lugar de `--lan`. El túnel de Metro no hace accesible automáticamente el backend: su URL debe ser alcanzable por separado.

La URL pública de API se incorpora al bundle: no es un lugar para claves, tokens ni secretos. Las credenciales privadas permanecen exclusivamente en servidor.
No se ha creado un archivo de entorno con una URL supuesta, cambiado configuración de producción ni iniciado un servidor.
La comprobación anterior de la URL en `.env.example` devolvió 404 para /places; esa dependencia sigue pendiente hasta disponer del backend correcto.

## 12 — Cierre flotante

Se elimina la fila inferior y su fondo. El contenedor es absoluto y deja pasar los toques fuera del botón (`pointerEvents=box-none`).
La barra de cinco acciones y la zona segura conservan su distribución.
Las dimensiones del contenido, cabecera y pie se miden con `onLayout` dentro de KeyboardAvoidingView; el área flotante excluye el campo de escritura, envío y GO.
El flotante principal también puede usar la cabecera segura si el teclado y un mensaje multilínea reducen el contenido. En los paneles se excluye igualmente la barra inferior. No se añade ningún cierre.
La posición inicial está en la parte inferior del área disponible, sobre los controles protegidos.
Se conservan las claves existentes `fab_pos:booking-assistant:close` y `fab_pos:booking-assistant:panel-close`.
El arrastre descuenta la traslación existente al activarse, para no saltar tras la pulsación prolongada.
Una lectura tardía de preferencias ya no puede sustituir una posición que el usuario está arrastrando.
Al abrir el teclado se limita la posición dibujada, sin destruir las coordenadas elegidas; al cerrarlo se recuperan.
Las opciones sin límites locales siguen usando el comportamiento de pantalla de los otros consumidores de DraggableFAB.
Si un layout extremo deja menos de 60 px libres sobre los controles, se oculta temporalmente la superposición para no taparlos; comprobar este límite en dispositivo junto con mensajes multilínea y accesibilidad.

## Validación y pendientes

96 pruebas móviles aprobadas sobre `assistant-floating-close`, `assistant-location`, `booking-assistant`, `task-creation`, `go-log-sync`, `calendar-container-ux` e `integration-v1`.
Incluyen sanitización de configuración y respuestas maliciosas, errores de red/JSON, registros sin datos sensibles, arrastre sin salto, persistencia tras reabrir, límites, cambios de teclado y respuestas tardías de preferencias.
Las regresiones anteriores verifican tres posiciones, tamaños circulares, un solo GO, rayo Acciones, búsqueda, GPS, tareas, confirmaciones, aislamiento y persistencia.
Typecheck móvil y `git diff --check` antes del commit.

Pendiente: comprobar físicamente en iPhone el long-press, seguimiento del dedo, posición tras reabrir, teclado abierto/cerrado, campo multilínea, zonas seguras y accesibilidad. Las pruebas de componentes con mocks no sustituyen esa verificación.
Pendiente externo: URL válida y backend de desarrollo disponible; voz nativa requiere además sus capacidades, sesión y permiso del dispositivo.

## Archivos

- `artifacts/go-app-mobile/lib/bookingAssistant.ts`.
- `artifacts/go-app-mobile/components/DraggableFAB.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/AssistantCloseControls.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/BookingAssistantScreen.tsx`.
- `artifacts/go-app-mobile/components/booking-assistant/BookingAssistantPanels.tsx`.
- `artifacts/go-app-mobile/tests/assistant-location.test.mjs`.
- `artifacts/go-app-mobile/tests/assistant-floating-close.test.mjs`.
- Este informe y una nota de actualización en el informe de las diez incidencias.

Se conservan sin incorporar los dos cambios ajenos previos: `expo-env.d.ts` y `docs/GO_V1_INTEGRACION_PROMPT_3.md`.
Sin push, merge, despliegue ni subagentes.