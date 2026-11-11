import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('sports events SQL draft: isolated ADMIN ownership, RLS, CAS, soft withdrawal and disk persistence', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-sports-admin-'));
  const ids = {
    admin: '11111111-1111-4111-8111-111111111111',
    otherAdmin: '22222222-2222-4222-8222-222222222222',
    user: '33333333-3333-4333-8333-333333333333',
    record: '44444444-4444-4444-8444-444444444444',
    duplicate: '55555555-5555-4555-8555-555555555555',
  };
  let db = new PGlite(path.join(dir, 'db'));
  const runAs = async (uid, operation, role = 'authenticated') => {
    await db.exec(`begin; set local role ${role};`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid ?? '']);
      const result = await operation(); await db.exec('commit'); return result;
    } catch (error) { await db.exec('rollback'); throw error; }
  };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.admin_memberships(user_id uuid primary key,level text,permissions text[],active boolean);
      alter table public.admin_memberships enable row level security;
      grant select on public.admin_memberships to authenticated;
      create policy sports_test_admin_read_own on public.admin_memberships for select to authenticated using (user_id=(select auth.uid()));`);
    await db.query('insert into auth.users values($1),($2),($3)', [ids.admin, ids.otherAdmin, ids.user]);
    await db.query("insert into public.admin_memberships values($1,'owner','{}',true),($2,'technical','{admin.access}',true)", [ids.admin, ids.otherAdmin]);
    await db.exec(await readFile('supabase/drafts/go_sports_events_admin_v1.sql', 'utf8'));
    const record = {
      id: ids.record, ownerUserId: ids.admin, profile: 'ADMIN', version: 0, recordType: 'offer', status: 'draft',
      accessStatus: 'unverified', policy: { status: 'unverified', sourceUrl: '' },
      event: { key: 'synthetic:match:2026', title: 'Synthetic match', sport: 'football', competition: 'Synthetic league', homeTeam: 'A', awayTeam: 'B', startsAt: '', timeZone: '', city: '', region: '', venue: '', officialEventUrl: '' },
      seat: { stand: 'North', section: 'A', row: '1', seat: '12', quantity: 1 }, mode: 'sale', price: 20, currency: 'EUR', ownerStatement: 'self_declared',
    };
    const create = async (value, expected = 0) => (await db.query('select public.go_sports_record_save($1::jsonb,$2) result', [JSON.stringify(value), expected])).rows[0].result;
    const saved = await runAs(ids.admin, () => create(record));
    assert.equal(saved.version, 1);
    assert.equal((await runAs(ids.admin, () => db.query('select id from public.go_sports_event_records'))).rows.length, 1);
    assert.equal((await runAs(ids.otherAdmin, () => db.query('select id from public.go_sports_event_records'))).rows.length, 0);
    assert.equal((await runAs(ids.user, () => db.query('select id from public.go_sports_event_records'))).rows.length, 0);
    await assert.rejects(runAs(ids.user, () => create({ ...record, id: ids.duplicate, ownerUserId: ids.user })), error => error.code === '42501');
    await assert.rejects(runAs(ids.admin, () => create({ ...record, id: ids.duplicate, qr: 'never store' })), error => error.code === '22023');
    await assert.rejects(runAs(ids.admin, () => create(record, 0)), error => error.code === 'PT409');
    const updated = await runAs(ids.admin, () => create({ ...saved, event: { ...record.event, title: 'Updated synthetic match' } }, 1));
    assert.equal(updated.version, 2);
    await runAs(ids.admin, async () => db.query('select public.go_sports_record_withdraw($1::uuid,$2)', [ids.record, 2]));
    await assert.rejects(runAs(ids.admin, () => db.query('select public.go_sports_record_withdraw($1::uuid,$2)', [ids.record, 2])), error => error.code === 'PT409');
    await db.close(); db = new PGlite(path.join(dir, 'db'));
    const persisted = await runAs(ids.admin, () => db.query('select deleted,version,document->>\'status\' status from public.go_sports_event_records where id=$1', [ids.record]));
    assert.deepEqual(persisted.rows, [{ deleted: true, version: 3, status: 'cancelled' }]);
    await assert.rejects(runAs(ids.admin, () => db.query('select public.go_sports_record_save($1::jsonb,$2)', [JSON.stringify(record), 0]), 'anon'), error => error.code === '42501');
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});
