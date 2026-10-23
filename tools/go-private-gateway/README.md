# Pasarela local privada GO

Fuentes exactas de la pasarela que utiliza 3001 y sus pruebas. No se inicia ni se reconfigura al compilar la aplicación.

gateway.mjs conserva su lista de rutas, comprobación del propietario, restricción al iPhone autorizado y bloqueo de escrituras empresariales. Requiere GO_VPN_BIND con la dirección Tailscale de este PC; nunca enlaza con una dirección pública o comodín. El backend permanece en 3000 y Metro en 8086.

restrict-windows.ps1 documenta las reglas existentes del equipo. Requiere privilegios administrativos y una autorización específica; no ejecutarlo durante la consolidación. Sus IP corresponden al entorno autorizado actual.

Pruebas locales, con proveedores simulados: node --test --test-concurrency=1 tools/go-private-gateway/*.test.mjs

No contiene credenciales ni configuración .env. Los estados de ejecución y la configuración privada permanecen fuera del repositorio.

## Navegador de desarrollo autorizado

La pasarela admite CORS exclusivamente desde `http://100.105.48.111:8086`. Responde OPTIONS solo para el método que ya permite cada ruta: POST en login/refresh y GET en la lista de lecturas existente. Permite Accept, Authorization y Content-Type; no habilita cookies, comodines, nuevas rutas ni permisos. Los clientes nativos sin Origin conservan su contrato.

Los preflight no consumen intentos de login/renovación, pero siguen sujetos al límite global existente. Las respuestas de error conservan CORS para que Chrome pueda mostrar 400/401/403/429/502. Otros orígenes se rechazan antes de contactar con el backend. GET login y las escrituras empresariales siguen bloqueados. No se cambian firewall, Tailscale ni infraestructura de Nelson.

Prueba real pendiente: iniciar sesión desde Chrome con la cuenta del propietario, comprobar la sesión y cerrar sesión voluntariamente. Las pruebas automatizadas usan credenciales ficticias y un upstream simulado.
