# Retirada de controles antiguos de cuenta — revisión local

Se eliminan las tarjetas «MI TELÉFONO GO» y «AUTOENVÍO», junto con el título
«CUENTA» que quedaba sin contenido en Herramientas. Se retiran sus propiedades,
estado, guardado al cerrar y estilos exclusivos. También se elimina una propiedad
de teléfono sin uso en MessagesScreen.

La identidad procede de `readAuthSession` y sigue los eventos de cambio de sesión.
Solo se utiliza `user.phone` cuando autenticación proporciona `phone_confirmed_at`;
el teléfono del perfil, los metadatos y los valores manuales antiguos no acreditan
un teléfono propio. La mensajería y las propuestas no requieren ese dato: usan el
contacto de la otra parte y el sentido enviado/recibido del GO. Los nuevos GOs y
recordatorios conservan el identificador de la cuenta. Los recordatorios propios
siguen siendo locales, sin abrir WhatsApp.

El envío normal ya no contiene ninguna redirección de pruebas. Al montar se guarda
`go_demo_self_send_enabled=false`; aunque esa escritura falle, la preferencia no
se lee ni interviene en el destino. Los registros propios y las propuestas con
propietario distinto no se convierten en envíos externos. Se conserva el simulador
interno de GO recibido, restringido a desarrollo y OWNER, y acepta sesión sin teléfono.

No se cambian servicios de autenticación, backend, permisos ni registro de dispositivos.
Se conservan las claves antiguas de teléfono, el identificador de dispositivo, el
token de notificaciones, el historial y los vínculos existentes. No se intenta leer
la SIM ni se solicitan permisos nuevos. Ninguna función revisada necesita registrar
un teléfono propio adicional; se mantiene el registro de cuenta existente fuera de
Herramientas.

## Comprobación local realizada

Desde `artifacts/go-app-mobile`:

```powershell
node --test tests/go-account-controls.test.mjs tests/tools-personalization.test.mjs tests/session-persistence.test.mjs tests/auth-navigation-lifecycle.test.mjs tests/go-messages.test.mjs tests/booking-public-catalog-auth.test.mjs tests/go-note-functions.test.mjs tests/calendar-message-navigation.test.mjs
```

Resultado final: **158 pruebas correctas, 0 fallos**. Incluyen montaje real de
componentes React con adaptadores nativos controlados, sesión existente/nueva,
reapertura, sustitución del dispositivo, cambio de cuenta durante lecturas pendientes,
conservación del almacenamiento, retirada de la preferencia antigua, destinatarios de
propuestas y recordatorios locales sin número. La mensajería y las reservas utilizan
los transportes existentes con respuestas controladas; no se contacta un backend real.

También se ejecuta correctamente `node --test tests/admin-tools-matrix.test.mjs`
(29 pruebas): la vista previa desde Herramientas conserva su funcionamiento y ya
no guarda un teléfono manual. `node --test tests/unified-notes-access-routing.test.mjs`
también pasa (49 pruebas), usando la misma normalización de contactos extraída al
módulo compartido. Total de las tres ejecuciones finales: **236 pruebas correctas**.

Desde la raíz del workspace:

```powershell
pnpm --filter @workspace/go-app-mobile typecheck
git diff --check
```

Ambos correctos. Se actualizan únicamente los adaptadores y referencias obsoletas
de las pruebas dirigidas de sesión para poder ejecutar sus comprobaciones actuales.

Incidencia adicional observada: una ejecución exploratoria de la suite histórica
`tests/customer-booking.test.mjs` falló. Su adaptador no contempla las dependencias
actuales `react-native`/`loginResponse`; al probar la adaptación mínima aparecieron
también contratos antiguos de reservas. Esa adaptación se retiró para no ampliar
esta tarjeta. Tanto esa suite como `data/booking.ts` permanecen idénticos a HEAD
(`git diff --exit-code HEAD -- artifacts/go-app-mobile/data/booking.ts artifacts/go-app-mobile/tests/customer-booking.test.mjs`, correcto).
La validación final de reservas usa `booking-public-catalog-auth.test.mjs`, que pasa.

La suite histórica `tests/configuration-auth.test.mjs` también falla antes de ejecutar
sus casos: busca un efecto `const rawDraft` que ya no existe y accede a
`loadEffect.arguments` cuando `loadEffect` es `undefined`. La suite y
`contexts/GoBusinessConfigContext.tsx` no tienen cambios respecto a HEAD. Esta
incidencia no afecta a las pruebas de sesión, reservas y Herramientas ejecutadas.

## Comprobación personal pendiente en iPhone

1. **Pantalla y sesión conservada.** Abre GO con la sesión que ya tenías. Pulsa el
   engranaje «AJUSTES» para abrir «HERRAMIENTAS». Desplázate hasta el final: no deben
   aparecer «MI TELÉFONO GO», «AUTOENVÍO» ni un título «CUENTA» vacío. Los ajustes
   restantes deben quedar seguidos y el botón «Cerrar Herramientas» debe responder.
2. **Persistencia.** En «HERRAMIENTAS» cambia «Región, ciudad…», cierra con
   «Cerrar Herramientas», cierra GO desde el selector de apps y vuelve a abrirlo.
   Deben conservarse la sesión y la región elegida, sin pedir tu número en Herramientas.
3. **Mensajería normal.** En GO pulsa «CHAT» y, en «MESSAGES», abre una conversación
   GO existente con un contacto conocido. Escribe un mensaje identificable y pulsa
   «ENVIAR» una vez. Debe aparecer una sola copia en esa conversación y llegar al
   interlocutor correspondiente. Al volver a abrirla deben seguir los mensajes previos.
4. **Propuesta externa.** En «Calendario» abre un GO externo existente de un contacto
   conocido y pulsa «Proponer cambio». Selecciona otra fecha/hora y confirma la propuesta.
   Si el flujo abre WhatsApp, comprueba el destinatario antes de enviar: debe ser el
   otro contacto. Cancela el borrador si solo estás revisando el destino. En una
   instalación que conservase «AUTOENVÍO» activado, tampoco debe redirigirse a ti.
5. **Reservas.** En «Calendario» abre «Mis reservas», selecciona una reserva existente
   y comprueba su negocio, fecha y hora. Abre su conversación y vuelve a la ficha:
   deben conservarse la misma reserva y su interlocutor, sin pedir un teléfono propio
   en Herramientas ni crear una reserva adicional.
6. **Nueva sesión.** En GO abre «CUENTA» y pulsa «Cerrar sesión». En la pantalla de
   acceso inicia sesión con una cuenta existente mediante «ENTRAR». Debe abrirse GO
   con esa cuenta sin configurar «Mi teléfono GO». En «CHAT», las conversaciones
   disponibles deben corresponder a la cuenta que acaba de entrar.
7. **Otro dispositivo.** En otro iPhone inicia sesión con la misma cuenta mediante
   «ENTRAR». Abre «CHAT» y una conversación GO existente: deben mantenerse el
   interlocutor y los mensajes guardados en el servicio, sin copiar ni introducir el
   antiguo teléfono manual de Herramientas.

Esta entrega es exclusivamente un parche local. Publicación pendiente de aprobación
del propietario. GitHub, commit/push, Metro y Trello corresponden al coordinador.
No se ha realizado comprobación física en iPhone.
