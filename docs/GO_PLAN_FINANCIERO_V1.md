# GO APP V1 — Plan Financiero y Proyecciones

Implementación en codex/agent-2-plan-financiero-v1, worktree 9998, sobre c2d02996b5bc7b5f44090431078fe70cc44b5570. No se crea commit ni se publica la rama en esta entrega. Los borradores previos de zona, voz y recordatorios se conservan.

## A. Estructura y ruta

Único acceso: Administrador → Roadmap → Plan Financiero y Proyecciones. Se añade una entrada opcional habilitada únicamente por GoAdminDashboard; por defecto GoRoadmapScreen no la ofrece. El árbol de módulos y sus estadísticas no se modifican. No se añade ruta de Expo Router, acceso de Landing u órbita.

La sección ofrece vista general, países, parámetros, ingresos, costes, proyección anual, totales, fuentes/monedas, importación e historial/permisos. Los campos editables se diferencian de las tablas calculadas. Las cifras se recalculan desde el mismo motor que usa la API.

## B. Tablas y relaciones

Esquema privado go_finance_private, 15 tablas:

| Tabla | Finalidad |
|---|---|
| plans | Propietario, título, moneda base, horizonte y versión. |
| plan_grants | Autorización expresa de lectura/edición por administrador y plan. |
| activities | Identidad y unidad de cada actividad/módulo comercial financiero. |
| countries | Catálogo del plan, código ISO y moneda de proyección. |
| sources | Organismo, URL, consulta, verificación y observaciones. |
| markets | Actividad/país/año, cantidad nullable, unidad y fuente. |
| scenarios | Exactamente los tres escenarios iniciales. |
| assumptions | Actividad/país/escenario, selección e hipótesis base. |
| year_parameters | Excepciones anuales vinculadas a una hipótesis. |
| revenues | Tarifas por hipótesis, modelo y año/base. |
| costs | Conceptos únicos, categoría y regla por hipótesis/año. |
| fx_rates | Moneda original/base/año, tipo, fecha y fuente. |
| versions | Snapshot de entradas, actor, motivo, acción y fecha. |
| import_previews | Carga preparada, actor, versión y caducidad. |
| imports | Aplicación/reversión enlazada a las versiones correspondientes. |

Las claves y FK conectan actividad → país → escenario → año. Los datos de mercado no se duplican por escenario. Los resultados se calculan; no existe una tabla de resultados persistidos. Los snapshots de historial contienen entradas necesarias para versionado y reversión.

## C. Escenarios

PESIMISTA — REAL — OPTIMISTA. No se renombran ni se rellenan porcentajes por defecto. Real significa hipótesis editable, no resultado observado. Cada país/actividad tiene parámetros y selección independientes por escenario. La comparación muestra los tres simultáneamente; un escenario sin selección se indica como tal, sin inventar un cero.

## D. Países y selección

Catálogo de 249 códigos ISO 3166-1 alpha-2; nombres localizados mediante Intl y metadatos de GO ya existentes. No se descargan directorios comerciales ni estadísticas. Hay casillas, búsqueda, filtros, seleccionar/deseleccionar todos y persistencia mediante Guardar versión y selecciones.

Seleccionar incorpora el país al plan; deseleccionar solo cambia selected. Conserva mercados, parámetros, tarifas, costes y excepciones anuales. Se pueden desactivar actividades sin borrar su configuración. Cada país tiene moneda editable; usar EUR como moneda de proyección no afirma que sea su moneda nacional.

## E. Fórmulas

Todos los cálculos se realizan por actividad/país/escenario/año, sin consultar servicios de IA.

