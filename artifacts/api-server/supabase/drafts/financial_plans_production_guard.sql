-- Preflight for project xiyxziyjpgnqfecbhmqn. Review before any later authorization.
-- This guard is inserted after BEGIN in financial_plans_production_review.sql.
DO $finance_guard$
DECLARE membership_oid oid;
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres'
     OR current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'FINANCE_WRONG_DATABASE_ROLE_OR_VERSION';
  END IF;
  IF to_regnamespace('go_finance_private') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'finance_%') THEN
    RAISE EXCEPTION 'FINANCE_OBJECTS_ALREADY_PRESENT';
  END IF;
  membership_oid := to_regclass('public.admin_memberships');
  IF membership_oid IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid=membership_oid AND c.relkind='r'
      AND c.relrowsecurity AND pg_get_userbyid(c.relowner)='postgres') THEN
    RAISE EXCEPTION 'FINANCE_MEMBERSHIP_TABLE_CHANGED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint k
    WHERE k.conrelid=membership_oid AND k.contype='p'
      AND pg_get_constraintdef(k.oid)='PRIMARY KEY (user_id)') THEN
    RAISE EXCEPTION 'FINANCE_MEMBERSHIP_KEY_CHANGED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
    WHERE a.attrelid=membership_oid AND a.attname='level' AND a.atttypid='text'::regtype)
    OR NOT EXISTS (SELECT 1 FROM pg_attribute a
      WHERE a.attrelid=membership_oid AND a.attname='permissions' AND a.atttypid='text[]'::regtype)
    OR NOT EXISTS (SELECT 1 FROM pg_attribute a
      WHERE a.attrelid=membership_oid AND a.attname='active' AND a.atttypid='boolean'::regtype)
    OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'FINANCE_AUTH_CONTRACT_CHANGED';
  END IF;
END
$finance_guard$;
