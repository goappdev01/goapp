import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const requireDatabase = createRequire(createRequire(import.meta.url).resolve('@workspace/db'));
const { Client } = requireDatabase('pg');

const url = process.env.GO_BUSINESS_VERIFICATION_TEST_URL;
test('real isolated PostgreSQL business dossier lifecycle, RLS, storage and legacy compatibility', { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.match(parsed.pathname, /^\/go_business_verification_test_[0-9]+$/);
  assert.equal(process.env.GO_BUSINESS_VERIFICATION_TEST_CONFIRM, 'isolated');
  const db = new Client({ connectionString: url }); await db.connect();
  const ids = Object.fromEntries(['owner', 'applicant', 'other', 'technical', 'legacy', 'ambiguous', 'legacyService', 'legacyStaff', 'legacyBooking'].map(key => [key, randomUUID()]));
  const execute = async (id, sql, params = []) => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
      const result = await db.query(sql, params); await db.query('commit'); return result;
    } catch (error) { await db.query('rollback'); throw error; }
  };
  const command = async (actor, value) => (await execute(actor, 'select public.go_business_verification($1::jsonb) result', [JSON.stringify(value)])).rows[0].result;
  const concurrentCommand = async (actor, value) => {
    const connection = new Client({ connectionString: url }); await connection.connect();
    try {
      await connection.query('begin'); await connection.query('set local role authenticated');
      await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      const result = await connection.query('select public.go_business_verification($1::jsonb) result', [JSON.stringify(value)]);
      await connection.query('commit'); return result.rows[0].result;
    } catch (error) { await connection.query('rollback'); throw error; }
    finally { await connection.end(); }
  };
  const change = (operation, dossier, extra = {}) => ({ operation, requestId: randomUUID(), businessId: dossier.business_id, expectedRevision: dossier.revision, ...extra });
  const data = { legal_name: 'SYNTHETIC legal business', tax_id: 'TEST-123', trading_name: 'SYNTHETIC salon', address: 'SYNTHETIC address', activity: 'peluqueria' };
  let dossier, second, document;
  try {
    assert.equal((await db.query("select current_setting('go.business_verification_test',true) value")).rows[0].value, 'isolated');
    await db.query(`create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;
      grant select on storage.objects to anon;`);
    for (const file of ['0001_initial_go_schema.sql', '20260918142240_booking_owner_security.sql', '20260918142416_booking_generated_resource_guard.sql',
      '20260918142534_isolate_booking_extension.sql', '20260918145823_mobile_booking_fields.sql', '20261006064253_business_verification_access.sql']) {
      await db.query(await readFile('supabase/migrations/' + file, 'utf8'));
    }
    await db.query(await readFile('supabase/drafts/admin_memberships.sql', 'utf8'));
    for (const file of ['booking_multi_service_v2.sql', 'booking_negotiation_v1.sql', 'booking_verification_v1.sql', 'booking_timeline_v1.sql', 'booking_phase_wait_v1.sql', 'booking_gap_policy_v1.sql', 'catalog_associations_v1.sql']) {
      await db.query(await readFile('supabase/drafts/' + file, 'utf8'));
    }
    for (const key of ['owner', 'applicant', 'other', 'technical']) await db.query("insert into auth.users values($1,$2,now(),'{}')", [ids[key], key + '@example.invalid']);
    await db.query("select go_admin_private.bootstrap_owner($1,'SYNTHETIC isolated owner')", [ids.owner]);
    // Seed existing explicit and contradictory approvals before migrating.
    await db.query("insert into public.businesses(id,owner_id,name,address,verified,booking_enabled) values($1,$3,'SYNTHETIC legacy','Test',true,true),($2,$3,'SYNTHETIC ambiguous','Test',true,false)", [ids.legacy, ids.ambiguous, ids.applicant]);
    await db.query("insert into public.business_verification_requests(business_id,legal_name,tax_id,address,status) values($1,'Legacy request','TEST-OLD','Test','rejected')", [ids.ambiguous]);
    await db.query("insert into public.services(id,business_id,name,duration_minutes,price) values($1,$2,'Existing service',30,20)", [ids.legacyService, ids.legacy]);
    await db.query("insert into public.staff(id,business_id,display_name,ui_metadata) values($1,$2,'Existing professional',jsonb_build_object('serviceIds',jsonb_build_array($3::text)))", [ids.legacyStaff, ids.legacy, ids.legacyService]);
    await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,day,'09:00','18:00','UTC' from generate_series(0,6) day", [ids.legacy]);
    await db.query("insert into public.bookings(id,business_id,service_id,staff_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,'2035-01-01T09:00:00Z','2035-01-01T09:30:00Z','CONFIRMED')", [ids.legacyBooking, ids.legacy, ids.legacyService, ids.legacyStaff, ids.other]);
    const legacyBefore = (await db.query('select to_jsonb(b) row from public.bookings b where id=$1', [ids.legacyBooking])).rows[0].row;
    const migration = await readFile('supabase/drafts/business_verification_lifecycle_v1.sql', 'utf8');
    await assert.rejects(db.query(migration), error => error.code === 'PT409' && error.message === 'AMBIGUOUS_LEGACY_AUTHORITY');
    await db.query('rollback');
    assert.equal((await db.query('select verified from public.businesses where id=$1', [ids.ambiguous])).rows[0].verified, true);
    assert.equal((await db.query('select status from public.business_verification_requests where business_id=$1', [ids.ambiguous])).rows[0].status, 'rejected');
    // A synthetic administrator resolves the historical contradiction before retrying.
    await db.query("update public.business_verification_requests set status='authorized' where business_id=$1", [ids.ambiguous]);
    await db.query(migration);

    await t.test('legacy approvals are retained after contradictory records receive an explicit review', async () => {
      assert.equal((await execute(ids.applicant, 'select public.go_business_operational($1) ok', [ids.legacy])).rows[0].ok, true);
      assert.equal((await execute(ids.applicant, 'select public.go_business_operational($1) ok', [ids.ambiguous])).rows[0].ok, true);
      assert.equal((await db.query('select verified from public.businesses where id=$1', [ids.ambiguous])).rows[0].verified, true);
      assert.deepEqual((await db.query('select to_jsonb(b) row from public.bookings b where id=$1', [ids.legacyBooking])).rows[0].row, legacyBefore);
      await execute(ids.applicant, 'insert into public.business_settings(business_id,payload) values($1,$2)', [ids.legacy, { businessName: 'Existing configuration' }]);
      assert.equal((await execute(ids.applicant, 'select payload from public.business_settings where business_id=$1', [ids.legacy])).rows[0].payload.businessName, 'Existing configuration');
      const timeline = (await execute(ids.applicant, "select public.go_booking_timeline($1,array[$2::uuid],'2035-01-08T11:00:00Z'::timestamptz,$3) plan", [ids.legacy, ids.legacyService, ids.legacyStaff])).rows[0].plan;
      const reservation = (await execute(ids.other, "select public.go_create_timeline_booking(p_business_id=>$1,p_service_ids=>array[$2::uuid],p_starts_at=>'2035-01-08T11:00:00Z'::timestamptz,p_staff_id=>$3,p_request_key=>'SYNTHETIC-verification-compatibility',p_expected_plan=>$4::jsonb) booking", [ids.legacy, ids.legacyService, ids.legacyStaff, JSON.stringify(timeline)])).rows[0].booking;
      assert.ok(reservation.id);
    });
    await t.test('one personal identity creates two businesses, idempotently, without losing its profile', async () => {
      const create = { operation: 'draft', requestId: randomUUID(), data };
      dossier = (await command(ids.applicant, create)).dossier;
      assert.deepEqual(await command(ids.applicant, create), { dossier });
      second = (await command(ids.applicant, { ...create, requestId: randomUUID() })).dossier;
      assert.notEqual(second.business_id, dossier.business_id);
      assert.equal((await db.query('select role from public.profiles where id=$1', [ids.applicant])).rows[0].role, 'usuario');
      assert.equal(dossier.verified, false);
      assert.equal((await db.query('select booking_enabled from public.businesses where id=$1', [dossier.business_id])).rows[0].booking_enabled, false);
      await assert.rejects(command(ids.applicant, { ...create, data: { ...data, legal_name: 'changed' } }), error => error.code === 'PT409');
      const concurrent = { operation: 'draft', requestId: randomUUID(), data };
      const before = Number((await db.query('select count(*) from public.businesses')).rows[0].count);
      const [first, duplicate] = await Promise.all([concurrentCommand(ids.applicant, concurrent), concurrentCommand(ids.applicant, concurrent)]);
      assert.deepEqual(first, duplicate);
      assert.equal(Number((await db.query('select count(*) from public.businesses')).rows[0].count), before + 1);
      await assert.rejects(command(ids.applicant, { operation: 'draft', requestId: randomUUID(), data: { ...data, legal_name: 'x'.repeat(201) } }), error => error.code === '22023');
      assert.equal(Number((await db.query('select count(*) from public.businesses')).rows[0].count), before + 1);
      const partial = (await command(ids.applicant, { operation: 'draft', requestId: randomUUID(), data: { legal_name: 'A' } })).dossier;
      assert.equal(partial.status, 'draft'); assert.equal(partial.legal_name, 'A'); assert.equal(partial.tax_id, '');
      await assert.rejects(command(ids.applicant, change('submit', partial)), error => error.code === '22023');
    });
    await t.test('permissions, identifiers, stale versions and legacy submission cannot elevate access', async () => {
      await assert.rejects(command(ids.other, change('draft', dossier, { data })), error => error.code === '42501');
      await assert.rejects(command(ids.applicant, change('decide', dossier, { status: 'authorized', reason: 'self approval' })), error => error.code === '42501');
      await assert.rejects(command(ids.applicant, { ...change('draft', dossier, { data }), expectedRevision: 99 }), error => error.code === 'PT409');
      await assert.rejects(execute(ids.applicant, "select * from public.submit_business_verification($1,'Legal','TAX','Name','Address')", [dossier.business_id]), error => error.code === 'PT409');
      await assert.rejects(execute(ids.applicant, 'update public.businesses set verified=true where id=$1', [dossier.business_id]), error => error.code === '42501');
      await assert.rejects(execute(ids.applicant, "insert into public.services(business_id,name,duration_minutes,price) values($1,'Cut',30,20)", [dossier.business_id]), error => error.code === '42501');
      assert.equal((await execute(ids.applicant, 'select public.go_business_operational($1) ok', [dossier.business_id])).rows[0].ok, false);
      assert.equal((await execute(ids.other, 'select * from public.business_verification_requests where business_id=$1', [dossier.business_id])).rowCount, 0);
    });
    await t.test('requirements are explicitly configured per activity with guarded revisions', async () => {
      await assert.rejects(command(ids.applicant, change('submit', dossier)), error => error.code === 'PT409');
      const policy = { operation: 'requirements', requestId: randomUUID(), data: { activity: 'peluqueria', expectedVersion: 0, documents: [{ key: 'evidence', label: 'SYNTHETIC evidence', required: true }] } };
      await assert.rejects(command(ids.technical, policy), error => error.code === '42501');
      await command(ids.owner, policy);
      await assert.rejects(command(ids.owner, { ...policy, requestId: randomUUID() }), error => error.code === 'PT409');
      await assert.rejects(command(ids.applicant, change('submit', dossier)), error => error.code === '22023');
    });
    await t.test('private immutable upload and confirmation, invalid paths and cross-business reads', async () => {
      const reserve = await command(ids.applicant, change('reserve_document', dossier, { data: { requirementKey: 'evidence', fileName: 'synthetic.pdf', mimeType: 'application/pdf', byteSize: 12 } }));
      dossier = reserve.dossier; document = reserve.documentId;
      await assert.rejects(command(ids.applicant, change('complete_document', dossier, { data: { documentId: document } })), error => error.code === '22023');
      const path = dossier.business_id + '/' + document;
      await assert.rejects(execute(ids.other, "insert into storage.objects(bucket_id,name,metadata) values('business-verification',$1,$2)", [path, { size: 12, mimetype: 'application/pdf' }]), error => error.code === '42501');
      await assert.rejects(execute(ids.applicant, "insert into storage.objects(bucket_id,name) values('business-verification',$1)", ['../' + path]), error => error.code === '42501');
      await execute(ids.applicant, "insert into storage.objects(bucket_id,name,metadata) values('business-verification',$1,$2)", [path, { size: 12, mimetype: 'application/pdf' }]);
      dossier = (await command(ids.applicant, change('complete_document', dossier, { data: { documentId: document } }))).dossier;
      assert.equal(dossier.documents[0].status, 'provided');
      assert.equal('object_path' in dossier.documents[0], false);
      assert.equal((await execute(ids.other, 'select * from storage.objects')).rowCount, 0);
      assert.equal((await execute(ids.applicant, 'select * from storage.objects')).rowCount, 1);
      assert.equal((await execute(ids.applicant, "delete from storage.objects where name=$1", [path])).rowCount, 0);
      await assert.rejects(execute(ids.other, 'select public.go_business_document($1,false)', [document]), error => error.code === '42501');
    });
    await t.test('submit, rejection, correction and resubmission preserve the expediente and document history', async () => {
      dossier = (await command(ids.applicant, change('submit', dossier))).dossier;
      await assert.rejects(command(ids.applicant, change('draft', dossier, { data })), error => error.code === '42501');
      await assert.rejects(command(ids.owner, change('decide', dossier, { status: 'authorized', reason: 'SYNTHETIC approve' })), error => error.code === '22023');
      dossier = (await command(ids.owner, change('review_document', dossier, { reason: 'SYNTHETIC illegible', data: { documentId: document, status: 'rejected' } }))).dossier;
      dossier = (await command(ids.owner, change('decide', dossier, { status: 'correction', reason: 'SYNTHETIC resubmit evidence' }))).dossier;
      dossier = (await command(ids.applicant, change('draft', dossier, { data: { ...data, tax_id: 'TEST-CORRECTED' } }))).dossier;
      assert.equal(dossier.status, 'correction');
      const reserve = await command(ids.applicant, change('reserve_document', dossier, { data: { requirementKey: 'evidence', fileName: 'replacement.pdf', mimeType: 'application/pdf', byteSize: 13 } }));
      dossier = reserve.dossier; document = reserve.documentId;
      await execute(ids.applicant, "insert into storage.objects(bucket_id,name,metadata) values('business-verification',$1,$2)", [dossier.business_id + '/' + document, { size: 13, mimetype: 'application/pdf' }]);
      dossier = (await command(ids.applicant, change('complete_document', dossier, { data: { documentId: document } }))).dossier;
      dossier = (await command(ids.applicant, change('submit', dossier))).dossier;
      dossier = (await command(ids.owner, change('decide', dossier, { status: 'rejected', reason: 'SYNTHETIC correct address' }))).dossier;
      dossier = (await command(ids.applicant, change('draft', dossier, { data: { ...data, address: 'SYNTHETIC corrected address' } }))).dossier;
      dossier = (await command(ids.applicant, change('submit', dossier))).dossier;
      assert.equal(dossier.documents.length, 2);
      assert.equal(dossier.status, 'pending');
    });
    await t.test('specific admin delegation, approval, operational access, suspension and revocation', async () => {
      await execute(ids.owner, "select public.admin_set_membership($1,array['admin.access','businesses.verify'],true,'SYNTHETIC delegation')", [ids.technical]);
      const reviews = await Promise.allSettled([ids.owner, ids.technical].map(actor => concurrentCommand(actor,
        change('review_document', dossier, { reason: 'SYNTHETIC reviewed', data: { documentId: document, status: 'accepted' } }))));
      assert.equal(reviews.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(reviews.find(result => result.status === 'rejected').reason.code, 'PT409');
      dossier = reviews.find(result => result.status === 'fulfilled').value.dossier;
      const approve = change('decide', dossier, { status: 'authorized', reason: 'SYNTHETIC approval' });
      dossier = (await command(ids.owner, approve)).dossier;
      assert.deepEqual(await command(ids.owner, approve), { dossier });
      assert.equal(dossier.verified, true);
      const reopened = new Client({ connectionString: url }); await reopened.connect();
      try {
        await reopened.query('set role authenticated'); await reopened.query("select set_config('request.jwt.claim.sub',$1,false)", [ids.applicant]);
        const recovered = (await reopened.query('select public.go_business_dossiers($1,false) dossiers', [dossier.business_id])).rows[0].dossiers;
        assert.equal(recovered[0].status, 'authorized'); assert.equal(recovered[0].documents.length, 2);
      } finally { await reopened.end(); }
      await execute(ids.applicant, "insert into public.services(business_id,name,duration_minutes,price) values($1,'Cut',30,20)", [dossier.business_id]);
      assert.equal((await execute(ids.applicant, 'select public.go_business_operational($1) ok', [dossier.business_id])).rows[0].ok, true);
      assert.equal((await execute(ids.applicant, 'select public.go_business_operational($1) ok', [second.business_id])).rows[0].ok, false);
      assert.equal((await execute(ids.other, 'select public.go_business_operational($1) ok', [dossier.business_id])).rows[0].ok, false);
      dossier = (await command(ids.owner, change('decide', dossier, { status: 'suspended', reason: 'SYNTHETIC suspension' }))).dossier;
      assert.equal((await execute(ids.applicant, 'select public.go_business_operational($1) ok', [dossier.business_id])).rows[0].ok, false);
      await assert.rejects(execute(ids.applicant, "insert into public.services(business_id,name,duration_minutes,price) values($1,'Blocked',30,20)", [dossier.business_id]), error => error.code === '42501');
      dossier = (await command(ids.owner, change('decide', dossier, { status: 'revoked', reason: 'SYNTHETIC revoked' }))).dossier;
      assert.equal(dossier.status, 'revoked');
      assert.equal(dossier.verified, false);
      assert.equal((await command(ids.owner, approve)).dossier.status, 'revoked', 'An old retry cannot report a superseded authorization as current');
      assert.ok(dossier.history.every(event => event.actor_id && event.request_id));
      await assert.rejects(execute(ids.applicant, "update public.business_verification_audit set reason='forged'"), error => error.code === '42501');
      await execute(ids.owner, "select public.admin_set_membership($1,array['admin.access'],false,'SYNTHETIC revoke verifier')", [ids.technical]);
      await assert.rejects(execute(ids.technical, 'select public.go_business_document($1,false)', [document]), error => error.code === '42501');
      await db.query('begin;set local role anon');
      try {
        assert.equal((await db.query('select * from storage.objects')).rowCount, 0);
        await assert.rejects(db.query('select public.go_business_dossiers(null,false)'), error => error.code === '42501');
      } finally { await db.query('rollback'); }
    });
  } finally { await db.end(); }
});
