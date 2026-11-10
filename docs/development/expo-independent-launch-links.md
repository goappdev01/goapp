# Accesos independientes de Expo Go desde el panel privado

## Comprobación que motivó la corrección

La prueba física comunicada no mostró 8089 en Recently Opened. El enlace anterior
del panel y su respuesta efectiva eran `exp://<IP Tailscale>:8089`; las peticiones
reales de manifiesto y bundle no redirigían a 8088. Ambos manifiestos tenían el
nombre correcto, puertos y carpetas diferentes, pero el mismo slug y scopeKey.
No se ha inspeccionado el historial privado del iPhone ni se ha demostrado que
ese scopeKey compartido sea por sí solo la causa del comportamiento físico.

El código público actual de Expo Go distingue las URL de desarrollo por host y
puerto en su gestor de enlaces, y trata además `release-channel` como
discriminador de aplicación. El historial iOS se guarda localmente y no es una
interfaz que el puente pueda modificar de forma fiable.

Fuentes:

- [Gestor nativo de enlaces](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Exponent/Kernel/Services/EXKernelLinkingManager.m).
- [Historial de Home](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Client/SwiftUI/HomeViewModel.swift).

## Corrección acotada

El mismo panel muestra ahora dos botones permanentes y explícitos:

- **ABRIR COLA TERMINADA · 8088**: IP Tailscale, puerto 8088 y discriminador
  `release-channel=go-cola-terminada-8088`.
- **ABRIR COMPROBACIONES · 8089**: nombre DNS privado del mismo equipo, puerto
  8089 y discriminador `release-channel=go-comprobaciones-8089`.

Son autoridades y URL de apertura diferentes. Este parámetro solo identifica el
arranque de desarrollo; no publica canales EAS ni cambia configuración alojada.
No se cambian slug, scheme, projectId, scopeKey, autenticación o almacenamiento.
8089 conserva su SHA elegido, directorio y procesos independientes.

`tools/go-codex-bridge/expo_links.py` obtiene el manifiesto real de cada destino,
sin seguir redirecciones. Exige coincidencia de nombre, SDK 58, puerto de
hostUri, debuggerHost y URL del bundle iOS. Un destino inválido no recibe enlace;
jamás se sustituye 8089 por 8088. La consulta es de lectura y tiene caché de diez
segundos, timeout acotado y caducidad de los enlaces. El navegador bloquea
enlaces caducados o respuestas con puertos intercambiados. El clic válido sigue
siendo síncrono para conservar el gesto requerido por Safari.

El campo antiguo `expo.url` también entrega el nuevo acceso verificado a 8089,
para corregir una pestaña antigua mientras se recarga la interfaz nueva.

## Verificación y límites

Pruebas Python: `python -m unittest discover -s tests -p test_expo_links.py`.
Pruebas de enlaces visibles: `node --test tests/expo-links-ui.test.mjs`.
Se conservan las pruebas de permisos HTTP y de los nombres Expo anteriores.

El despliegue solo sustituye las fuentes propias del puente y utiliza su reinicio
controlado con rueda pausada, sin ejecuciones activas. Metro, Tailscale, backend,
autorizaciones y tarjetas se preservan. La publicación y el proceso cargado se
verifican por separado. La comprobación física final usa los dos botones del
panel y el menú de Expo Go; no depende de que Recently Opened se haya actualizado.
No se declara resuelto el historial nativo sin validación física.
