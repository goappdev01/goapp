# GO Proyecciones · ampliación conservadora
Base de revisión: e281ea0b272a9ba2d3e440b8b666fbc3f5ef62f0.

## Integrado y compatible con el contrato financiero 1
- ADMIN → GO Proyecciones utiliza el mismo destino Roadmap / Plan financiero, el mismo componente y la misma sesión versionada. El acceso anterior permanece.
- Sin cambios en app/index.tsx, núcleo GO, órbitas, satélites, navegación global ni botones de clientes.
- La vista inicial mantiene las ocho columnas, estilos, importes, redondeos y CALCULAR. Las herramientas adicionales aparecen solamente al desplegar Actividad.
- País y Actividad permiten casillas independientes. Filas, aplicación múltiple y todos los totales utilizan exclusivamente la selección. Una selección vacía no calcula ni modifica datos.
- El catálogo incluye las cinco identidades originales y todas las actividades guardadas. Añadir, renombrar y desactivar/reactivar conserva identificadores y referencias. No hay borrado en cascada.
- Datos base editables independientemente de la selección: cantidad, unidad, año, fuente, fecha y verificación. Se exige confirmación para reemplazar un dato verificado. No se sobrescriben fuentes existentes.
- Limpiar selección no cambia el documento. Limpiar captación/cuota/simulación afecta solo a hipótesis seleccionadas del escenario REAL visible; conserva cantidades, fuentes, costes, otros escenarios y excepciones anuales ajenas al precio usado.
- Costes y beneficio es una vista opcional de hipótesis directas por cliente/mes, calculadas con calculateFinancialPlan. Un coste desconocido nunca se convierte en cero. No se presenta beneficio bruto como beneficio neto.
- Los costes actuales pertenecen a hipótesis por escenario; no se presentan como un catálogo permanente transversal que el servidor todavía no soporta.
- No se suman empresas y otras unidades en un total de cantidades engañoso.
- Ficha comercial go_proyecciones, privada de ADMIN, con información ES/EN y contratación desactivada. Soporte y las demás fichas permanecen.

## Preparado, sin activación ni persistencia ficticia
lib/api-zod/src/financial-projections.ts define contratos tipados para PRODUCTO, SERVICIO y SUSCRIPCION, precio de catálogo, coste directo y período mensual/anual, con hipótesis separadas por país y escenario. Su adaptador utiliza el motor financiero existente, nunca otro motor.

Estos perfiles NO se añaden al financialDocumentSchema 1 ni se envían a la API actual. Los controles operativos de creación actuales siguen registrando actividades mensuales GO; la interfaz explica ese límite.

El contrato SQL existente reconstruye actividades con id/name/unit/enabled; validate_document comprueba las claves raíz exactas y write_document normaliza las colecciones. Añadir campos solo al móvil o a Zod puede rechazarlos o perderlos al reconstruir el documento. La prueba PostgreSQL aislada demuestra el rechazo del catálogo extendido, sin cambiar la versión previa.

Para activar perfiles permanentes de productos/servicios y precios/costes de catálogo:
1. Revisar una ampliación aditiva del contrato relacional por plan y actividad, y de su serialización, revisión e importaciones.
2. Mantener lectura del documento 1 y conservar cada identidad, dato y versión. No introducir almacenamiento móvil alternativo.
3. Probar permisos, conflictos y vuelta de datos completos en PostgreSQL aislado y API.
4. Obtener autorización específica antes de aplicar cambios de esquema productivo; habilitar controles solo después de comprobar la capacidad real del servidor.
5. Mantener la futura empresa titular vinculada al plan autorizado. No abrir accesos empresariales hasta verificar aislamiento; no hay contratación, precios ni cobros activos.

No se ha ejecutado SQL, migración, RLS ni modificación de registros en producción. Las pruebas de base de datos crean PostgreSQL aislado con identidades y datos sintéticos. La persistencia productiva entre dispositivos y la visualización táctil deben comprobarse con una identidad autorizada en iPhone, sin confundirlas con la prueba aislada.

## Validación
Regresión de ingresos GO, catálogo dinámico, selección y limpieza, controles reales de interfaz, navegación e información comercial, importaciones, modelos, API y PostgreSQL aislado. Se ejecutan TypeScript, diff check y exportación iOS SDK 58. Los resultados exactos y el SHA se entregan tras publicación; esta nota no los anticipa.

Resultado previo a integración: 66/66 pruebas móviles y 34/34 pruebas de API/modelo/PostgreSQL aislado. TypeScript móvil y API correctos (API después de generar las declaraciones de su proyecto referenciado api-zod). Exportación iOS SDK 58 correcta. Sin nuevas dependencias ni cambios de lockfile.