- Mercado: dato del año o proyección del último dato anterior usando crecimiento explícito. También admite mercado hipotético del escenario, separado del hecho estadístico. Null nunca se sustituye por cero.
- Objetivo: mercado × porcentaje / 100. Los crecimientos anuales se encadenan; una excepción de porcentaje sustituye solo ese año. No se inventa crecimiento cero cuando falta.
- Permanencia mensual: (1 − bajas anuales / 100)^(1/12), salvo permanencia anual explícita. La cartera inicial se incorpora al año de inicio, no a años anteriores.
- Altas calculadas: objetivo menos cartera anterior retenida, ajustado por supervivencia de las cohortes mensuales. Las altas explícitas prevalecen. No se presumen bajas adicionales para forzar un objetivo menor; incoherencias con el mercado se señalan.
- Captación progresiva: doce cohortes y media mensualidad en el mes de alta. Existen hipótesis explícitas alternativas al inicio o al final. No se facturan automáticamente doce meses a cada nueva empresa.
- Mensual: empresas-mes × cuota. Anual: devengo proporcional cuota anual / 12. Pago único: altas × importe.
- Ingreso medio mensual por empresa: ingreso propio anual / meses-empresa facturables. Si no existe un denominador positivo o falta información, se muestra sin dato; no se divide por la cartera final como si todas las altas hubieran permanecido el año completo.
- Operaciones: empresas-mes × operaciones por empresa/mes. Volumen comercial: operaciones × importe medio. Comisión: volumen × porcentaje / 100. Precio por operación: operaciones × tarifa. El volumen comercial no se suma como ingreso propio.
- Costes: empresa-mes, bloques proporcionales de 100, porcentaje de ingreso propio, operaciones o importe fijo mensual/anual. El impuesto supuesto sobre margen se aplica al margen anual positivo; no es una regla fiscal de ningún país.
- Margen: ingreso propio − costes operativos.
- Resultado estimado sin inversión: margen − impuestos supuestos.
- Saldo estimado tras inversión: resultado − inversiones. Capex se mantiene separado del resultado económico; no se calcula automáticamente amortización, IVA, financiación ni tesorería real.
- Cada regla se aplica una vez. Se rechazan conceptos duplicados y tarifas repetidas del mismo modelo/año. Las excepciones anuales de tarifa sustituyen el modelo base equivalente; los costes anuales equivalentes sustituyen su concepto base.

Las cantidades proyectadas pueden ser fraccionarias; los recuentos observados de empresas/establecimientos deben ser enteros. El redondeo usa la precisión monetaria de la moneda, incluido JPY/KWD, y distribuye restos para conciliar meses con el total anual. La consolidación agrega esos mismos importes calculados, no fórmulas diferentes.

Se ofrecen totales de una actividad/país, actividad/todos sus países, país/todas las actividades y global GO; comparaciones por año, país y escenario. Actividad representa el módulo comercial financiero: no se crean o modifican módulos operativos del Roadmap. Las carteras agregadas no son clientes únicos si una empresa participa en varias actividades.

## F. Persistencia y versiones

El backend existente usa Supabase/PostgreSQL mediante RPC y JWT de la sesión. No se crea una base paralela de preferencias financieras ni se guardan cifras estratégicas en AsyncStorage. El borrador de edición es de memoria y debe guardarse expresamente; muestra cambios pendientes antes de salir.

Cada guardado tiene versión esperada. Si cambió, responde conflicto en vez de sobrescribir al otro editor. Se almacenan actor, motivo, acción, entradas y fecha. Las importaciones actualizan solo mercados/procedencia y nuevos metadatos de catálogo; no reescriben las tablas de hipótesis o tarifas.

El esquema se prueba en PostgreSQL embebido y está activado en el PostgreSQL local aislado de 8088, mediante el adaptador protegido documentado en development/go-finance-8088. Supabase/Railway y producción permanecen sin cambios. Si faltan sus RPC en otro entorno, la API devuelve FINANCE_SETUP_REQUIRED, sin fingir persistencia.

## G. Seguridad

Se reutiliza requireAdmin, con comprobación de usuario y membresía activa en el servidor. Solo el principal crea planes o concede/revoca accesos. Otros administradores necesitan una autorización específica por plan y nivel de lectura/edición.

La base revalida membresía y ACL dentro de la transacción. El bloqueo compartido de membresías coordina revocación con el sistema administrativo existente; el bloqueo por plan precede la comprobación de su ACL. Las tablas privadas tienen RLS activado y ningún acceso directo para clientes. Solo funciones internas con search_path fijo, comprobación de auth.uid y permisos restringidos se exponen mediante wrappers públicos SECURITY INVOKER.

No se confía en user_metadata, correo o campos enviados por el cliente. No se añaden claves al móvil ni se imprimen tokens. Respuestas no-store, limpieza de memoria al cambiar sesión y mensajes seguros. No hay publicación automática; copiar una exportación privada requiere acción explícita del administrador.

## H–I. Importación y segunda instrucción

JSON y CSV comparten el formato go-finance-market/1 y la misma validación autoritativa. Vista previa privada, errores por fila, duplicados, fuentes incompatibles, aceptar/cancelar, atomicidad, idempotencia, historial y reversión protegida.

