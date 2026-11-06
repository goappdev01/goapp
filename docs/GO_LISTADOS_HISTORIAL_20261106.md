# Listados: presentación, filtros e historial

Continuación de `GO_LISTADOS_PREMIUM_20261106.md`, sobre MAIN `c2f6c28`.
Referencias consultadas: tarjetas 191 y 192 del tablero PELUQUERIA.

## Implementación móvil

- Cabecera única, RESERVAS en los tres perfiles, ARCHIVO voluntario y ANTIGUAS
  separados. Se reutilizan las proyecciones y fuentes autorizadas existentes;
  no se crean reservas, tareas, eventos ni conversaciones.
- Configuración propia mediante el `DraggableFAB` existente: orden, tamaño y
  expansión conservan sus controladores. Configuración y cierre compartido
  ocupan regiones flotantes separadas, con posición por mano, límites seguros
  y adaptación al teclado. No se cambia el gesto de arrastre de Calendario.
- Scroll con contenido anclado abajo mediante `flexGrow` y `justifyContent`;
  no se invierte la colección. El orden ascendente/descendente sigue siendo
  la preferencia existente. Las listas que exceden la altura siguen desplazándose.
- Tarjetas neutras, título de un renglón con texto completo en el detalle,
  categoría Belleza con acento amarillo corto; categoría y estado independientes.
  Propuestas con controles discretos, reversibles para zurdos, y alternativa
  accesible al deslizamiento. El contacto funcional se conserva con su nombre.
- Ayuda lateral pasiva: tres ciclos espaciados, sin invocar acciones; estática
  con movimiento reducido y retirada tras uso. Preferencia por identidad/contexto.

## ANTIGUAS es visibilidad, no retención ni borrado

`listadosHistory.ts` calcula una clasificación de lectura. Solo una decisión
personal explícita REALIZADA o un estado terminal real de reserva puede pasar
a ANTIGUAS, y solo tras una finalización temporal fiable. Se usa el final completo,
incluida su duración; los instantes con zona conservan los cambios horarios.
Se preservan los registros ambiguos, las reservas CONFIRMADAS sin resolución,
las propuestas activas y las tareas PENDIENTES aunque hayan vencido.

Plazo inicial: 90 días. Preferencias 30/90/180/365 días por usuario/contexto,
persistidas mediante AsyncStorage. Se cuenta desde la finalización y, si es
posterior, desde la confirmación personal de realización. Al vencer el plazo
solo se excluye la ficha de estas vistas: no se escribe sobre el registro.
La preferencia no amplía la disponibilidad histórica de una API ni su paginación.

## Historial administrativo: contrato preparado, sin activación

Esta entrega NO crea una consulta global ADMIN, cambia RLS, aplica SQL,
ejecuta purgas, altera backend ni promete conservación indefinida. El ADMIN
móvil conserva las mismas fuentes y permisos previos; cambiar de perfil no
otorga acceso a otros datos.

Para una futura consulta administrativa real, pendiente de autorización específica:

1. Reutilizar el almacén original y su historial de decisiones. El servidor debe
   verificar identidad, permiso administrativo concreto, empresa y finalidad en
   cada consulta. No aceptar un rol ADMIN o identificador enviado por el cliente
   como prueba de acceso. Paginación estable, filtros por fechas, límites y
   trazabilidad de acceso; pruebas negativas entre usuarios y empresas.
2. Separar la preferencia visual de la política de retención persistida. Antes de
   activar una política, el responsable deberá aprobar para cada categoría de
   dato su finalidad, fundamento, plazo justificado, evento inicial, restricciones
   de conservación, procedimiento de revisión y eliminación/anonimización.
   Los 90 días de Listados no constituyen ese plazo legal.
3. Estadísticas con agregación por empresa/profesional y periodo autorizado,
   sin nombres, teléfonos, mensajes ni identificadores de clientes cuando no
   sean necesarios. Evitar grupos demasiado pequeños que permitan reidentificar.
4. Preparar y revisar por separado cualquier migración/endpoint requerido,
   con base aislada, pruebas de autorización y respaldo. No activar trabajos
   automáticos ni modificar producción sin la aprobación correspondiente.

No hay código de servidor incompleto publicado ni una implementación DEMO
paralela. La consulta administrativa transversal y la política ejecutable quedan
pendientes de ese contrato autorizado, mientras las mejoras móviles son independientes.

## Validación física pendiente

Validación técnica: **130/130** pruebas dirigidas de Listados y controles
flotantes. Suite conjunta con Notas, Calendario, confirmaciones y reservas:
**292 ejecutadas, 280 correctas y 12 fallos preexistentes, sin omisiones**.
Los 11 de `customer-booking.test.mjs` rechazan el import `react-native` que ya
usa `booking.ts`; ninguno de esos archivos ha sido modificado en esta entrega.
El restante de `action-completion-integration.test.mjs:163` intenta extraer
una antigua declaración `listEntries` inexistente. Se reprodujo también contra
el `index.tsx` original de MAIN `c2f6c28`; no se cambia un fixture ajeno para
ocultar el resultado. TypeScript, diff check y exportación iOS SDK 58 correctos.

En Expo 8088: una/dos fichas y listas largas; texto ampliado; tres tamaños;
ambas manos; menú flotante y cierre arrastrables; propuestas y contacto;
ARCHIVO/ANTIGUAS y persistencia al reabrir. Las pruebas automatizadas de estilos
y geometría no equivalen a render ni interacción física en UIKit.
