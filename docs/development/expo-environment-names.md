# Identificación de los dos Metro en Expo Go

`artifacts/go-app-mobile/app.config.js` conserva la configuración estática y
modifica únicamente `name`, según `RCT_METRO_PORT`, que Expo CLI asigna al puerto
resuelto al iniciar Metro. Sin ese puerto, o fuera de 8088/8089, conserva GO App.
No cambia slug, scheme, identificadores, versiones, permisos ni conexiones.

- 8088: **GO App · COLA TERMINADA · 8088**, servidor principal.
- 8089: **GO App · COMPROBACIONES · 8089**, servidor de comprobaciones fijado.

Referencias primarias:

- [Propiedad name de Expo](https://docs.expo.dev/versions/latest/config/app/#name).
- [Configuración dinámica oficial](https://docs.expo.dev/workflow/configuration/#dynamic-configuration).
- [Fila de recientes iOS](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Client/SwiftUI/Rows/RecentlyOpenedAppRow.swift): muestra el nombre guardado, no añade el puerto.
- [Historial iOS](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Client/SwiftUI/HomeViewModel.swift): distingue las URL de servidores y actualiza su entrada al abrirlas.

## Instalación fijada anterior al cambio

El worktree 8089 permanece en su SHA elegido. Se instala un `app.config.ts` local
exclusivamente de metadatos: aplica esos mismos nombres y, si una versión futura
contiene el `app.config.js` compartido, delega primero en él para conservar sus
otras opciones. Se usa un nombre de archivo distinto para no impedir el checkout
futuro del archivo compartido. No avanza HEAD ni copia código funcional. Ese
ajuste local queda visible como archivo sin seguimiento, conserva su efecto al
reiniciar Metro y no cambia automáticamente el SHA fijado. No altera configuración
firmada, dependencias ni el panel. Si una versión futura introduce también un
`app.config.ts`, se debe conciliar antes, sin sobrescribirlo.

El servidor principal recibe la configuración mediante su avance normal a MAIN.
Ambos manifiestos deben verificarse después: nombre exacto, SDK 58, mismo puerto,
misma identidad y misma URL de bundle, salvo el nombre. No se necesita vaciar
cachés ni modificar el historial privado del iPhone desde Windows.

## Comprobación en iPhone

Con Tailscale conectado, volver a abrir cada URL existente una vez, cargar GO y
regresar a Home → Recently Opened de Expo Go. El historial es local al iPhone:
no se promete actualizar entradas antiguas antes de volver a abrirlas. La
cantidad de texto visible depende de Expo Go, el ancho y el tamaño de fuente;
el manifiesto entrega los nombres completos. No es necesario cambiar de cuenta
ni borrar el historial.

Pruebas de configuración: `node --test tests/expo-environment-names.test.mjs`
desde `artifacts/go-app-mobile`.
