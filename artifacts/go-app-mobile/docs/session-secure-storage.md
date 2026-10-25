# Credenciales de sesión en almacenamiento protegido

Estado: preparado localmente en `fix/go-session-continuity-2026-10-12`; requiere integración y validación física. No se ha activado esta versión en Metro ni en la pasarela.

## Almacenamiento

- iOS: Keychain mediante Expo SecureStore. Android: almacenamiento cifrado de SecureStore.
- Clave protegida: `go_auth_session_v2`, servicio `go.auth.session.v2`.
- Accesibilidad iOS: `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. No se exige biometría para leer cada sesión.
- Solo se conservan access token, refresh token, caducidad y datos mínimos de identidad. No se guardan contraseñas.
- Tipo de cuenta, contexto, preferencias y todos los datos DEMO continúan en sus almacenes actuales. Estos valores nunca conceden permisos.

## Migración y errores

La lectura busca primero una sesión protegida. Si falta, migra la sesión válida de `go_supabase_session_v1`: escribe, comprueba mediante lectura el contenido completo y después elimina únicamente la copia antigua de autenticación. No migra datos DEMO ni roles ADMIN.

Una lectura, escritura o comprobación temporalmente fallida produce un error recuperable. No se utiliza la copia en texto plano para autenticar mientras SecureStore está inaccesible. Si la migración no se ha completado, se conserva el original para reintentar. No se registra el contenido de las credenciales.

La renovación conserva el contrato existente y la escritura ordenada del par de tokens. No cambia UUID, permisos ni eventos de identidad. Un rechazo definitivo del servidor invalida la sesión; una caída de conexión no la borra.

El cierre de sesión guarda primero la marca no secreta `go_auth_signed_out_v2`, elimina la sesión protegida y las claves antiguas de autenticación/tipo de cuenta. La marca evita restaurar una copia restante después de un cierre parcial; solo un nuevo login explícito y guardado correctamente puede retirarla. Si el almacenamiento entero falla, se bloquean las credenciales en memoria y se comunica que la limpieza no pudo completarse. No puede garantizarse una escritura durable cuando el sistema operativo rechaza todas las escrituras: hay que reintentar la limpieza.

## Plataformas y límites

- SecureStore está incluido en Expo Go; se usa la versión `~58.0.2` prevista por Expo SDK 58. El plugin añadido prepara la exclusión de sus datos del backup Android para futuros builds propios.
- Expo Go no permite exigir biometría con todas las capacidades de una app propia. Se usa almacenamiento protegido sin `requireAuthentication`; no se prometen prompts de Face ID.
- Un iPhone bloqueado puede impedir temporalmente la lectura. Al desbloquear y regresar se puede reintentar sin borrar la sesión.
- Algunas versiones nativas pueden rechazar valores grandes. El error se conserva como recuperable: no se truncan tokens ni se recurre a AsyncStorage.
- En web no existe SecureStore equivalente: las credenciales solo permanecen en memoria. Una recarga completa del navegador necesita un nuevo login. La persistencia web mediante cookies HttpOnly requeriría una tarea y contrato distintos.
- Expo Go y una futura app instalada tienen almacenes distintos. No se garantiza conservar sesión al reinstalar, borrar datos, cambiar de proyecto o de contenedor. En todos los casos el servidor sigue siendo la autoridad de acceso.

## Prueba física cuando se autorice servir esta reparación

1. Abrir GO con la sesión anterior: debe migrar sin volver a pedir contraseña y conservar contexto, empresa seleccionada y datos DEMO.
2. Alternar con ChatGPT/Trello, bloquear/desbloquear y cerrar/reabrir Expo Go: comprobar continuidad, pantalla y datos.
3. Dejar caducar el access token y comprobar renovación a través de la pasarela actualizada. La pasarela activa anterior aún no contiene la reparación preparada; no se ha reiniciado.
4. Cerrar sesión voluntariamente y reabrir: debe pedir autenticación; los negocios y reservas DEMO deben seguir presentes.

Las pruebas automatizadas utilizan almacenes ficticios separados, el módulo real de sesión y un proveedor Auth simulado. No equivalen a una comprobación de Keychain en un iPhone real.

Referencias oficiales: https://docs.expo.dev/versions/v58.0.0/sdk/securestore/ y https://docs.expo.dev/guides/authentication/.
## Formulario nativo de credenciales — iOS

El login identifica explícitamente el correo como textContentType username y la contraseña como password en iOS. En registro usa emailAddress y newPassword. Android/web conservan autoComplete username/current-password o email/new-password. No se fijan ambos mecanismos simultáneamente en iOS. La contraseña mantiene secureTextEntry, sin corrección ni capitalización automática.

Los gestores de contraseñas pueden rellenar ambos campos mediante los eventos nativos. GO no consulta contraseñas a partir de un correo, no lee el llavero de contraseñas del usuario y no persiste contraseñas. Se conserva el toque directo, Next hacia contraseña y Go para entrar. Los tokens de sesión usan el adaptador SecureStore y la reparación de continuidad ya preparada.

Face ID/Touch ID al seleccionar credenciales guardadas pertenece al gestor del sistema. Esto es independiente de requireAuthentication de SecureStore: no se activa biometría por cada lectura de sesión, para mantener compatibilidad con Expo Go y renovación. No se cambia autenticación ni autorización del servidor.

La propuesta automática específica de GO depende de iOS, el gestor seleccionado y la asociación app/dominio. Expo Go es el contenedor de desarrollo; GO aún no declara un dominio webcredentials ni dispone de una identidad nativa de aplicación propia en esta configuración. No se añaden asociaciones con dominios no verificados ni se promete que escribir un correo genere una contraseña sugerida.

### Comprobación física pendiente

Cuando se autorice servir la reparación móvil y activar la renovación preparada de la pasarela:
1. Con autorrelleno habilitado en iOS, abrir Usuario o Empresa y tocar correo/contraseña; elegir credenciales desde la sugerencia o el selector de contraseñas del teclado. iOS puede pedir Face ID, Touch ID o el código del dispositivo.
2. Probar la selección de ambos campos, el toque directo y Next/Go; probar también credenciales incorrectas.
3. Entrar, alternar aplicaciones, bloquear/desbloquear y cerrar/reabrir Expo Go sin reinstalarlo.
4. Comprobar restauración de sesión y contexto válidos, renovación tras caducidad y cierre manual que no se restaura. Los datos DEMO deben seguir presentes.
5. La revocación y los permisos ADMIN permanecen comprobados por el servidor; no basta con datos locales o el contexto seleccionado.

Referencias: https://reactnative.dev/docs/textinput#textcontenttype ; https://developer.apple.com/documentation/security/password-autofill ; https://docs.expo.dev/versions/latest/sdk/securestore/ .
