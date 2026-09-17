# GO — continuación del backend

## Cambios
- Conexión directa con SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY). Sin esas variables se conserva el conector de Replit.
- EXPO_PUBLIC_API_URL configura una URL absoluta de API para Expo fuera de Replit.
- POST /api/supabase/bookings valida identificadores, fechas futuras, duración, pertenencia del servicio/profesional y cliente autenticado.
- PATCH /api/supabase/bookings/:id/cancel cancela reservas del cliente autenticado y devuelve 404 si no son accesibles o cancelables.
- GET /api/supabase/staff y /availability: consulta de profesionales y horarios. El móvil usa esos datos para negocios remotos.
- La confirmación remota retira el HOLD local; la cancelación espera confirmación del servidor.
- Se rechazan cambios locales de estado para reservas remotas que aún no tienen endpoint de gestión.

## Ejecutar fuera de Replit
1. Usar Node 24 y pnpm; ejecutar `pnpm install --frozen-lockfile`.
2. Configurar las variables de `.env.example` en el entorno del proceso. El archivo por sí solo no carga variables en el API.
3. `pnpm exec tsc -b lib/api-zod lib/db --force`.
4. `pnpm --filter @workspace/api-server run dev`.
5. Para Expo Go, EXPO_PUBLIC_API_URL debe contener la IP de red del servidor (o un dominio HTTPS accesible desde el teléfono), incluyendo /api. Ejecutar Expo desde artifacts/go-app-mobile con `pnpm exec expo start --lan` y esa variable configurada.
6. Pruebas: `pnpm --filter @workspace/api-server test`.

Usar clave pública/anon, nunca service_role: las peticiones deben respetar RLS.

## Verificado
- TypeScript del API: correcto.
- Build del API: correcto.
- Prueba automatizada HTTP con Supabase simulado: falta de token, fechas inválidas, cliente ajeno, servicio ajeno, creación, conflicto 23P01, cancelación ajena, propia y sin token.
- El móvil sigue presentando errores de TypeScript; no está validado como compilación completa ni visualmente en Expo Go.

## Pendiente de prueba e implementación
- No se ha conectado al proyecto real de Supabase ni aplicado migraciones.
- Confirmación de correo: el registro ya muestra el aviso para confirmar y después iniciar sesión; no se ha verificado la entrega ni el retorno desde correo a Expo Go.
- No se ha subido este proyecto a GitHub ni desplegado.
- La configuración y edición de negocios/servicios/profesionales continúa local; los registros reales deben existir en Supabase con UUID válidos.
- Disponibilidad: validar las zonas horarias entre teléfono y negocio; la visualización actual usa el calendario local. No hay validación del horario de apertura en el servidor.
- Los HOLD son locales y no garantizan el horario. El conflicto definitivo depende de la restricción SQL bookings_no_overlap ya presente en la migración inicial; comprobar que esté aplicada.
- Antes de producción, revisar RLS y roles: la migración original permite actualizar el perfil propio y el API sincroniza role desde user_metadata editable. Eso no constituye autorización segura para roles privilegiados.
- Revisar renovación de tokens y aislamiento de datos locales entre cuentas. No se ha añadido refresh automático.
- Cambios empresariales de estado (completar/no-show/etc.) requieren un endpoint específico.
