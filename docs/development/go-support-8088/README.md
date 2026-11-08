# Rutas AYUDA en el entorno 8088 existente

Metro mantiene su proxy a la API local 3002. Esa API usa un bundle anterior y
no contenía SOPORTE. El preload `forward-support.cjs` añade únicamente el
encaminamiento `/api/supabase/support` hacia el servicio Railway existente
`https://goapp-api-production.up.railway.app`. No crea listener ni copia de API.
El resto de rutas continúa en el adaptador original y su almacenamiento aislado.

Se carga en el proceso 3002 mediante `--require` y
`GO_SUPPORT_FORWARD_ENABLED=true`, conservando su guardia de loopback, preload
anterior, directorio, configuración y logs. No requiere reiniciar Metro ni cambiar
EXPO_PUBLIC_API_URL. La instalación privada guarda el comando original para volver
a arrancarlo sin este preload si falla la comprobación de salud/regresión.

Solo reenvía Authorization, Content-Type, Content-Length y Accept. El destino es
HTTPS fijo, verifica TLS y no sigue redirecciones. Las sesiones las valida el API;
no traduce identidades locales en permisos productivos. Sin autorización devuelve
401; sin el esquema alojado devuelve 503, nunca éxito simulado.

No se instala automáticamente desde Git ni se modifica el adaptador de otros
módulos. No contiene secretos. `support-forwarder.test.cjs` prueba prefijos,
autenticación, aislamiento de otras rutas y rechazo de destinos inseguros.
