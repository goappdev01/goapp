# Pasarela local privada GO

Fuentes exactas de la pasarela que utiliza 3001 y sus pruebas. No se inicia ni se reconfigura al compilar la aplicación.

gateway.mjs conserva su lista de rutas, comprobación del propietario, restricción al iPhone autorizado y bloqueo de escrituras empresariales. Requiere GO_VPN_BIND con la dirección Tailscale de este PC; nunca enlaza con una dirección pública o comodín. El backend permanece en 3000 y Metro en 8086.

restrict-windows.ps1 documenta las reglas existentes del equipo. Requiere privilegios administrativos y una autorización específica; no ejecutarlo durante la consolidación. Sus IP corresponden al entorno autorizado actual.

Pruebas locales, con proveedores simulados: node --test --test-concurrency=1 tools/go-private-gateway/*.test.mjs

No contiene credenciales ni configuración .env. Los estados de ejecución y la configuración privada permanecen fuera del repositorio.