El selector nativo conserva únicamente el descriptor temporal del archivo si la revalidación de Administrador desmonta la pantalla. Al volver comprueba acceso al plan y permiso de edición antes de preparar una sola vista previa. Una nueva sesión elimina la selección e invalida respuestas tardías. Nunca aplica la carga automáticamente ni guarda cifras en una segunda caché.

El contrato exacto, campos, reglas, endpoints y límites están en GO_PLAN_FINANCIERO_IMPORTACION_V1.md. Plantillas vacías en templates/go-finance-market-v1.json y .csv. No contienen cifras ni datos sintéticos de prueba.

La reversión conserva hipótesis posteriores; bloquea la operación si se modificaron después los mercados afectados. No elimina actividades/países de catálogo que puedan contener trabajo personal.

## J. Validación

Los tests usan exclusivamente registros marcados SYNTHETIC y dominios .invalid. PostgreSQL de pruebas es PGlite 0.5.12, fijado como dependencia de desarrollo; no se inicia ningún servicio compartido. Las pruebas HTTP usan un puerto efímero y RPC contra ese PostgreSQL aislado, no Supabase real.

Comandos desde la raíz para contratos/backend:

```text
node --max-old-space-size=3072 node_modules/typescript/bin/tsc --build lib/api-zod
node --max-old-space-size=2048 node_modules/typescript/bin/tsc -p artifacts/api-server/tsconfig.json --noEmit
node --max-old-space-size=3072 node_modules/typescript/bin/tsc -p artifacts/go-app-mobile/tsconfig.json --noEmit
```

Desde artifacts/api-server:

```text
node --test --test-concurrency=1 tests/financial-model.test.mjs tests/financial-db.test.mjs tests/financial-api.test.mjs tests/admin-access.test.mjs
```

Desde artifacts/go-app-mobile:

```text
node --test --test-concurrency=1 tests/financial-plan-ui.test.mjs tests/financial-import-client.test.mjs tests/admin-access.test.mjs
```

Resultado verificado el 28/10/2026: **82 pruebas aprobadas**: 35 backend, 30 cliente, 16 de los adaptadores locales y una con PostgreSQL/PostgREST locales reales. Se conservan las 50 pruebas financieras originales. Incluyen motor, persistencia relacional, aislamiento, permisos, guardados concurrentes, importación HTTP de más de 100 KB, carga sintética de 2000 mercados, reversión y retorno del selector nativo tras desmontaje/cambio de sesión.

Build de contratos, typecheck backend y **typecheck móvil ordinario aprobados**. En la ejecución anterior se detectó un enlace ausente de AsyncStorage y se utilizó una resolución temporal de sus tipos reales. La comprobación ordinaria actual pasa directamente con el tsconfig del proyecto, sin adaptación ni cambios a Metro.

Git diff --check y revisión de espacios en archivos nuevos aprobados. El árbol AST original de Roadmap permanece idéntico. Los hashes SHA-256 confirman que los **37 borradores previos siguen intactos**, incluido Landing. La verificación física de ergonomía y selector en iPhone no se ha realizado sobre este módulo nuevo.

## K. Pendientes y límites

- No se ha instalado SQL financiero en producción ni modificado servicios alojados. Su eventual activación requiere un procedimiento separado autorizado. El entorno local 8088 ya dispone del esquema.
- MAIN utiliza Expo 58; backend y bundle se validan directamente desde MAIN. Metro 8086 y los demás servidores ajenos permanecen intactos.
- Validar la interfaz y el flujo completo con iPhone y backend de integración; las pruebas React automatizadas no sustituyen esa comprobación.
- V1: horizonte inicial 5 años, ampliable hasta 50; 200 actividades, 249 países, 25000 mercados/fuentes por plan, 25000 filas/20 MB por archivo y 50000 proyecciones incluyendo arrastre de cartera. Los límites son explícitos; no se prometen cargas ilimitadas.
- Exportación JSON privada por portapapeles; no envío automático, publicación ni integración contable externa.
- Sin tasas de cambio, estadísticas empresariales ni porcentajes predeterminados. No se ha investigado ninguna cifra internacional.

## L. Preparación para Kai

financialKaiProposalSchema define propuestas versionadas con plan, versión esperada, operación, razón, documento propuesto y dos confirmaciones: REVISAR_PROPUESTA y CONFIRMAR_APLICACION. Las consultas existentes son privadas y paginadas; el motor puede explicar comparativas desde las mismas entradas.

