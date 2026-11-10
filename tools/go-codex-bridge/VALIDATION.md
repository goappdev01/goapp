# Verificación V2 — 10 de noviembre de 2026

- Base consultada: `origin/main` en `ba6c6307af67e619de392b6fcae4bb354c4450d7`.
- 232 pruebas correctas desde la copia versionada, usando exclusivamente SQLite
  temporal, Git bare y transportes sintéticos. Incluyen 20 casos V2; un fallo de
  tarjeta inyectado permite completar los ciclos de las siguientes independientes,
  conserva dependencias y no repite el primer intento.
- Sintaxis Python y JavaScript y `git diff --check` correctos.
- Reinicio controlado del único puente: versión efectiva
  `2026-11-10-remote-owner-v2-1`, huella de fuentes comprobable en `/api/health`.
  Las huellas normalizan CRLF a LF para compararlas con los blobs Git.
- Panel probado por el límite real HTTP del servidor: proxy y propietario
  autorizados admitidos; otra identidad y las API locales por proxy denegadas.
  También se prueban origen, cookie segura, CSRF y confirmaciones de un solo uso.
- El acceso HTTPS remoto requiere que la red Tailscale tenga Serve/HTTPS
  efectivamente habilitado; no se equipara la prueba local del límite HTTP a una
  apertura desde iPhone. Funnel no forma parte del despliegue.
- 8089: instalación offline y separada desde lockfile congelado, sin scripts.
  SDK 58; bundle iOS de 20.973.047 bytes y 280 fuentes comparadas con el SHA
  fijado `ba6c6307af67e619de392b6fcae4bb354c4450d7`. Comprobación por Tailscale y
  respuesta 401 de la API protegida Railway; no equivale a conversación alojada.
- Metro 8088 conserva su proceso y código. No se modifica GO, backend, permisos
  alojados, datos ni servicios de otros módulos.
- Comparación con copia SQLite previa: trabajos, intentos, lote, autorizaciones,
  fases y operaciones de tarjetas idénticos. Rueda pausada. El diagnóstico
  bloqueado, sus artefactos y las tarjetas siguientes permanecen intactos.
- Quedan separadas la validación física en iPhone y la conversación alojada entre
  dos identidades de prueba. No se ejecutaron tarjetas ni escrituras en Trello.

La publicación de esta fuente no activa un lote ni cambia automáticamente la
versión elegida en 8089. Responder en el panel conserva una decisión: no promete
interacción en vivo con el ejecutor CLI ni una continuación ya realizada.
