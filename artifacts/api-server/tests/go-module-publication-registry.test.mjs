import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const { PGlite } = createRequire(import.meta.url)('@electric-sql/pglite');
const migration = await readFile('supabase/migrations/20261102090000_go_module_publication_registry.sql', 'utf8');

test('module publication registry defaults to the Peluquerias-only pilot and keeps its table private', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    await db.exec(migration);

    const stage = async (moduleId, parentId = null) => (await db.query(
      'select public.go_module_publication_stage($1, $2) as value', [moduleId, parentId],
    )).rows[0].value;
    const allowed = async (moduleId, parentId = null) => (await db.query(
      'select public.go_module_publication_allows_public($1, $2) as value', [moduleId, parentId],
    )).rows[0].value;

    assert.equal(await stage('reservas.peluqueria', 'reservas.belleza'), 'pilot');
    assert.equal(await allowed('reservas.peluqueria', 'reservas.belleza'), true);
    assert.equal(await stage('reservas.restaurante', 'reservas.restauracion'), 'internal');
    assert.equal(await allowed('reservas.restaurante', 'reservas.restauracion'), false);
    assert.equal(await stage('reservas.unknown', 'reservas.unknown'), 'development');
    assert.equal(await allowed('reservas.unknown', 'reservas.unknown'), false);

    await db.exec('set role authenticated;');
    assert.equal(await allowed('reservas.peluqueria', 'reservas.belleza'), true);
    await assert.rejects(db.query('select * from go_module_publication_private.current_policy'));
    await assert.rejects(db.query("update go_module_publication_private.current_policy set audience = 'general'"));
    await db.exec('reset role;');

    const { rows } = await db.query('select public.go_module_publication_contract() as value');
    assert.deepEqual(rows[0].value, {
      version: 1,
      audience: 'pilot',
      stages: {
        'go.imprimir': 'development',
        'reservas.actividades': 'internal',
        'reservas.belleza': 'internal',
        'reservas.deportes': 'internal',
        'reservas.hogar': 'internal',
        'reservas.hoteles': 'internal',
        'reservas.otros': 'internal',
        'reservas.peluqueria': 'pilot',
        'reservas.restauracion': 'internal',
        'reservas.salud': 'internal',
        'reservas.servicios': 'internal',
      },
    });
  } finally {
    await db.close();
  }
});
