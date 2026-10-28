-- DRAFT: isolated-test schema. Not applied to a shared or production database.
-- Register a deployment migration only after explicit approval and environment review.
begin;
create schema go_finance_private;
revoke all on schema go_finance_private from public, anon, authenticated, service_role;

create table go_finance_private.plans (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.admin_memberships(user_id),
 title text not null check(length(title) between 1 and 160), base_currency text not null check(base_currency ~ '^[A-Z]{3}$'),
 start_year integer not null check(start_year between 1800 and 2300), horizon integer not null check(horizon between 1 and 50 and start_year+horizon-1<=2300),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table go_finance_private.plan_grants (
 plan_id uuid references go_finance_private.plans(id) on delete cascade, user_id uuid references public.admin_memberships(user_id),
 can_write boolean not null, active boolean not null, granted_by uuid not null, updated_at timestamptz not null default now(), primary key(plan_id,user_id)
);
create table go_finance_private.activities (
 plan_id uuid references go_finance_private.plans(id) on delete cascade, id text not null, name text not null,
 unit text not null check(unit in ('empresa','establecimiento','otra')), enabled boolean not null,
 primary key(plan_id,id), unique(plan_id,id,unit)
);
create table go_finance_private.countries (
 plan_id uuid references go_finance_private.plans(id) on delete cascade, code text not null check(code ~ '^[A-Z]{2}$'),
 name text not null, currency text not null check(currency ~ '^[A-Z]{3}$'), primary key(plan_id,code)
);
create table go_finance_private.sources (
 plan_id uuid references go_finance_private.plans(id) on delete cascade, id text not null, organization text not null,
 url text not null check(url ~ '^https?://'), consulted_on date not null, verification text not null check(verification in ('NO_VERIFICADO','VERIFICADO','ESTIMACION','CONFLICTO')),
 notes text not null, primary key(plan_id,id)
);
create table go_finance_private.markets (
 plan_id uuid not null, activity_id text not null, country_code text not null, reference_year integer not null check(reference_year between 1800 and 2300),
 companies numeric check(companies between 0 and 1e12), unit text not null, source_id text not null, updated_on date not null,
 verification text not null check(verification in ('NO_VERIFICADO','VERIFICADO','ESTIMACION','CONFLICTO')), notes text not null,
 check(unit='otra' or companies=trunc(companies)),
 primary key(plan_id,activity_id,country_code,reference_year),
 foreign key(plan_id,activity_id,unit) references go_finance_private.activities(plan_id,id,unit),
 foreign key(plan_id,country_code) references go_finance_private.countries(plan_id,code),
 foreign key(plan_id,source_id) references go_finance_private.sources(plan_id,id)
);
create table go_finance_private.assumptions (
 plan_id uuid not null, id text not null, activity_id text not null, country_code text not null,
 scenario text not null check(scenario in ('PESIMISTA','REAL','OPTIMISTA')), selected boolean not null,
 start_year integer not null check(start_year between 1800 and 2300), parameters jsonb not null,
 primary key(plan_id,id), unique(plan_id,activity_id,country_code,scenario),
 foreign key(plan_id,activity_id) references go_finance_private.activities(plan_id,id),
 foreign key(plan_id,country_code) references go_finance_private.countries(plan_id,code)
);
create table go_finance_private.scenarios (
 plan_id uuid references go_finance_private.plans(id) on delete cascade, code text not null check(code in ('PESIMISTA','REAL','OPTIMISTA')),
 primary key(plan_id,code)
);
alter table go_finance_private.assumptions add foreign key(plan_id,scenario) references go_finance_private.scenarios(plan_id,code);
create table go_finance_private.year_parameters (
 plan_id uuid not null, assumption_id text not null, year integer not null check(year between 1800 and 2300), parameters jsonb not null,
 primary key(plan_id,assumption_id,year), foreign key(plan_id,assumption_id) references go_finance_private.assumptions(plan_id,id) on delete cascade
);
create table go_finance_private.revenues (
 plan_id uuid not null, id text not null, assumption_id text not null, year integer not null check(year=0 or year between 1800 and 2300), name text not null,
 kind text not null check(kind in ('monthly','annual','commission','operation','one_off')), value numeric check(value between 0 and 1e12),
 check(kind<>'commission' or value<=100), primary key(plan_id,id), unique(plan_id,assumption_id,year,kind),
 foreign key(plan_id,assumption_id) references go_finance_private.assumptions(plan_id,id) on delete cascade
);
create table go_finance_private.costs (
 plan_id uuid not null, id text not null, assumption_id text not null, year integer not null check(year=0 or year between 1800 and 2300), name text not null,
 category text not null check(category in ('operating','investment','tax')),
 driver text not null check(driver in ('company_month','hundred_company_month','percent_revenue','percent_margin','operation','fixed_month','fixed_year')),
 value numeric check(value between 0 and 1e12), check(driver not like 'percent_%' or value<=100),
 check(driver<>'percent_margin' or category='tax'), primary key(plan_id,id),
 foreign key(plan_id,assumption_id) references go_finance_private.assumptions(plan_id,id) on delete cascade
);
create table go_finance_private.fx_rates (
 plan_id uuid not null, currency text not null check(currency ~ '^[A-Z]{3}$'), base_currency text not null check(base_currency ~ '^[A-Z]{3}$'),
 year integer not null check(year between 1800 and 2300), rate numeric not null check(rate>0 and rate<=1e9), source_id text not null, as_of date not null,
 check(currency<>base_currency or rate=1),
 primary key(plan_id,currency,base_currency,year), foreign key(plan_id,source_id) references go_finance_private.sources(plan_id,id)
);
create table go_finance_private.versions (
 plan_id uuid references go_finance_private.plans(id) on delete cascade, version integer not null, actor_user_id uuid not null,
 action text not null, reason text not null, document jsonb not null, details jsonb not null default '{}', created_at timestamptz not null default now(), primary key(plan_id,version)
);
create table go_finance_private.import_previews (
 id uuid primary key default gen_random_uuid(), plan_id uuid references go_finance_private.plans(id) on delete cascade,
 actor_user_id uuid not null, base_version integer not null, candidate jsonb not null, summary jsonb not null,
 expires_at timestamptz not null default (now()+interval '1 hour')
);
create table go_finance_private.imports (
 id uuid primary key, plan_id uuid not null, actor_user_id uuid not null, before_version integer not null, applied_version integer not null,
 summary jsonb not null, reverted_version integer, created_at timestamptz not null default now(),
 foreign key(plan_id,before_version) references go_finance_private.versions(plan_id,version),
 foreign key(plan_id,applied_version) references go_finance_private.versions(plan_id,version)
);


-- Stable metadata catalogues and typed input constraints (no market values).
alter table go_finance_private.countries add check (code = any(array['AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW']::text[]));
alter table go_finance_private.countries add check (currency = any(array['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL']::text[]));
alter table go_finance_private.plans add check (base_currency = any(array['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL']::text[]));
alter table go_finance_private.fx_rates add check (currency = any(array['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL']::text[]));
alter table go_finance_private.fx_rates add check (base_currency = any(array['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XDR','XOF','XPF','XSU','YER','ZAR','ZMW','ZWG','ZWL']::text[]));
alter table go_finance_private.activities add check(id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$');
alter table go_finance_private.sources add check(id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$');
alter table go_finance_private.assumptions add check(id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$');
alter table go_finance_private.revenues add check(id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$');
alter table go_finance_private.costs add check(id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$');
alter table go_finance_private.activities add check(length(trim(name)) between 1 and 160);
alter table go_finance_private.countries add check(length(trim(name)) between 1 and 160);
alter table go_finance_private.revenues add check(length(trim(name)) between 1 and 160);
alter table go_finance_private.costs add check(length(trim(name)) between 1 and 160);
create unique index finance_cost_concept_unique on go_finance_private.costs(plan_id,assumption_id,year,category,lower(trim(name)));

-- All raw tables deny clients, including authenticated and service_role. Only
-- explicit private functions with fresh membership + plan ACL checks can mutate.
do $$ declare item record; begin
 for item in select tablename from pg_tables where schemaname='go_finance_private' loop
  execute format('alter table go_finance_private.%I enable row level security', item.tablename);
 end loop;
end $$;
revoke all on all tables in schema go_finance_private from public, anon, authenticated, service_role;

create function go_finance_private.assert_access(p_plan_id uuid, p_write boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); member text; owner_id uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Same lock used by admin membership writes: no revoke/check/write race.
 perform pg_advisory_xact_lock_shared(714082601);
 select level into member from public.admin_memberships where user_id=actor and active and (level='owner' or permissions @> array['admin.access']::text[]);
 if member not in ('owner','technical') or member is null then raise exception 'Admin required' using errcode='42501'; end if;
 if p_plan_id is null then
  if member<>'owner' then raise exception 'Owner required' using errcode='42501'; end if;
  return actor;
 end if;
 if p_write then
  select owner_user_id into owner_id from go_finance_private.plans where id=p_plan_id for update;
 else
  select owner_user_id into owner_id from go_finance_private.plans where id=p_plan_id for share;
 end if;
 if owner_id is null then raise exception 'Plan not authorized' using errcode='42501'; end if;
 if not ((member='owner' and owner_id=actor) or exists(select 1 from go_finance_private.plan_grants where plan_id=p_plan_id and user_id=actor and active and (not p_write or can_write))) then
  raise exception 'Plan not authorized' using errcode='42501';
 end if;
 return actor;
end $$;
create function go_finance_private.exact_keys(v jsonb, keys text[]) returns boolean
language sql immutable security invoker set search_path='' as $$ select jsonb_typeof(v)='object' and v ?& keys and v-keys='{}'::jsonb $$;
create function go_finance_private.valid_number(v jsonb, lo numeric, hi numeric) returns boolean
language sql immutable security invoker set search_path='' as $$ select case when jsonb_typeof(v)='null' then true when jsonb_typeof(v)='number' then (v::text)::numeric between lo and hi else false end $$;
create function go_finance_private.validate_document(d jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare k text; v jsonb; y jsonb; annual text[]:=array['penetrationPct','annualGrowthPct','marketGrowthPct','churnPct','newCompanies','retainedCompanies','marketCompanies','operationsPerCompanyMonth','averageTicket'];
begin
 if not coalesce(go_finance_private.exact_keys(d,array['schemaVersion','title','baseCurrency','startYear','horizon','activities','countries','sources','markets','assumptions','revenues','costs','fxRates']),false)
  or d->>'schemaVersion'<>'1' then raise exception 'Invalid document' using errcode='22023'; end if;
 foreach k in array array['activities','countries','sources','markets','assumptions','revenues','costs','fxRates'] loop
  if jsonb_typeof(d->k)<>'array' or jsonb_array_length(d->k)>50000 then raise exception 'Invalid collection' using errcode='22023'; end if;
 end loop;
 if jsonb_array_length(d->'markets')>25000 or jsonb_array_length(d->'countries')>249 or jsonb_array_length(d->'activities')>200
   or jsonb_array_length(d->'assumptions')>15000 or (select coalesce(sum(greatest((d->>'horizon')::integer,(d->>'startYear')::integer+(d->>'horizon')::integer-(a->>'startYear')::integer)),0) from jsonb_array_elements(d->'assumptions') a where a->>'selected'='true')>50000 then
   raise exception 'Collection limit' using errcode='22023'; end if;
 for v in select value from jsonb_array_elements(d->'assumptions') loop
  if not coalesce(go_finance_private.exact_keys(v,annual||array['id','activityId','countryCode','scenario','selected','startYear','openingCompanies','acquisitionTiming','costsConfirmed','years']),false)
   or jsonb_typeof(v->'selected')<>'boolean' or jsonb_typeof(v->'costsConfirmed')<>'boolean'
   or not go_finance_private.valid_number(v->'openingCompanies',0,1e12) or v->'openingCompanies'='null'::jsonb
   or v->>'acquisitionTiming' not in ('uniform','start','end') or jsonb_typeof(v->'years')<>'array' or jsonb_array_length(v->'years')>50 then
   raise exception 'Invalid assumptions' using errcode='22023'; end if;
  for y in select v union all select value-'year' from jsonb_array_elements(v->'years') loop
   foreach k in array annual loop
    if not go_finance_private.valid_number(y->k,case when k in ('annualGrowthPct','marketGrowthPct') then -100 else 0 end,
      case when k in ('penetrationPct','churnPct') then 100 when k in ('annualGrowthPct','marketGrowthPct') then 1000 else 1e12 end) then
      raise exception 'Invalid hypothesis parameter' using errcode='22023'; end if;
   end loop;
  end loop;
 end loop;
end $$;

create function go_finance_private.document(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,'title',p.title,'baseCurrency',p.base_currency,'startYear',p.start_year,'horizon',p.horizon,
 'activities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',unit,'enabled',enabled) order by id) from go_finance_private.activities where plan_id=p.id),'[]'::jsonb),
 'countries',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name,'currency',currency) order by code) from go_finance_private.countries where plan_id=p.id),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization',organization,'url',url,'consultedOn',consulted_on,'verification',verification,'notes',notes) order by id) from go_finance_private.sources where plan_id=p.id),'[]'::jsonb),
 'markets',coalesce((select jsonb_agg(jsonb_build_object('activityId',activity_id,'countryCode',country_code,'referenceYear',reference_year,'companies',companies,'unit',unit,'sourceId',source_id,'updatedOn',updated_on,'verification',verification,'notes',notes) order by activity_id,country_code,reference_year) from go_finance_private.markets where plan_id=p.id),'[]'::jsonb),
 'assumptions',coalesce((select jsonb_agg(parameters||jsonb_build_object('id',a.id,'activityId',activity_id,'countryCode',country_code,'scenario',scenario,'selected',selected,'startYear',start_year,'years',coalesce((select jsonb_agg(parameters||jsonb_build_object('year',year) order by year) from go_finance_private.year_parameters where plan_id=p.id and assumption_id=a.id),'[]'::jsonb)) order by a.id) from go_finance_private.assumptions a where plan_id=p.id),'[]'::jsonb),
 'revenues',coalesce((select jsonb_agg(jsonb_build_object('id',id,'assumptionId',assumption_id,'year',year,'name',name,'kind',kind,'value',value) order by id) from go_finance_private.revenues where plan_id=p.id),'[]'::jsonb),
 'costs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'assumptionId',assumption_id,'year',year,'name',name,'category',category,'driver',driver,'value',value) order by id) from go_finance_private.costs where plan_id=p.id),'[]'::jsonb),
 'fxRates',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'baseCurrency',base_currency,'year',year,'rate',rate,'sourceId',source_id,'asOf',as_of) order by currency,base_currency,year) from go_finance_private.fx_rates where plan_id=p.id),'[]'::jsonb))
 from go_finance_private.plans p where p.id=p_id
