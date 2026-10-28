# Plan Financiero en el entorno local 8088

Se reutilizan el backend de GO, el PostgreSQL aislado existente en 127.0.0.1:65439 y el puente habitual de identidad 65441. No existe un backend financiero paralelo. Ningún archivo de este directorio se ejecuta automáticamente al publicar MAIN.

## Autorización

identity-bridge.patch añade un ámbito firmado go_finance_scope=OWNER exclusivamente a los doce RPC públicos finance_* permitidos, con POST y sin query string. Antes de firmar, el puente verifica la identidad real y la autorización actual del propietario mediante el proveedor ya existente. La sesión local dura como máximo 60 segundos y no se devuelve al cliente. Los datos reales de Supabase no se utilizan como almacenamiento de prueba.

La vista local admin_memberships conserva el ámbito anterior de Tableros y solo presenta nivel owner ante el nuevo ámbito financiero firmado. No se crean membresías persistentes ni se sustituyen los permisos reales por etiquetas locales. Los demás usuarios siguen denegados por el proveedor existente. La delegación entre administradores se prueba en el esquema relacional normal; este puente de desarrollo continúa limitado al propietario verificado al que ya estaba vinculado.

provider.patch conserva el límite de 200 KB de rutas generales y 2 MB de Tableros. Solo los doce RPC financieros admiten hasta 20 MB.

## Instalación local protegida

prepare-local-install.cjs genera una única transacción. Se niega a ejecutarse fuera de la base go_peluquerias_github_20261023, host 127.0.0.1 y puerto 65439, o si el esquema financiero ya existe. Conserva y comprueba la vista administrativa de Tableros. Crea el rol service_role sin LOGIN solo si no existe, para resolver los REVOKE del esquema normal; no le concede acceso financiero.

PostgreSQL no permite FK hacia una vista. Por eso el instalador de desarrollo omite únicamente las dos FK hacia admin_memberships, que aquí es una vista por petición. Las funciones conservan sus comprobaciones de membresía y ACL en cada operación, y las demás claves relacionales permanecen. El SQL normal de artifacts/api-server/supabase/drafts/financial_plans.sql mantiene ambas FK para la tabla real. No aplicar el adaptador de desarrollo a Supabase alojado ni a producción.

El esquema fue instalado vacío tras superar una prueba transaccional revertida: quince tablas, cero planes y cero datos de mercado. No se cargaron cifras empresariales reales ni fixtures persistentes. Los conflictos de versión utilizan PT409, igual que otros módulos de GO, para responder HTTP 409 sin reintentos de serialización de PostgREST.

## Verificación

- 65 pruebas del módulo y de Administrador, ejecutadas directamente en MAIN con Expo 58.
- 16 pruebas de los adaptadores: permisos, renovación de comprobación, ámbitos por ruta y límites de tamaño. La identidad ascendente se simula; no llaman a Supabase.
- Una prueba con PostgreSQL/PostgREST locales reales: persistencia de un plan sintético de más de 200 KB, guardado, lectura, historial, conflicto inmediato y denegación tras revocación simulada. El plan sintético y sus versiones se eliminan con una guarda estricta al terminar.
- Build de librerías, typechecks, compilación backend y exportación iOS de MAIN correctos.

Para las pruebas locales, GO_FINANCE_DEV_FIXTURE debe apuntar al directorio del adaptador existente y GO_FINANCE_DEV_PSQL al psql portable ya instalado. No introducir ni publicar secretos. Sin esas rutas, los verificadores se omiten explícitamente; las pruebas financieras ordinarias no dependen de ese entorno privado.

## Runtime y protección

La sesión final sirve MAIN desde su propio directorio, con Expo 58 y dependencias propias. Se conserva el host 100.105.48.111:8088, la URL de API /api y el slug de Expo existente para conservar la sesión y el almacenamiento del dispositivo. La carga del nuevo root requiere una única recarga controlada de Metro. No se utiliza 8086 ni se modifica el botón azul de Expo Go.

El preload privado ofrece /_go/main-version exclusivamente en este servidor de desarrollo para verificar el SHA y contar entregas iOS terminadas a clientes remotos, sin registrar audio, transcripciones, tokens ni direcciones personales. Esa evidencia no sustituye la confirmación visual del propietario en el iPhone. El error RCTEventEmitter.receiveEvent() no se considera corregido sin reproducirlo.

Los originales privados y metadatos de procesos se preservan fuera del repositorio. No se almacenan claves, configuraciones privadas o node_modules en MAIN. Los respaldos previos de dependencias y worktrees ajenos permanecen conservados.
