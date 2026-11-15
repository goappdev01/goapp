-- Draft rollback for the additive finance migration only. Never run automatically.
-- Safe only while all newly created finance tables remain empty. A populated
-- installation needs a separate, verified data recovery plan.
BEGIN;
DO $finance_rollback_guard$
DECLARE item record; has_data boolean;
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres'
     OR pg_get_userbyid((SELECT nspowner FROM pg_namespace WHERE nspname='go_finance_private')) <> 'postgres' THEN
    RAISE EXCEPTION 'FINANCE_ROLLBACK_WRONG_TARGET_OR_OWNER';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='go_finance_private' AND c.relkind='r') <> 15
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='go_finance_private') <> 19
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'finance_%') <> 12 THEN
    RAISE EXCEPTION 'FINANCE_ROLLBACK_OBJECT_INVENTORY_CHANGED';
  END IF;
  FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='go_finance_private' AND c.relkind='r'
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM go_finance_private.%I)', item.relname) INTO has_data;
    IF has_data THEN RAISE EXCEPTION 'FINANCE_ROLLBACK_DATA_PRESENT: %', item.relname; END IF;
  END LOOP;
END
$finance_rollback_guard$;

-- RESTRICT protects functions added by others that depend on these wrappers.
DROP FUNCTION public.finance_access() RESTRICT;
DROP FUNCTION public.finance_get_plan(uuid) RESTRICT;
DROP FUNCTION public.finance_create_plan(jsonb) RESTRICT;
DROP FUNCTION public.finance_save_plan(uuid,integer,jsonb,text) RESTRICT;
DROP FUNCTION public.finance_history(uuid) RESTRICT;
DROP FUNCTION public.finance_grant(uuid,integer,uuid,boolean,boolean,text) RESTRICT;
DROP FUNCTION public.finance_prepare_import(uuid,integer,jsonb,jsonb) RESTRICT;
DROP FUNCTION public.finance_apply_import(uuid,uuid) RESTRICT;
DROP FUNCTION public.finance_cancel_import(uuid,uuid) RESTRICT;
DROP FUNCTION public.finance_list_imports(uuid) RESTRICT;
DROP FUNCTION public.finance_revert_import(uuid,integer,uuid) RESTRICT;
DROP FUNCTION public.finance_list_grants(uuid) RESTRICT;

DO $finance_rollback_dependencies$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_proc p ON d.classid='pg_proc'::regclass AND d.objid=p.oid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE d.refclassid='pg_proc'::regclass
      AND d.refobjid IN (SELECT q.oid FROM pg_proc q JOIN pg_namespace s ON s.oid=q.pronamespace WHERE s.nspname='go_finance_private')
      AND n.nspname <> 'go_finance_private'
  ) OR EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_class c ON d.classid='pg_class'::regclass AND d.objid=c.oid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE d.refclassid='pg_class'::regclass
      AND d.refobjid IN (SELECT q.oid FROM pg_class q JOIN pg_namespace s ON s.oid=q.relnamespace WHERE s.nspname='go_finance_private')
      AND n.nspname NOT IN ('go_finance_private','pg_toast')
  ) THEN
    RAISE EXCEPTION 'FINANCE_ROLLBACK_EXTERNAL_DEPENDENCY';
  END IF;
END
$finance_rollback_dependencies$;

-- Internal tables, indexes, constraints and functions belong only to this
-- newly created schema; the guards above prevent loss of data or other modules.
DROP SCHEMA go_finance_private CASCADE;
COMMIT;
