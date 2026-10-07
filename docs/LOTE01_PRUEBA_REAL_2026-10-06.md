# LOTE 01 — Prueba real del 06/10/2026

## Resultado comunicado por el usuario

- Alta de Usuario: SUPERADA. Registro, recepción y confirmación del correo y acceso con la cuenta nueva, sin asistencia técnica. No repetir.
- Retorno inmediato tras confirmar el correo: PENDIENTE de observación en otra alta real. No crear otra cuenta únicamente para esta prueba.
- Confirmación de reserva: BLOQUEADA. El backend devuelve `Invalid booking: check IDs, future dates, status and notes`.
- Próxima visita: recuperar ancho y separación previamente validados; aprobación visual pendiente de iPhone.
- Las comprobaciones independientes de reservas pueden continuar.

## Diagnóstico técnico del 07/10/2026

### Reservas

`BookingSearchOverlay.handleConfirm` llama a `claimSlot`; `checkAndClaimBookingSlot` envía toda confirmación de cliente a `createRemoteBooking`, incluso si el negocio/servicio procede del catálogo local. `remoteBookingPayload` transmite esos IDs sin convertirlos. El backend exige UUID en business_id/service_id/staff_id, fechas futuras y duración positiva, notes de hasta 4000 caracteres y estado PENDING/CONFIRMED. La respuesta comunicada se produce antes de consultar Supabase o insertar la reserva.

`getBusinesses` devuelve el catálogo local si el remoto está vacío. Los seeds siguen creando IDs como `demo_biz_*` y `nemesi_molina`, que no son UUID. Consulta real de solo lectura el 07/10: businesses=0, services=0, bookings=0 en el proyecto goapp. Por tanto, ese catálogo no corresponde a negocios/servicios reales de esta base. El envío de IDs locales al endpoint real reproduce exactamente el error comunicado, incluso con fechas futuras y estado válidos; se añadió cobertura al test existente.

No se capturó el payload concreto del iPhone: no afirmar qué campo individual falló en aquel intento ni excluir un problema adicional de fecha/notes. El historial sitúa la confirmación remota en 946d196; no fue introducida por el último bloqueo empresarial. No existe evidencia de que una confirmación anterior guardase una reserva real en esta base.

No se cambió la confirmación ni se relajó la validación. No convertir IDs ficticios en UUID, no confirmar solo en AsyncStorage como si fuese una reserva real y no crear negocios ficticios en producción. Para desbloquear una reserva real hace falta un negocio real aprobado por GO, con servicio y disponibilidad publicados. Después habrá que separar explícitamente el catálogo demo del reservable real para que no se ofrezcan reservas imposibles. Hasta entonces, no repetir confirmaciones en iPhone.

### Próxima visita y separación

La implementación validada permanece sin commit en goapp-expo57, rama experiment/landing-visual-variants; no aparece en el historial de la rama actual. Se recuperaron únicamente sus tres cambios presentacionales: INFO_W (ancho original limitado por pantalla), PANEL_ACTION_GAP de 12 por escala y alineación de la ficha al mismo lado del panel. No se copió el resto del archivo experimental.

La cuadrícula de seis botones, transporte, handlers y anclajes permanecen iguales. Cambio propuesto ya se apila sobre la altura medida de Próxima (`nextAptPanelH`) con separación de 8 por escala, igual que en la implementación experimental. Se conserva esa fórmula; recupera la altura del panel al restaurar el espacio previo a los botones. Comprobar en iPhone el ancho y los tres bloques simultáneos sin realizar reservas nuevas.

## Validación de esta recuperación

- TypeScript móvil: correcto (exit 0).
- Test existente de reservas, ampliado con tres casos de IDs locales: correcto. Se usan respuestas simuladas y servidor local; no se insertan reservas reales.
- `git diff --check`: correcto; aviso de conversión LF/CRLF de Windows, sin errores de espacios.
- Los bloques de ancho y separación recuperados coinciden con el worktree experimental. No se modificó ese worktree ni Metro, producción, esquema, autorización, autenticación o flujo de confirmación.
- Pendientes: comparación visual en iPhone; reserva real bloqueada por la incompatibilidad de catálogo descrita y ausencia de negocio/servicio real autorizado.

## Recuperación adicional del Landing — 07/10/2026

Se actualizaron las referencias de origin y se revisaron todos los historiales disponibles. El commit b8254e5 conserva una selección de cambios del experimento visual, pero no incluye humanityPlacement.ts ni la recolocación de Humanity. Estos cambios están conservados en el working tree de goapp-expo57, basado en ae3e3d6; no se encontró un commit local/remoto que los contenga. No atribuirles un respaldo GitHub que el historial disponible no acredita.

- Próxima ancha: ya recuperada y publicada en 5b0bf99. Se mantiene exactamente INFO_W, alineación y PANEL_ACTION_GAP; no se repite ni sustituye ese trabajo.
- Humanity: se copia íntegro el helper conservado y se recupera su conexión con el centro orbital, las medidas de los paneles, el tamaño del globo y la etiqueta de una línea. Se conservan colores, efectos y acción actuales; no se importan otros cambios visuales del experimento. La medida de colisión incluye el ancho real de la ficha, aunque sobresalga de la cuadrícula estrecha.
- Separación: el espaciado de apilado conservado es 8 por escala; no se inventa otro. Se encontró además un defecto preexistente en la limpieza de medidas: el efecto borraba nextAptPanelH en compacto aunque Próxima expandida siguiese renderizada. Esto desactivaba proximaExpanded y colocaba Cambios en el mismo anclaje inferior. Ahora se conserva la altura en todos los tamaños mientras el panel está visible y solo se borra cuando deja de estarlo. Los tests cubren ambos tamaños lógicos y los estados ocultos.
- Metro activo: manifiesto de 8081 identifica este worktree y exposdk:57.0.0. No se reinició ni cambió Metro.
- Validación: TypeScript móvil correcto; dos tests de recuperación correctos (altura y colisiones de Humanity para escalas 0.83/1/1.12, con paneles y sin ellos). El helper coincide byte por byte con el conservado. Los 357 handlers/opciones onPress, onLongPress, onPressIn, onPressOut, delayLongPress y hitSlop coinciden con HEAD anterior. Diff limitado al Landing, helper, test y esta bitácora; sin cambios funcionales ajenos, backend o producción.
- Pendiente: comprobar visualmente en iPhone la ficha ancha, los tres bloques simultáneos y Humanity junto a Otro. No se da por superada esa observación humana mediante tests automáticos.
