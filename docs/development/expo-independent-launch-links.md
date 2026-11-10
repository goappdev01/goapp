# Acceso real de Expo 8089 desde iPhone

## Fallo y evidencia conservada

El iPhone comunicó timeout. Una respuesta del servidor desde Windows no probaba
su accesibilidad desde el teléfono. La inspección del firewall encontró perfil
Privado con entrada bloqueada por defecto y una excepción para ese iPhone a
8088, sin excepción equivalente para 8089. Ambos Metro usaban el mismo Node y
escuchaban correctamente; Tailscale alcanzaba el iPhone. No se halló una
redirección 8089 → 8088.

Además, el puente había sustituido la IP anunciada por Expo CLI por un nombre
MagicDNS para 8089, mientras su comprobación interna eludía DNS conectándose a
la IP. Esa ruta ordinaria fallaba al resolverla desde Windows. No se atribuye el
timeout concreto de iOS a DNS sin captura del teléfono, pero se elimina esa
dependencia innecesaria y el falso positivo de la prueba.

## Corrección

Tras autorización específica del propietario se añadió una sola regla entrante
TCP 8089, limitada al iPhone autorizado, IP Tailscale del PC, Node y perfil
Privado. El respaldo, la prueba de igualdad de las demás reglas y la reversión
exclusiva de esa regla se guardan fuera de Git, en el estado local del puente.
No se cambian las reglas de 8088 ni políticas globales. No se reinician Metro,
Tailscale o el backend.

Los enlaces usan la IPv4 y el puerto anunciados por el endpoint oficial GET
`/_expo/open?platform=ios&runtime=expo`. No se añaden nombres DNS ni canales de
apertura artificiales, ni se propagan parámetros de automatización que oculten
el menú de Expo Go. La identidad funcional, scopeKey y sesiones se conservan.

`expo_links.py` comprueba en segundo plano, con límites y caché:

- Destino oficial, manifiesto, nombre, SDK 58, puerto y carpeta fijada de 8089.
- Descarga completa del bundle iOS, tamaño y SHA-256.
- Enumeración y descarga de sus recursos registrados, incluidas fuentes e imágenes.
- Handshake WebSocket de desarrollo, registrado aparte de la carga funcional.
- Lectura de la regla limitada autorizada y del perfil Tailscale, sin mutaciones.

En la instalación comprobada se descargaron realmente los dos bundles y 60
recursos por entorno. Esto acredita Windows → Metro, no iPhone → GO. El panel
lo dice expresamente y permite copiar el diagnóstico de cada entorno. Un fallo
no sustituye 8089 por 8088 ni conserva un enlace anterior como éxito.

## Límites de verificación

La carga física completa en Expo Go requiere la confirmación del propietario.
No se marca como superada mediante HTTP 200, una conexión TCP ni el consumo de
bytes de Tailscale. El historial Recently Opened no es requisito de esta prueba:
se utiliza el botón específico del panel. 8089 conserva su SHA seleccionado;
8088 conserva su función principal. Rueda pausada y tarjetas intactas.

Fuentes: [Expo CLI y endpoint oficial](https://docs.expo.dev/more/expo-cli/),
[conectividad de dispositivos Tailscale](https://tailscale.com/docs/how-to/connect-to-devices).
