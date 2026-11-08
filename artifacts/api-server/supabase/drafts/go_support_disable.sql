-- Non-destructive emergency disable. Requires separate production authorization.
-- Keeps every request, message, event, private file and retention claim.
begin;
alter policy go_support_upload on storage.objects with check(false);
alter policy go_support_download on storage.objects using(false);
alter policy go_support_delete on storage.objects using(false);
revoke all on public.go_support_requests, public.go_support_messages, public.go_support_files,
 public.go_support_events, public.go_support_monthly_totals from public,anon,authenticated;
do $disable$
declare fn record;
begin
 for fn in select p.oid::regprocedure as signature from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
   'go_support_readiness','go_support_admin','go_support_can_read','go_support_detail','go_support_list',
   'go_support_create','go_support_act','go_support_file_access','go_support_reserve_file','go_support_file',
   'go_support_confirm_file','go_support_remove_file','go_support_expired','go_support_claim_expired','go_support_purge_expired')
 loop
  execute format('revoke execute on function %s from public, anon, authenticated',fn.signature);
 end loop;
end;
$disable$;
commit;
