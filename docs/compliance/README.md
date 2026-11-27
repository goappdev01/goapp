# GO: revisión transversal de privacidad, IA y control humano

Versión **2026-11-27.1** · fuentes contrastadas **27/11/2026** · base
`origin/main f8a7b66ef2a9501515e096ad2464a4e3b462ea63`.

**No es auditoría jurídica ni declaración de cumplimiento integral.** Inventario
del código y documentación de MAIN: no se han inspeccionado cuentas, conversaciones
o datos reales ni se han alterado backend, base de datos, roles, proveedores o
infraestructura. El checkpoint GO IA `c6141e1` permanece en su rama independiente;
sus capacidades pendientes no se consideran publicadas ni activadas.

## Entregables y alcance

- [Matriz legible por módulo](MATRIX.md) y [registro versionado](modules.v1.json).
- [Fuentes oficiales y estados de requisitos](sources.v1.json).
- [Plantilla legal y técnica](module-review-template.md) para altas y cambios.
- `lib/api-zod/src/privacy-controls.ts`: controles puros reutilizables, sin red,
  almacenamiento, nuevos permisos ni ejecutores.
- Proyección aplicada al archivo de catálogo elegido; se conserva el payload explícito ya correcto de AYUDA;
  contextos de reservas/tareas validados antes de intentar el transporte.
- Aviso de IA/procesado visible en el asistente publicado, dentro del scroll
  existente. Se conserva el aviso y consentimiento propios de la IA central.
- Pruebas y entrada de CI sin inferencias, credenciales o conexiones reales.

La matriz incluye los módulos encontrados, sus datos, destinatarios, controles y
pendientes. No es un RAT del responsable validado. Las bases jurídicas se dejan
**pendientes de validación por finalidad**; no se asigna consentimiento global ni
se adopta unilateralmente interés legítimo/contrato para todos los módulos.

## Normativa y calendario contrastados

