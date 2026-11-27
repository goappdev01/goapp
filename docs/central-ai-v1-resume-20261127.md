# GO IA V1 — reanudación del checkpoint

Fecha: 27/11/2026. Origen: checkpoint `c6141e1`, conservado intacto en su
worktree original; integrado en una rama aislada con MAIN `8b20f783`.
El aviso permanente, ES/EN y los controles de privacidad recientes se conservan.

## Cuenta y controles comprobados

Sesión oficial abierta personalmente por el propietario:

- Organización **Personal**, `org-O5FgnmDI55kU0wteTEoCF4CR`.
- Proyecto existente **GO V1**, `proj_4rM3mNOJxtMtjYi90pqjxYUZ`, residencia Global.
- Saldo visible: **5,00 USD**; gasto visible de GO V1: **0,00 USD**.
- Recarga automática **OFF**. Ninguna compra, vinculación de beneficio Business,
  nueva organización, nueva cuenta ni nueva clave OpenAI en esta intervención.
- Cuenta de servicio existente **GO-V1-API**, activa. Restringida a Responses
  Write (incluye permisos asociados de lectura); demás capacidades deshabilitadas.
  El conector Railway acredita `OPENAI_API_KEY` presente, pero oculta su valor:
  no se afirma haber comparado su contenido ni se reemplaza.
- Solo `gpt-5.4-mini` permitido en el proyecto; resto, incluidos modelos futuros,
  bloqueados. 40.000 TPM, 8 RPM y 1 IPM. La ruta de conversación admite solo texto.
- Límite mensual **4 USD**, **Enforce a hard limit ON**, alertas 50/80/100 %.
  El proveedor avisa que su bloqueo puede retrasarse; no sustituye el límite de GO.
- Tarifa estándar reconfirmada: 0,75 USD/millón entrada, 4,50 USD/millón salida.
  Sin modelos alternativos, herramientas facturables del proveedor ni audio API.

El servidor vincula explícitamente cada solicitud al proyecto y organización
verificados mediante las cabeceras oficiales. Si falta esa configuración, falla
cerrado. No se aceptan valores de proyecto/modelo enviados por el móvil.

## Presupuesto duradero

Aplicada al proyecto Supabase existente `goapp` la migración aditiva
`go_central_ai_test_budget_v1`, procedente del checkpoint y probada localmente.
No cambia tablas ni datos empresariales existentes.

Tres tablas privadas con RLS y sin acceso directo de `anon`/`authenticated`.
Límite acumulado de 4.000.000 microUSD, margen mínimo de 100.000 microUSD,
reserva atómica de 200.000 microUSD por turno, conciliación de uso conocido y
conservación íntegra de la reserva en fallos inciertos. Sin reinicio mensual.

El RPC comprueba JWT, membresía ADMIN vigente, cuenta autorizada y capacidad
secreta del servidor antes de operar. No usa service_role ni suplanta clientes.
El asesor de seguridad señala deliberadamente RLS sin políticas en las tablas
privadas (denegación total) y SECURITY DEFINER autenticado en el RPC. Este último
es la frontera revisada: search_path vacío, sin SQL dinámico, secreto y titularidad
obligatorios; no se habilita acceso general a las tablas ni se suprimen avisos.

Al aplicar la migración se verificó: deshabilitada, gasto cero, sin secreto y sin
cuentas/establecimientos habilitados. La activación depende de configurar la
capacidad interna y la cuenta ADMIN existente; no se publica su valor.

## Reservas: decisión expresa del propietario

**No crear cuentas ficticias ni realizar reservas.** El propietario registrará
su establecimiento y hará personalmente la primera prueba desde GO.

`GO_CENTRAL_AI_BOOKINGS_ENABLED` es un interruptor independiente, por defecto
desactivado. Con él apagado no se envían herramientas al modelo, no se accede
al catálogo desde estas herramientas, no se restaura una propuesta para confirmar
y se rechaza `/proposal/confirm`, incluso con empresas previamente autorizadas.
La lista de establecimientos habilitados permanece vacía.

Identificar y autorizar un establecimiento concreto es un paso posterior; registrar
uno por sí solo no lo incorpora a la lista autorizada ni activa herramientas.
Los flujos existentes de reservas fuera de GO IA no cambian.

## Evidencia y límites

Pruebas locales: 9 de servidor (PostgreSQL local, concurrencia/presupuesto,
RPC/roles, Responses adaptado, interruptor de reservas, idempotencia y confirmación),
46 móviles (conversación, privacidad, aviso permanente, propuestas, voz y flotantes),
17 de privacidad transversal. TypeScript móvil completo y dirigido de rutas del
servidor; `git diff --check`. Sin nuevas instalaciones.

Estas pruebas usan adaptadores locales, no acreditan una inferencia de OpenAI ni
una reserva real. En esta reanudación no se han enviado mensajes a un modelo de
pago, creado cuentas GO ni reservas. La conversación desde iPhone y la validación
de una futura reserva quedan a cargo del propietario. No se afirma retención cero.

La fábrica, PC1, la copia congelada 8089 y Tailscale no se modifican.

## Referencias oficiales consultadas

- [Modelo, tarifa y capacidades](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
- [Proyectos, límites y retraso de aplicación](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform).
- [Autenticación y cabeceras de proyecto/organización](https://developers.openai.com/api/reference/overview#authentication).
- [Asesor SECURITY DEFINER](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable).

Los detalles históricos de diseño y pruebas siguen en
`central-ai-v1-activation-checkpoint.md`; su estado operativo histórico no describe
por sí solo la reanudación documentada aquí.
