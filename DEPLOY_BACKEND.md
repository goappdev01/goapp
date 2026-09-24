# Backend y Expo fuera de Replit

## Preparación incluida

El servicio usa Dockerfile.api y Node 24. Railway ha marcado railway.json como obsoleto en su API; por eso también se configuró directamente el servicio:

- Builder: DOCKERFILE; archivo Dockerfile.api.
- Start: `node --enable-source-maps dist/index.mjs` (ruta dentro de la imagen).
- NODE_ENV=production, PORT=8080 y RAILWAY_DOCKERFILE_PATH=Dockerfile.api.
- Healthcheck: /api/healthz, 120 segundos; suspensión por inactividad activada.

La imagen final contiene únicamente el backend compilado y usa un usuario sin privilegios. No se ejecutan migraciones ni se compila Expo. Las credenciales locales se excluyen del contexto de construcción.

Durante la puesta en marcha, redeploy reutilizó ajustes antiguos. Una actualización de variables con despliegue habilitado inició una construcción nueva con la configuración actual. No repetir despliegues fallidos sin revisar builder, comando de arranque y variables.

## Configuración de Railway

1. Conectar Railway y autorizar acceso a goappdev01/goapp.
2. Crear un servicio desde el repositorio con raíz / y la rama que contiene esta configuración. Seleccionar región europea si está disponible. Revisar el plan y coste antes de activar un plan de pago.
3. Configurar variables del servicio: SUPABASE_URL (URL del proyecto existente) y SUPABASE_PUBLISHABLE_KEY (clave pública del proyecto; también se admite SUPABASE_ANON_KEY). No usar service_role. NODE_ENV=production está incluido en la imagen; Railway asigna PORT.
4. Desplegar y generar el dominio público HTTPS. La comprobación de arranque usa /api/healthz; no comprueba la conexión a base de datos.
5. Comprobar públicamente /api/healthz (200), /api/supabase/businesses (200) y /api/supabase/auth/me sin token (401). Después probar autenticación y reservas desde la app.

## Conectar Expo

Copiar artifacts/go-app-mobile/.env.example a artifacts/go-app-mobile/.env y sustituir el dominio por el real, conservando /api al final. Esta variable es pública y solo contiene la URL del API.

Desde la raíz del repositorio:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/go-app-mobile start --clear
```

Abrir el QR con Expo Go en un teléfono de la misma red. Si se necesita otra red, usar:

```sh
pnpm --filter @workspace/go-app-mobile start:tunnel --clear
```

El túnel depende de la conectividad del entorno y de ngrok. Reiniciar Metro con --clear tras cambiar EXPO_PUBLIC_API_URL. Estos comandos no requieren las variables de Replit. Metro debe permanecer ejecutándose durante la prueba; alojar el backend no publica la aplicación móvil ni crea un QR permanente.

## Estado

Proyecto Railway: goapp. Servicio: goapp-api. Dominio asignado: https://goapp-api-production.up.railway.app. La variable EXPO_PUBLIC_API_URL debe ser https://goapp-api-production.up.railway.app/api.

El túnel Expo desde el entorno remoto agotó el tiempo de conexión de ngrok. No hay QR remoto verificado: ejecutar Metro desde un ordenador en la misma red que el teléfono, o reintentar el túnel desde ese ordenador. La prueba visual en Expo Go sigue pendiente.

Referencias: https://docs.railway.com/config-as-code/reference y https://docs.railway.com/deployments/healthchecks


Verificado el 24 de septiembre de 2026: Railway SUCCESS; /api/healthz, /api/supabase/businesses y /api/supabase/services responden 200. /api/supabase/auth/me y /api/supabase/bookings sin token responden 401. Estas pruebas no sustituyen el recorrido de reserva con una cuenta real. No se ha contratado ni cambiado ningún plan de pago.
