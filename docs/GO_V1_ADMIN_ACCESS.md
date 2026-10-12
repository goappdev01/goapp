# GO V1 — acceso administrativo individual

## Autoridad vigente

ADMIN es una autorización independiente de la clasificación Usuario/Empresa. La autoridad es la membresía activa de public.admin_memberships para el UUID validado en Supabase Auth. profiles.role continúa clasificando cuentas; correo, user_metadata, AsyncStorage y contexto visual nunca conceden ADMIN.

El backend comprueba la identidad y la membresía actual en cada petición protegida, sin caché de permisos. Propietario recibe los permisos reservados; un técnico solo los permisos expresamente concedidos y no puede gestionar/revocar al propietario. Las operaciones de membresías y auditoría exigen permiso reservado y las RPC vuelven a comprobar al propietario dentro de la transacción.

La bienvenida pública conserva Empresa | Usuario. El acceso privado y GoAdminDashboard reutilizan los componentes existentes después del login y de la autorización real. El selector visual no cambia identidad ni permisos. EMPRESA DEMO utiliza almacenamiento local aislado por UUID y empresa; no concede verificación empresarial ni escribe negocios reales.

La revocación se comprueba al siguiente acceso protegido, cambios de sesión y retorno a primer plano. Un fallo de red deniega operaciones; no transforma una etiqueta o un dato local en permiso del servidor.

## SQL y herramientas

El SQL de membresías, las pruebas aisladas y el procedimiento de activación por UUID se conservan en artifacts/api-server/supabase/drafts. No reaplicar ni ejecutar bootstrap automáticamente: cada intervención real necesita verificar el esquema, la identidad y una autorización específica.

Los módulos internos existentes se conservan. Los prototipos locales no constituyen nuevas APIs remotas; cada operación privilegiada futura debe tener autorización propia en servidor. No incorporar secretos al bundle móvil.

## Consolidación

La fase A del 12/10/2026 prueba el candidato local con proveedores simulados y no modifica usuarios, permisos, Supabase o Railway. El estado real de la base no se deduce del nombre de esta carpeta draft. Véase GO_V1_CONSOLIDACION_2026-10-12.md para resultados, fuentes inactivas y validación física pendiente.