No se incorpora otra IA ni se registra una herramienta que ejecute modificaciones autónomas. La integración futura debe usar el motor central de comprensión, vincular ambas confirmaciones al actor/plan/versión y hash del cambio y comprobarlo en servidor antes de llamar al guardado. El contrato no sustituye esa implementación futura de confirmaciones. Buscar fuentes o actualizar datos automáticamente no está habilitado.

## Archivos principales

- lib/api-zod/src/financial-plan.ts, financial-calculations.ts, financial-import.ts e index.ts.
- artifacts/api-server/src/routes/financial-plans.ts y registro en routes/index.ts.
- artifacts/api-server/supabase/drafts/financial_plans.sql (borrador, no migración aplicada).
- artifacts/api-server/package.json y pnpm-lock.yaml: dependencia de pruebas fijada; sin actualización de versiones de Expo.
- artifacts/go-app-mobile/components/financial/: pantalla, formularios, países, tablas y fuentes.
- artifacts/go-app-mobile/data/financialPlans.ts, financialImportFile.ts y financialFileHandoff.ts.
- GoAdminDashboard.tsx y GoRoadmapScreen.tsx: únicamente el acceso aprobado; árbol y órbitas intactos.
- Tests financieros de backend, SQL, motor, interfaz, cliente e importación. Ningún archivo de GO Peluquerías o GO Imprimir se modifica.

## Estado de entrega

Implementación recuperada del Agente 2 e integrada selectivamente en MAIN sobre f90fa60, sin incorporar borradores de voz, zona o recordatorios. Acceso aprobado mediante Administrador → Roadmap GO. Las pruebas y la activación local se documentan en development/go-finance-8088/README.md. No hay estadísticas empresariales reales, credenciales nuevas en cliente ni SQL aplicado a producción. La comprobación visual en iPhone se informa por separado y no se deduce del resultado automatizado.


## Reestructuración de uso en iPhone · 28/10/2026

La pantalla abre automáticamente los planes autorizados mediante la sesión vigente de GO. Los cambios de sesión, incluso para el mismo usuario, cancelan respuestas anteriores y revalidan el acceso sin otra contraseña ni un paso manual. Se eliminan los requisitos técnicos de motivo obligatorio e identificador manual de actividad; el motivo de auditoría sigue enviándose al backend y cada actividad conserva un identificador estable. El guardado utiliza la misma versión esperada y muestra una acción fija accesible junto al teclado. Un fallo de guardado conserva el borrador para reintentar.

La navegación principal contiene Resumen, Países, Actividades, Escenarios, Proyecciones e Importar datos. El resumen presenta indicadores y gráfico anual SVG, derivados del motor existente. No conecta años incompletos ni convierte datos desconocidos en cero. Proyecciones conserva ingresos, costes, consolidación, detalle y todas las tablas originales. Datos/fuentes, historial/permisos, ajustes y metodología pasan a un segundo nivel. Las importaciones y los cambios de acceso mantienen su confirmación explícita.

No se han modificado las fórmulas, contratos, SQL, rutas backend, permisos administrativos, Landing, Administrador general ni Roadmap en esta corrección. No se han instalado dependencias, cargado estadísticas reales ni tocado servicios alojados.

Validación de esta corrección: 37 pruebas móviles (15 de interfaz/recorrido y gráficos, 10 de cliente/importación, 7 de permisos y 5 de Administrador) y 35 de motor, API, SQL y permisos backend. Incluyen un recorrido sintético de creación, actividad, país, hipótesis, tarifa, costes, guardado, reapertura y vista previa de importación sin aplicarla. Las pruebas SQL usan PostgreSQL embebido aislado. Typecheck móvil ordinario y bundle iOS de Metro 8088 con Expo 58 correctos. Ocho archivos protegidos del motor, SQL, backend y navegación conservan su SHA-256.

Revisión visual adicional de los componentes reales en un marco de 390 × 844 mediante react-native-web, con datos exclusivamente sintéticos y API simulada sin acceso a servicios. Se han comprobado navegación, selección de países, botón fijo de guardado, indicadores, gráfico y estado vacío. Esta revisión no sustituye el teclado, la sesión, la persistencia y la ergonomía en el iPhone físico; la confirmación del propietario se registra por separado.


## Presentación comercial blanca · 28/10/2026

Cambio exclusivamente visual: superficies blancas, fondos gris suave, textos oscuros y selección neutra; gráficos azul, bronce y violeta con contraste sobre blanco. Los seis destinos se distribuyen en dos columnas, con nombres completos y una línea por acceso. La cabecera compacta «Finanzas» y el estilo claro de la zona segura se aplican únicamente al nodo financiero; al salir se conserva la cabecera original de Administrador. Los formularios, tablas y pantallas secundarias reutilizan el mismo estilo.