El [RGPD](https://eur-lex.europa.eu/eli/reg/2016/679/oj) exige justificar finalidad,
base, minimización, seguridad, información y derechos. EIPD y art. 22 dependen
del tratamiento y sus efectos; no se aplican a toda automatización sin análisis.
Las transferencias y contratos con encargados requieren revisión específica.
Conservación: fijar criterios por categoría y obligación, no un plazo universal.
No se han ejecutado borrados ni ampliado retención.

La [LOPDGDD](https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673) complementa
esas garantías. Su art. 7 regula el consentimiento de menores y representación;
no establece por sí solo una edad mínima universal para todos los usos de GO.
La capacidad contractual y otras bases requieren valoración separada.

El calendario de IA **ya no se toma de la redacción original sin cambios**:
se contrastaron [texto consolidado](https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng),
[Reglamento modificador 2026/1744 publicado](https://eur-lex.europa.eu/eli/reg/2026/1744/oj)
y [calendario de la Comisión](https://ai-act-service-desk.ec.europa.eu/en/ai-act/timeline/timeline-implementation-eu-ai-act).

| Estado al 27/11/2026 | Materia | Aplicación / cautela |
| --- | --- | --- |
| Vigente | Ámbito, alfabetización y prohibiciones aplicables | Arts. 2–5; finalidad y rol, no solo nombre del modelo |
| Vigente, cuando corresponda | Transparencia de interacción/contenido | Art. 50 desde 02/08/2026, con sus supuestos y excepciones |
| Futura | Nuevas previsiones art. 5 y transición art. 111.4 respecto del 50.2 | 02/12/2026; no aplaza globalmente el art. 50.1 |
| Futura, si hay alto riesgo | Capítulo III secciones 1–3, art. 6.2/anexo III | 02/12/2027, excepción art. 6.5 |
| Futura, si hay alto riesgo | Capítulo III secciones 1–3, art. 6.1/anexo I | 02/08/2028, excepción art. 6.5 |
| Pendiente de valoración | Clasificación y obligaciones concretas de GO | Uso previsto, rol, población y efectos; no clasificar todo como alto riesgo |

Las citas consolidadas son instrumentos de consulta; para decisiones jurídicas
debe comprobarse el acto oficial y modificaciones aplicables. No se certifica
que toda normativa sectorial o modificación posterior esté cubierta.

## Qué es guía y qué es obligación

El [decálogo AEPD de asistentes y agentes](https://www.aepd.es/guias/decalogo-usuarios-asistentes-agentes-ia.pdf)
orienta a personas usuarias: ayuda a seleccionar controles, pero no convierte
cada recomendación en prohibición legal general. Igual cautela para sus
[orientaciones de IA agéntica](https://www.aepd.es/guias/orientaciones-ia-agentica.pdf)
y la [política interna de IAG de la AEPD](https://www.aepd.es/guias/sumario-recomendaciones-iag-aepd.pdf).
La política de una administración no se traslada automáticamente a GO.

Las directrices EDPB de [consentimiento](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf),
[diseño y defecto](https://www.edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_201904_dataprotection_by_design_and_by_default_v2.0_en.pdf)
y [decisiones automatizadas](https://www.edpb.europa.eu/documents/guideline/automated-decision-making-and-profiling_en)
son interpretación oficial relevante; identificar el artículo vinculante que
apoyan, sin tratarlas como un nuevo reglamento independiente.

La [lista AEPD del art. 35.4](https://www.aepd.es/sites/default/files/2019-09/listas-dpia-es-35-4.pdf)
tiene una función específica prevista en RGPD. Debe entrar en el análisis de EIPD:
no se descarta por llevar lenguaje orientativo ni se reduce a contar criterios
automáticamente. La decisión motivada queda pendiente por tratamiento.

En España se añaden, según ámbito, [LSSI](https://www.boe.es/eli/es/l/2002/07/11/34/con)
(información, comunicaciones comerciales, almacenamiento/acceso y excepciones
técnicas), [Ley 11/2023](https://www.boe.es/buscar/act.php?id=BOE-A-2023-11022)
(accesibilidad de servicios cubiertos, desde 28/06/2025; revisar exenciones, como
microempresas prestadoras de servicios) y [Ley 4/2026](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20528&lang=es)
(no discriminación/accesibilidad según sus modificaciones). No se presume una
exención sin comprobar hechos. El [dictamen de un proyecto español de IA](https://www.boe.es/buscar/doc.php?id=CE-D-2026-518&lang=es)
no acredita una ley aprobada: su estado exige seguimiento jurídico; no se ha
usado como obligación vigente. Trabajo, salud, consumidores u otros sectores
se revisan antes de habilitar sus usos concretos.

## Controles técnicos y límites de lo implementado

`projectAllowedFields` empieza sin campos, copia solo datos propios elegidos,
rechaza estructuras ejecutables/getters y nombres evidentes de secretos. No
anonimiza texto, imágenes o documentos. El consentimiento a enviar un archivo
no hace lícito cualquier dato de terceros que contenga.

`evaluateDisclosure` y `evaluateHumanControl` están disponibles para futuros
adaptadores revisados. **No sustituyen JWT, RLS, permisos, consentimiento o
confirmaciones existentes ni están conectados como interruptor global.** Solo
aceptan hechos suministrados por controles de confianza; no se debe dejar al
modelo elegir su base jurídica o declararse autorizado. La vulnerabilidad conocida
requiere garantías revisadas; no se infiere de texto ni se recoge edad adicional.
La audiencia desconocida se señala para revisión, sin presumir edad adulta.

La confirmación debe corresponder a los datos exactos y quedar invalidada si
cambian. Parar una operación antes del compromiso es distinto de revertir una
reserva ya guardada: se reutilizan comprobación, idempotencia y cancelación
reales. No se añade un segundo motor de confirmación ni una fábrica autónoma.

`minimalComplianceEvent` permite proyectar códigos de módulo/resultado/motivo.
No crea un registro duradero, telemetría ni transmisión de coordenadas/IDs.
Los registros auditable existentes siguen bajo sus propios permisos y plazos;
su suficiencia no queda acreditada por esta utilidad.

## Decisiones y cambios pendientes de aprobación

1. Identificar responsable, encargados y finalidades; aprobar bases concretas,
   información y canal efectivo de derechos, contratos, transferencias y RAT.
2. Resolver EIPD/consulta previa y roles/clasificación IA con evidencia de cada uso.
   Incluir alfabetización del personal y políticas operativas proporcionadas.
3. Decidir población de uso, representación y medidas de menores/vulnerabilidad;
   no hay una verificación de edad transversal acreditada en los archivos revisados.
4. Fijar conservación/eliminación y registros por categoría. Borrados masivos,
   migraciones, cambios RLS o ampliaciones de auditoría requieren aprobación.
5. Completar avisos y controles de transmisión en todos los puntos de entrada
   (por ejemplo, notas preparadas y voz), y revisar geocodificación/meteorología.
6. Revisar diagnósticos históricos que puedan incluir IDs, fechas u otro contenido
   personal; no se ha hecho una depuración global de logs ni cambios backend.
7. Validar accesibilidad y supervisión efectiva con personas y dispositivo;
   no habilitar decisiones de salud, empleo o solvencia por esta tarjeta.

Estas decisiones se solicitan en una revisión específica **antes de ejecutarlas**;
no se toman por silencio ni se activan otras tarjetas. El resto de funcionalidades
conserva sus controles vigentes. La matriz registra pendientes sin convertirlos
en un bloqueo automático por recomendación.

## Desarrollo, CI y evidencia

Node 24; sin instalación de dependencias para la nueva verificación:

```sh
node scripts/check-go-compliance.mjs
node --experimental-strip-types --experimental-vm-modules --test scripts/tests/go-compliance.test.mjs
```

También `npm run test:compliance`. Las pruebas usan la implementación real de
las fronteras seleccionadas y del middleware ADMIN con transportes adaptados:
sin inferencias, usuarios alojados, datos reales ni llamadas de escritura.
Prueban campos, roles, aislamiento, consentimiento aplicable, control humano,
parada y contenido adversario; no demuestran inmunidad general a prompt injection.

CI corre para PR relevantes o ejecución manual, cinco minutos máximo, permisos
de lectura y acciones oficiales fijadas por SHA; sin secretos, instalaciones del
workspace, despliegues ni disparador de push. La prueba local no acredita por sí
sola que GitHub Actions haya ejecutado un job remoto. No se configura facturación.
El inventario exige referencia de rutas nuevas, permitiendo valoración jurídica
pendiente: verifica documentación y pruebas técnicas, no dicta cumplimiento legal.

La evidencia de TypeScript, regresiones, publicación y servido se registra en
[VALIDATION.md](VALIDATION.md). La prueba física en iPhone sigue siendo distinta.
