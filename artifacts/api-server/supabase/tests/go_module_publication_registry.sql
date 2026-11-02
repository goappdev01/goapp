-- Synthetic Phase 1 verification. Run only against an empty disposable database.
begin;

do $$
begin
  if public.go_module_publication_stage('reservas.peluqueria', 'reservas.belleza') <> 'pilot' then
    raise exception 'Peluquerias seed is not pilot';
  end if;
  if not public.go_module_publication_allows_public('reservas.peluqueria', 'reservas.belleza') then
    raise exception 'Peluquerias is unexpectedly blocked';
  end if;
  if public.go_module_publication_allows_public('reservas.restaurante', 'reservas.restauracion') then
    raise exception 'Hidden restaurant was published';
  end if;
  if public.go_module_publication_allows_public('reservas.unknown', 'reservas.unknown') then
    raise exception 'Unknown activity was published';
  end if;
end;
$$;

set local role authenticated;
do $$
begin
  if public.go_module_publication_stage('reservas.peluqueria', 'reservas.belleza') <> 'pilot' then
    raise exception 'Authenticated caller cannot query the public contract';
  end if;
  begin
    perform * from go_module_publication_private.current_policy;
    raise exception 'Private publication registry was readable';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;
