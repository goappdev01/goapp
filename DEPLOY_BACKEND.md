# Backend y Expo fuera de Replit

## Preparación incluida

Railway lee railway.json desde la raíz y construye Dockerfile.api. La imagen final contiene únicamente el backend compilado, usa un usuario sin privilegios y respeta PORT. No ejecuta migraciones ni compila Expo. Las credenciales locales se excluyen del contexto Docker.

## Despliegue pendiente de conexión a Railway

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

Preparación para despliegue; no se ha creado aún un servicio ni una URL pública. Pendientes la construcción Docker en Railway, las comprobaciones del dominio y la prueba visual con Expo Go.

Referencias: https://docs.railway.com/config-as-code/reference y https://docs.railway.com/deployments/healthchecks