$$;

create function go_finance_private.write_document(p_id uuid, d jsonb, markets_only boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform go_finance_private.validate_document(d);
 if markets_only then
  -- Imports touch market data and provenance only, never rewrite personal tariffs or hypotheses.
  insert into go_finance_private.activities select p_id,r->>'id',r->>'name',r->>'unit',(r->>'enabled')::boolean from jsonb_array_elements(d->'activities') r on conflict do nothing;
  insert into go_finance_private.countries select p_id,r->>'code',r->>'name',r->>'currency' from jsonb_array_elements(d->'countries') r on conflict do nothing;
  insert into go_finance_private.sources select p_id,r->>'id',r->>'organization',r->>'url',(r->>'consultedOn')::date,r->>'verification',r->>'notes' from jsonb_array_elements(d->'sources') r
   on conflict(plan_id,id) do update set organization=excluded.organization,url=excluded.url,consulted_on=excluded.consulted_on,verification=excluded.verification,notes=excluded.notes;
  delete from go_finance_private.markets where plan_id=p_id;
  insert into go_finance_private.markets select p_id,r->>'activityId',r->>'countryCode',(r->>'referenceYear')::integer,(r->>'companies')::numeric,r->>'unit',r->>'sourceId',(r->>'updatedOn')::date,r->>'verification',r->>'notes' from jsonb_array_elements(d->'markets') r;
  delete from go_finance_private.sources s where plan_id=p_id and not exists(select 1 from jsonb_array_elements(d->'sources') r where r->>'id'=s.id)
   and not exists(select 1 from go_finance_private.fx_rates f where f.plan_id=p_id and f.source_id=s.id);
  return;
 end if;
 -- Constraint failures roll back the entire replacement, including the deletes.
 delete from go_finance_private.markets where plan_id=p_id;
 delete from go_finance_private.fx_rates where plan_id=p_id;
 delete from go_finance_private.assumptions where plan_id=p_id;
 delete from go_finance_private.activities where plan_id=p_id;
 delete from go_finance_private.countries where plan_id=p_id;
 delete from go_finance_private.sources where plan_id=p_id;
 update go_finance_private.plans set title=d->>'title',base_currency=d->>'baseCurrency',start_year=(d->>'startYear')::integer,horizon=(d->>'horizon')::integer,updated_at=now() where id=p_id;
 insert into go_finance_private.activities select p_id,r->>'id',r->>'name',r->>'unit',(r->>'enabled')::boolean from jsonb_array_elements(d->'activities') r;
 insert into go_finance_private.countries select p_id,r->>'code',r->>'name',r->>'currency' from jsonb_array_elements(d->'countries') r;
 insert into go_finance_private.sources select p_id,r->>'id',r->>'organization',r->>'url',(r->>'consultedOn')::date,r->>'verification',r->>'notes' from jsonb_array_elements(d->'sources') r;
 insert into go_finance_private.markets select p_id,r->>'activityId',r->>'countryCode',(r->>'referenceYear')::integer,(r->>'companies')::numeric,r->>'unit',r->>'sourceId',(r->>'updatedOn')::date,r->>'verification',r->>'notes' from jsonb_array_elements(d->'markets') r;
 insert into go_finance_private.assumptions select p_id,r->>'id',r->>'activityId',r->>'countryCode',r->>'scenario',(r->>'selected')::boolean,(r->>'startYear')::integer,
  r-array['id','activityId','countryCode','scenario','selected','startYear','years'] from jsonb_array_elements(d->'assumptions') r;
 insert into go_finance_private.year_parameters select p_id,r->>'id',(y->>'year')::integer,y-'year' from jsonb_array_elements(d->'assumptions') r cross join lateral jsonb_array_elements(r->'years') y;
 insert into go_finance_private.revenues select p_id,r->>'id',r->>'assumptionId',(r->>'year')::integer,r->>'name',r->>'kind',(r->>'value')::numeric from jsonb_array_elements(d->'revenues') r;
 insert into go_finance_private.costs select p_id,r->>'id',r->>'assumptionId',(r->>'year')::integer,r->>'name',r->>'category',r->>'driver',(r->>'value')::numeric from jsonb_array_elements(d->'costs') r;
 insert into go_finance_private.fx_rates select p_id,r->>'currency',r->>'baseCurrency',(r->>'year')::integer,(r->>'rate')::numeric,r->>'sourceId',(r->>'asOf')::date from jsonb_array_elements(d->'fxRates') r;
end $$;

create function go_finance_private.get_plan(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; p go_finance_private.plans;
begin
 actor:=go_finance_private.assert_access(p_id,false);
 select * into p from go_finance_private.plans where id=p_id;
 return jsonb_build_object('id',p.id,'ownerUserId',p.owner_user_id,'version',p.version,'canWrite',p.owner_user_id=actor or exists(select 1 from go_finance_private.plan_grants where plan_id=p_id and user_id=actor and active and can_write),'document',go_finance_private.document(p_id));
end $$;
create function go_finance_private.access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); member text; plans jsonb;
begin
 select level into member from public.admin_memberships where user_id=actor and active;
 if actor is null or member is null or member not in ('owner','technical') then raise exception 'Admin required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'version',p.version,'ownerUserId',p.owner_user_id,'canWrite',p.owner_user_id=actor or g.can_write) order by p.created_at),'[]'::jsonb) into plans
 from go_finance_private.plans p left join go_finance_private.plan_grants g on g.plan_id=p.id and g.user_id=actor and g.active
 where (p.owner_user_id=actor and member='owner') or g.user_id is not null;
 return jsonb_build_object('canCreate',member='owner','plans',plans);
end $$;
create function go_finance_private.create_plan(d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; pid uuid;
begin
 actor:=go_finance_private.assert_access(null,true);
 insert into go_finance_private.plans(owner_user_id,title,base_currency,start_year,horizon) values(actor,d->>'title',d->>'baseCurrency',(d->>'startYear')::integer,(d->>'horizon')::integer) returning id into pid;
 insert into go_finance_private.scenarios values(pid,'PESIMISTA'),(pid,'REAL'),(pid,'OPTIMISTA');
 perform go_finance_private.write_document(pid,d);
 insert into go_finance_private.versions(plan_id,version,actor_user_id,action,reason,document) values(pid,1,actor,'create','Creación del plan',go_finance_private.document(pid));
 return go_finance_private.get_plan(pid);
end $$;
create function go_finance_private.save_plan(p_id uuid, p_version integer, d jsonb, reason text, action text default 'edit', details jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; current_version integer;
begin
 actor:=go_finance_private.assert_access(p_id,true);
 select version into current_version from go_finance_private.plans where id=p_id for update;
 if p_version is null or current_version<>p_version then raise exception 'Revision changed' using errcode='PT409'; end if;
 if reason is null or length(trim(reason)) not between 1 and 1000 then raise exception 'Reason required' using errcode='22023'; end if;
 perform go_finance_private.write_document(p_id,d,action in ('import','revert_import'));
 update go_finance_private.plans set version=version+1 where id=p_id;
 insert into go_finance_private.versions(plan_id,version,actor_user_id,action,reason,document,details) values(p_id,current_version+1,actor,action,reason,go_finance_private.document(p_id),details);
 return go_finance_private.get_plan(p_id);
end $$;
create function go_finance_private.history(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform go_finance_private.assert_access(p_id,false);
 return coalesce((select jsonb_agg(v order by v.version desc) from(select version,actor_user_id,action,reason,details,created_at from go_finance_private.versions where plan_id=p_id order by version desc limit 200) v),'[]'::jsonb);
end $$;
create function go_finance_private.grant_access(p_id uuid,p_version integer,target uuid,write_access boolean,is_active boolean,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
 actor:=go_finance_private.assert_access(null,true);
 if not exists(select 1 from go_finance_private.plans where id=p_id and owner_user_id=actor) then raise exception 'Owner required' using errcode='42501'; end if;
 if target is null or target=actor or write_access is null or is_active is null or not exists(select 1 from public.admin_memberships where user_id=target and level='technical' and (not is_active or active)) then
  raise exception 'An active delegated admin is required' using errcode='22023'; end if;
 result:=go_finance_private.save_plan(p_id,p_version,go_finance_private.document(p_id),reason,'grant',jsonb_build_object('target',target,'canWrite',write_access,'active',is_active));
 insert into go_finance_private.plan_grants(plan_id,user_id,can_write,active,granted_by) values(p_id,target,write_access,is_active,actor)
 on conflict(plan_id,user_id) do update set can_write=excluded.can_write,active=excluded.active,granted_by=excluded.granted_by,updated_at=now();
 return result;
end $$;

create function go_finance_private.prepare_import(p_id uuid,p_version integer,d jsonb,summary jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; current_doc jsonb; pid uuid; current_version integer;
begin
 actor:=go_finance_private.assert_access(p_id,true);
 select version into current_version from go_finance_private.plans where id=p_id for update;
 if p_version is null or current_version<>p_version then raise exception 'Revision changed' using errcode='PT409'; end if;
 perform go_finance_private.validate_document(d);
 current_doc:=go_finance_private.document(p_id);
 if d-array['markets','sources','activities','countries']<>current_doc-array['markets','sources','activities','countries']
  or exists(select 1 from jsonb_array_elements(current_doc->'activities') a where not (d->'activities') @> jsonb_build_array(a))
  or exists(select 1 from jsonb_array_elements(current_doc->'countries') c where not (d->'countries') @> jsonb_build_array(c)) then
  raise exception 'Market import cannot alter personal hypotheses or existing catalogue definitions' using errcode='22023'; end if;
 delete from go_finance_private.import_previews where plan_id=p_id and actor_user_id=actor and expires_at<now();
 insert into go_finance_private.import_previews(plan_id,actor_user_id,base_version,candidate,summary) values(p_id,actor,p_version,d,summary) returning id into pid;
 return jsonb_build_object('previewId',pid,'version',p_version,'expiresInSeconds',3600,'summary',summary);
end $$;
create function go_finance_private.apply_import(p_id uuid,p_preview uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; draft go_finance_private.import_previews; result jsonb;
begin
 actor:=go_finance_private.assert_access(p_id,true);
 -- An already applied preview is idempotent; no duplicate imports or revisions.
 if exists(select 1 from go_finance_private.imports where id=p_preview and plan_id=p_id and actor_user_id=actor and reverted_version is null) then return go_finance_private.get_plan(p_id); end if;
 select * into draft from go_finance_private.import_previews where id=p_preview and plan_id=p_id and actor_user_id=actor and expires_at>now() for update;
 if draft.id is null then raise exception 'Preview unavailable or expired' using errcode='22023'; end if;
 result:=go_finance_private.save_plan(p_id,draft.base_version,draft.candidate,'Importación de mercados confirmada','import',draft.summary||jsonb_build_object('importId',p_preview));
 insert into go_finance_private.imports(id,plan_id,actor_user_id,before_version,applied_version,summary) values(p_preview,p_id,actor,draft.base_version,draft.base_version+1,draft.summary);
 delete from go_finance_private.import_previews where id=p_preview;
 return result;
end $$;
create function go_finance_private.cancel_import(p_id uuid,p_preview uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=go_finance_private.assert_access(p_id,true);
 delete from go_finance_private.import_previews where id=p_preview and plan_id=p_id and actor_user_id=actor;
 return true;
end $$;
create function go_finance_private.list_imports(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform go_finance_private.assert_access(p_id,false);
 return coalesce((select jsonb_agg(i order by i.applied_version desc) from(select id,actor_user_id,before_version,applied_version,summary,reverted_version,created_at from go_finance_private.imports where plan_id=p_id order by applied_version desc limit 200) i),'[]'::jsonb);
end $$;
create function go_finance_private.revert_import(p_id uuid,p_version integer,p_import uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt go_finance_private.imports; before_doc jsonb; after_doc jsonb; current_doc jsonb; revised jsonb;
 changed_markets jsonb; changed_sources jsonb; restored_markets jsonb; restored_sources jsonb; result jsonb;
begin
 perform go_finance_private.assert_access(p_id,true);
 select * into receipt from go_finance_private.imports where id=p_import and plan_id=p_id for update;
 if receipt.id is null then raise exception 'Import unavailable' using errcode='22023'; end if;
 if receipt.reverted_version is not null then return go_finance_private.get_plan(p_id); end if;
 select document into before_doc from go_finance_private.versions where plan_id=p_id and version=receipt.before_version;
 select document into after_doc from go_finance_private.versions where plan_id=p_id and version=receipt.applied_version;
 current_doc:=go_finance_private.document(p_id);
 select coalesce(jsonb_agg(a),'[]') into changed_markets from jsonb_array_elements(after_doc->'markets') a where not (before_doc->'markets') @> jsonb_build_array(a);
 select coalesce(jsonb_agg(a),'[]') into changed_sources from jsonb_array_elements(after_doc->'sources') a where not (before_doc->'sources') @> jsonb_build_array(a);
 if exists(select 1 from jsonb_array_elements(changed_markets) a where not (current_doc->'markets') @> jsonb_build_array(a))
  or exists(select 1 from jsonb_array_elements(changed_sources) a where not (current_doc->'sources') @> jsonb_build_array(a)) then
  raise exception 'Imported data was subsequently changed; review before reverting' using errcode='PT409'; end if;
 select coalesce(jsonb_agg(m),'[]') into restored_markets from (
  select cur.value m from jsonb_array_elements(current_doc->'markets') cur where not exists(select 1 from jsonb_array_elements(changed_markets) a where a->>'activityId'=cur.value->>'activityId' and a->>'countryCode'=cur.value->>'countryCode' and a->>'referenceYear'=cur.value->>'referenceYear')
  union all select old.value from jsonb_array_elements(before_doc->'markets') old where exists(select 1 from jsonb_array_elements(changed_markets) a where a->>'activityId'=old.value->>'activityId' and a->>'countryCode'=old.value->>'countryCode' and a->>'referenceYear'=old.value->>'referenceYear')
 ) rows;
 select coalesce(jsonb_agg(s),'[]') into restored_sources from (
  select cur.value s from jsonb_array_elements(current_doc->'sources') cur where not exists(select 1 from jsonb_array_elements(changed_sources) a where a->>'id'=cur.value->>'id')
   or (not exists(select 1 from jsonb_array_elements(before_doc->'sources') b where b->>'id'=cur.value->>'id')
    and (exists(select 1 from jsonb_array_elements(restored_markets) m where m->>'sourceId'=cur.value->>'id') or exists(select 1 from jsonb_array_elements(current_doc->'fxRates') f where f->>'sourceId'=cur.value->>'id')))
  union all select old.value from jsonb_array_elements(before_doc->'sources') old where exists(select 1 from jsonb_array_elements(changed_sources) a where a->>'id'=old.value->>'id')
 ) rows;
 revised:=jsonb_set(jsonb_set(current_doc,'{markets}',restored_markets),'{sources}',restored_sources);
 result:=go_finance_private.save_plan(p_id,p_version,revised,'Reversión confirmada de importación','revert_import',jsonb_build_object('importId',p_import));
 update go_finance_private.imports set reverted_version=(result->>'version')::integer where id=p_import;
 return result;
end $$;
create function go_finance_private.list_grants(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=go_finance_private.assert_access(null,true);
 if not exists(select 1 from go_finance_private.plans where id=p_id and owner_user_id=actor) then raise exception 'Owner required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(g order by user_id) from(select user_id,can_write,active,updated_at from go_finance_private.plan_grants where plan_id=p_id) g),'[]'::jsonb);
end $$;
-- The general save API fixes action='edit'; callers cannot forge audit actions.
create function go_finance_private.api_save(p_id uuid,p_version integer,d jsonb,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin return go_finance_private.save_plan(p_id,p_version,d,reason); end $$;

-- Revoke DEFAULT PUBLIC EXECUTE before selectively granting the safe API.
revoke all on all functions in schema go_finance_private from public,anon,authenticated,service_role;
grant usage on schema go_finance_private to authenticated;
create function public.finance_access() returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.access() $$;
create function public.finance_get_plan(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.get_plan(p_id) $$;
create function public.finance_create_plan(d jsonb) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.create_plan(d) $$;
create function public.finance_save_plan(p_id uuid,p_version integer,d jsonb,reason text) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.api_save(p_id,p_version,d,reason) $$;
create function public.finance_history(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.history(p_id) $$;
create function public.finance_grant(p_id uuid,p_version integer,target uuid,write_access boolean,is_active boolean,reason text) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.grant_access(p_id,p_version,target,write_access,is_active,reason) $$;
create function public.finance_prepare_import(p_id uuid,p_version integer,d jsonb,summary jsonb) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.prepare_import(p_id,p_version,d,summary) $$;
create function public.finance_apply_import(p_id uuid,p_preview uuid) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.apply_import(p_id,p_preview) $$;
create function public.finance_cancel_import(p_id uuid,p_preview uuid) returns boolean language sql security invoker set search_path='' as $$ select go_finance_private.cancel_import(p_id,p_preview) $$;
create function public.finance_list_imports(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.list_imports(p_id) $$;
create function public.finance_revert_import(p_id uuid,p_version integer,p_import uuid) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.revert_import(p_id,p_version,p_import) $$;
revoke all on function public.finance_access(),public.finance_get_plan(uuid),public.finance_create_plan(jsonb),public.finance_save_plan(uuid,integer,jsonb,text),public.finance_history(uuid),public.finance_grant(uuid,integer,uuid,boolean,boolean,text),public.finance_prepare_import(uuid,integer,jsonb,jsonb),public.finance_apply_import(uuid,uuid),public.finance_cancel_import(uuid,uuid),public.finance_list_imports(uuid),public.finance_revert_import(uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.finance_access(),public.finance_get_plan(uuid),public.finance_create_plan(jsonb),public.finance_save_plan(uuid,integer,jsonb,text),public.finance_history(uuid),public.finance_grant(uuid,integer,uuid,boolean,boolean,text),public.finance_prepare_import(uuid,integer,jsonb,jsonb),public.finance_apply_import(uuid,uuid),public.finance_cancel_import(uuid,uuid),public.finance_list_imports(uuid),public.finance_revert_import(uuid,integer,uuid) to authenticated;
grant execute on function go_finance_private.access(),go_finance_private.get_plan(uuid),go_finance_private.create_plan(jsonb),go_finance_private.api_save(uuid,integer,jsonb,text),go_finance_private.history(uuid),go_finance_private.grant_access(uuid,integer,uuid,boolean,boolean,text),go_finance_private.prepare_import(uuid,integer,jsonb,jsonb),go_finance_private.apply_import(uuid,uuid),go_finance_private.cancel_import(uuid,uuid),go_finance_private.list_imports(uuid),go_finance_private.revert_import(uuid,integer,uuid) to authenticated;
create function public.finance_list_grants(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select go_finance_private.list_grants(p_id) $$;
revoke all on function public.finance_list_grants(uuid) from public,anon,authenticated,service_role;
grant execute on function public.finance_list_grants(uuid),go_finance_private.list_grants(uuid) to authenticated;
commit;