Validación proporcionada: 21 pruebas de interfaz y navegación, typecheck móvil y revisión de los componentes reales mediante react-native-web a 320 y 390 píxeles, con datos sintéticos aislados. Los seis nombres caben en una línea sin desbordamiento. No se repite la suite extensa del motor: nueve archivos protegidos de cálculo, backend, SQL, datos/permisos, Roadmap y versiones de Expo conservan sus hashes. No hay cambios funcionales ni datos cargados. La comprobación física del nuevo estilo en el iPhone se distingue de esta revisión de tamaños.


## Pantalla vigente: calculadora de ingresos GO · 28/10/2026

La ruta existente abre ahora una única tabla titulada «Proyección de ingresos GO»: país, actividad, empresas existentes, captación editable, cuota mensual hipotética EUR editable, empresas captadas, ingreso mensual e ingreso anual. No muestra planes, escenarios, importaciones, fuentes, ajustes, gráficos ni formularios secundarios. País y actividad permiten acotar la misma tabla; los totales por país, actividad y GO permanecen en esta pantalla. El guardado de las dos entradas es automático, serializado y con versión esperada. Un fallo deja el borrador pendiente y no se anuncia como guardado.

Se reutilizan las veinte referencias de país y las cinco actividades solicitadas. Los 58 registros ya importados se leen del mismo documento privado; no se vuelven a importar ni se codifican sus cantidades en el cliente. Uñas y Encargos supermercado permanecen sin cifras cuando no hay datos. No se inventan mercados, porcentajes, cuotas o conversiones. El escenario REAL se utiliza internamente; los otros escenarios y sus valores permanecen sin cambios y sin selector visible.

La vista aplica al motor existente una cartera completa de doce meses: captadas = mercado × captación / 100; mensual = captadas × cuota; anual = mensual × 12. No representa captación progresiva ni beneficios. La normalización es transitoria: no sobrescribe crecimiento, bajas, costes, fuentes ni excepciones anuales del documento guardado. Los resultados no se almacenan como otra fuente de datos. Los precios en otra moneda solo se presentan en EUR si existe una conversión documentada; los datos actuales del entorno están configurados en EUR.

FinancialAdvancedScreen conserva la implementación anterior internamente, sin ruta ni acceso desde la calculadora. El importador, sus contratos, historial y protecciones de backend/PostgreSQL permanecen disponibles internamente para futuras cargas autorizadas. No se ejecutan migraciones ni llamadas a proveedores de IA.

Validación: 11 pruebas nuevas de cálculo, desconocidos/cero, totales, independencia de escenarios y cola de guardado; 31 regresiones existentes de permisos, cliente, importador y programación interna. Caso sintético obligatorio: 100000 empresas, 1 %, EUR10 = 1000 captadas, EUR10000 mensuales y EUR120000 anuales. Typecheck móvil y bundle iOS de Expo 58 / Metro 8088 correctos. La prueba visual aislada utiliza exclusivamente datos SYNTHETIC y demuestra el recálculo inmediato al escribir. No sustituye la comprobación física del teclado y el desplazamiento en iPhone.

La comprobación de solo lectura contra el documento local guardado confirma 100 filas de presentación (20 × 5), 58 cantidades recuperadas y 42 mercados ausentes. Las 20 cifras de Peluquerías ya estaban marcadas CONFLICTO: se muestran como «En revisión» y se excluyen del cálculo, conservando el bloqueo de calidad anterior. Las primeras tres columnas caben completas en el ancho inicial del iPhone; el resto utiliza desplazamiento horizontal. Ninguna cantidad de mercado se ha modificado durante esta tarea.


## Corrección de cálculo y presentación sobre Notas Unificadas · 28/10/2026

Se conservan los ocho borradores originales en una copia externa con SHA-256 y parche. MAIN avanza de 5183dae a 715e672 por fast-forward; los 21 archivos de Notas se mantienen sin modificaciones adicionales.

CALCULAR, en verde, vuelve a evaluar las entradas actuales, conserva el recálculo automático y solicita guardar los cambios por la cola existente. Cada fila se calcula independientemente: una actividad sin datos o con una entrada inválida no bloquea las demás. Las cantidades conocidas marcadas CONFLICTO se pueden utilizar como hipótesis numérica en esta calculadora, manteniendo «En revisión» y la marca original; no se convierten en estadísticas verificadas ni se cambian los datos de mercado. Los mercados ausentes continúan como «Sin dato», incluidos los totales parciales. El motor compartido y las protecciones backend permanecen intactos.

