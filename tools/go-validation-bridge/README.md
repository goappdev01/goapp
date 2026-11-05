# Reparación preparada del emisor anónimo local

Estado: **no activada**. No se carga desde MAIN, Metro ni el backend en ejecución.
No contiene claves ni crea una sesión de usuario. No se ha modificado Supabase,
la base de datos, las políticas ni la rama de verificación empresarial.

El `provider.cjs` externo que sirve la API de validación genera al arrancar:

```js
const anon = sign({ role: 'anon', exp: Math.floor(Date.now() / 1000) + 86400 });
```

Su fallback REST reutiliza ese valor durante toda la vida del proceso. Después de
24 h, incluso `GET /api/supabase/businesses` **sin sesión** devuelve `PGRST303`.
Renovar la sesión del iPhone no puede renovar esta credencial del emisor local.

La corrección preparada conserva el firmante y el rol originales y renueva
únicamente la credencial anónima antes de caducar:

```js
const { createAnonymousAuthorization } = require('./anonymous-authorization.cjs');
const authorizationFor = createAnonymousAuthorization({ issueToken: sign });
// En la ruta REST del provider existente:
const headers = {
  'Content-Type': 'application/json',
  Authorization: authorizationFor(req.headers.authorization),
};
```

Un Bearer de usuario se reenvía intacto, aunque sea inválido: su verificación
continúa correspondiendo al servidor. No hay fallback de usuario a anónimo.

El adaptador activo está fuera del repositorio, incorpora un puente de identidad
y un preload de reparación financiera con comprobaciones de procedencia. No se
ha reemplazado, reconfigurado ni reiniciado. La autorización de modificar MAIN no
se ha tratado como autorización de cambiar esa infraestructura externa. Activar
esta reparación requiere revisar su integración allí y verificar las mismas
comprobaciones de integridad y la renovación real, sin acceder con credenciales
del propietario ni alterar los permisos.

Prueba aislada: `node --test tools/go-validation-bridge/*.test.mjs`.
