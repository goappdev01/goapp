# Migración técnica a Expo SDK 58

Base oficial: `66d9deaf9e738e7fd6311a076ee25d814bf41ae7`. La migración conserva las rutas, las reglas comerciales, los datos y el diseño de GO.

## Dependencias

Expo `57.0.26` → `58.0.19`; React Native `0.86.3` → `0.88.0`; React y React DOM `19.2.3` → `19.3.0`; Router `58.0.26`; Reanimated `4.7.1`; Worklets `0.13.0`; Gesture Handler `3.3.0`; teclado `1.22.7`; SecureStore `58.0.2`; TypeScript `6.0.3`.

Los módulos de Expo se alinean con `expo install --fix`. `expo-asset` es dependencia directa requerida por audio. El catálogo compartido alinea React y sus tipos para evitar copias distintas entre la aplicación y sus hooks. Las demás dependencias directas de otros paquetes conservan sus versiones; solo cambian sus referencias al peer de React cuando corresponde.

No existen carpetas `ios/` o `android/` propias. No se ha ejecutado prebuild ni una migración de base de datos.

## Adaptaciones

- Referencias nativas con los tipos públicos `ViewInstance`, `ScrollViewInstance` y `TextInputInstance`. La fuente de AppState admite el valor inicial indefinido sin cambiar el funcionamiento de la renovación de sesión.
- Se retira `baseUrl`, obsoleto en TypeScript 6; se conserva el alias `@/*` mediante `paths`, con comprobación estricta activada.
- Los gestos existentes continúan usando su implementación compatible: `LegacyScrollView` y `LegacyPanGesture`. No se reescriben gestos ni relaciones con la API nueva.
- El pie ausente de una lista usa `undefined`, como requiere el nuevo tipo nativo, manteniendo la misma representación vacía.
- Se retira la opción obsoleta `newArchEnabled`. La nueva arquitectura continúa siendo la predeterminada.
- La imagen, el fondo blanco y el ajuste `contain` de arranque pasan al plugin `expo-splash-screen`, con compatibilidad de imagen completa en iOS.
- Se conservan explícitamente la salida web SPA y la carga síncrona de rutas web. Nombre, slug, scheme, orientación, iconos y permisos existentes permanecen.

Los fixtures de VM declaran explícitamente sus valores anteriores de `esModuleInterop` y `alwaysStrict`, cuyos valores por defecto cambian con TypeScript 6. Esto no desactiva el modo estricto de la aplicación ni elimina aserciones. El adaptador de calendario reconoce la exportación compatible de Gesture Handler. Tres expectativas anteriores a las fichas ampliadas publicadas se actualizan para comprobar los controles actuales, el rojo vigente y la diferencia entre una tarea personal y una compartida; se conservan las aserciones de identidad, persistencia, propuesta y ausencia de mutaciones.

## Comprobaciones

- Expo Doctor: 20/20 comprobaciones correctas.
- TypeScript móvil con TypeScript 6 y compilación de librerías compartidas: correctos.
- Instalación `pnpm install --frozen-lockfile --offline`: correcta, sin nuevas resoluciones.
- Exportación iOS con caché independiente de 8088: correcta, incluido Hermes y los assets de la Tierra.
- Comparación del JavaScript de las 16 fuentes ajustadas: idéntico salvo la exportación compatible del scroll y el valor vacío del pie de lista.
- React se resuelve a una sola instancia desde la aplicación, la interfaz web y React Query de las librerías compartidas.
- Treinta suites dirigidas: 443 casos correctos, 0 fallidos. Cubren sesión, acceso, teclado, gestos, calendario, reservas, mensajes, notas, avisos, audio y Tableros. Los logs se conservan en el informe local de la migración.

En Windows, el script `preinstall` existente necesita el `sh` instalado con Git en el PATH del comando. No se ha cambiado la configuración global del equipo. Se conserva pnpm y su lockfile; no se utiliza npm install.

## Comprobación física pendiente

Abrir el mismo proyecto de Expo Go mediante `exp://100.105.48.111:8088`, con Tailscale conectado. Comprobar arranque, Tierra, sesión y los tres perfiles; navegación, gestos y cierres; teclado; calendarios y reservas; imágenes/cámara; micrófono y avisos locales según los permisos del dispositivo.

Las pruebas automáticas no acreditan notificaciones físicas, entrega de mensajes entre cuentas reales ni reservas en un servidor público. Las limitaciones de los módulos dentro de Expo Go y del backend continúan aplicándose. No se han modificado Railway, Supabase, credenciales ni los otros servicios.

Referencias: [actualización SDK 58](https://expo.dev/blog/how-to-upgrade-to-sdk-58), [guía de actualización](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [migración de Router](https://docs.expo.dev/router/migrate/sdk-57-to-58/) y [compatibilidad de Gesture Handler 3](https://docs.swmansion.com/react-native-gesture-handler/docs/guides/upgrading-to-3/).