Se elimina la línea superior Guardado. Las columnas ajustan anchuras al ancho real, mantienen números grandes y usan desplazamiento horizontal. La capacidad de orientación de la aplicación pasa a default; el Stack mantiene portrait para todas las pantallas. Solo mientras Finanzas está montada solicita orientation=all y su modal admite ambos horizontales. Al salir, cerrar el modal o perder acceso, se restaura portrait. Se reutilizan Expo Router y react-native-screens incluidos en Expo 58; no se añaden dependencias nativas.

Se retira Cambiar contexto de las cabeceras de Administrador y Empresa. La misma acción, callback y control de propietario se mantienen dentro del contenido de Configuración de GO Empresa, tanto al seleccionar actividad como en los pasos. El acceso de Perfil y el selector existente no se modifican.

Validación proporcionada: 38 pruebas de cálculo, botón, guardado, aislamiento, permisos, contexto, cierre del modal y ciclo de orientación. Typecheck móvil e integración iOS sobre MAIN actualizado. Revisión visual aislada con datos sintéticos en 390×844 y 844×390, incluido el caso 100000 × 1 % × EUR10 = EUR10000 mensuales / EUR120000 anuales. La revisión de tamaños no equivale a una prueba de giro físico; esa comprobación final corresponde al propietario en su iPhone.

Referencias técnicas: [orientación por pantalla en Expo Router](https://docs.expo.dev/versions/latest/sdk/screen-orientation/#per-screen-orientation-with-expo-router) y [orientaciones admitidas por Modal](https://reactnative.dev/docs/modal#supportedorientations).


## Importes compactos y totales verdes · 28/10/2026

La calculadora muestra euros enteros mediante redondeo exclusivamente visual: las entradas, cálculos y valores guardados conservan los céntimos. Las columnas Ingresos/mes (€) e Ingresos/año (€) se estrechan y los importes mantienen el símbolo en la misma línea. Los resultados y totales se destacan en verde. Se retira el contador técnico de combinaciones y las etiquetas parcial; cuando faltan entradas, el encabezado dice Total calculado en vez de presentar el subtotal como un total general completo. Los campos desconocidos siguen mostrando Sin dato. Se verifican los importes de las capturas con datos sintéticos, 16 pruebas pertinentes, typecheck móvil y revisión visual a tamaño de iPhone; no se modifica el motor ni la persistencia.

## Empresas enteras y aplicación conjunta por países · 28/10/2026

La calculadora redondea las empresas captadas al entero más próximo, con 0,5 hacia arriba, antes de calcular facturación. El adaptador entrega esa cantidad al motor existente; no cambia las estadísticas originales, fórmulas compartidas, permisos ni backend. Casos sintéticos: 46086 × 5 % → 2304 empresas; con EUR29 → EUR66816/mes y EUR801792/año; con EUR30 → EUR69120/mes; al pasar al 6 % → 2765 empresas y EUR82950/mes. Los datos desconocidos permanecen como Sin dato.

La edición conserva el texto mientras el campo está enfocado y recoge el texto final nativo. CALCULAR recoge las últimas entradas y reutiliza la cola de guardado versionada, que protege ediciones realizadas durante una petición anterior. Las columnas de captación y cuota se compactan y amplían según su contenido; los bordes editables ganan contraste y CALCULAR se alinea con los selectores en horizontal.

El selector de países permite uno, varios, todos o ninguno, en la misma pantalla. Con varios seleccionados aparecen captación y cuota conjuntas con una única acción Aplicar a seleccionados. Un campo vacío conserva el parámetro; cero sigue siendo un valor válido. Se aplica solo a los países elegidos y a la actividad filtrada, o a las cinco actividades si no hay filtro. La acción es una sola modificación persistida y no altera países ajenos, mercados, costes ni escenarios internos distintos de REAL.

Validación: 23 pruebas de cálculo, redondeo, edición, guardado y reapertura, guardados en curso, permisos, aislamiento, selección múltiple, aplicación conjunta atómica y presentación; typecheck móvil y git diff --check. Revisión visual aislada con datos sintéticos en 390×844 y 844×390 y bundle iOS actualizado HTTP 200 desde Metro 8088 / Expo 58. La comprobación física final de giro, teclado y uso en iPhone corresponde al propietario.
