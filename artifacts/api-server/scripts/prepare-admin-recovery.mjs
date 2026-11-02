// Build a reviewable patch against the reported deployed backend, never deploy it.
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baseline = 'fff549c8c297e868a8e69573c31a1198a91c74e5';
const reviewed = '7762ca2cc325c3bf9cbd42228b729bd2afad6eb5';
const stage = mkdtempSync(path.join(tmpdir(), 'go-admin-recovery-'));
const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true });
const archive = path.join(stage, 'source.tar');
writeFileSync(archive, git('archive', '--format=tar', baseline,
  'artifacts/api-server', 'lib/api-zod', 'lib/db', 'tsconfig.base.json'));
execFileSync('tar', ['-xf', archive, '-C', stage], { windowsHide: true });
const api = path.join(stage, 'artifacts/api-server');
const stagedGit = (...args) => execFileSync('git', args, { cwd: stage, windowsHide: true });
stagedGit('init', '--quiet');
stagedGit('add', 'artifacts/api-server/src/routes/index.ts');
const files = ['src/middleware/requireAdmin.ts', 'src/lib/adminPermissions.ts'];
for (const file of files) {
  const target = path.join(api, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, git('show', `${reviewed}:artifacts/api-server/${file}`));
}
const registry = path.join(api, 'src/routes/index.ts');
const previous = readFileSync(registry, 'utf8');
assert.ok(previous.includes('router.use(healthRouter);'));
assert.ok(!previous.includes('adminRouter'));
writeFileSync(registry, previous.replace('import managementRouter', 'import adminRouter from "./admin";\n\nimport managementRouter')
  .replace('router.use(healthRouter);', 'router.use(healthRouter);\nrouter.use("/supabase/admin", adminRouter);'));
writeFileSync(path.join(api, 'src/routes/admin.ts'), `import { Router } from "express";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";
const router = Router();
router.use(requireAdmin);
router.get("/access", requireAdminPermission("admin.access"), (_req, res) => {
  res.json({ userId: res.locals.adminUserId, role: "admin", allowed: true,
    level: res.locals.adminLevel, permissions: res.locals.adminPermissions });
});
export default router;
`);
stagedGit('add', '-N', ...files.map(f => `artifacts/api-server/${f}`), 'artifacts/api-server/src/routes/admin.ts');
stagedGit('diff', '--check');
const patch = path.join(stage, 'admin-recovery.patch');
writeFileSync(patch, stagedGit('diff', '--binary'));
assert.deepEqual(stagedGit('diff', '--name-only').toString().trim().split(/\r?\n/).sort(), [
  'artifacts/api-server/src/lib/adminPermissions.ts',
  'artifacts/api-server/src/middleware/requireAdmin.ts',
  'artifacts/api-server/src/routes/admin.ts',
  'artifacts/api-server/src/routes/index.ts',
]);
stagedGit('apply', '--reverse', '--check', patch);
stagedGit('apply', '--reverse', patch);
stagedGit('apply', '--check', patch);
stagedGit('apply', patch);
// Use already installed dependencies, with all generated outputs confined to stage.
for (const relative of ['', 'artifacts/api-server', 'lib/api-zod', 'lib/db']) {
  symlinkSync(path.join(root, relative, 'node_modules'), path.join(stage, relative, 'node_modules'), 'junction');
}
const require = createRequire(path.join(root, 'artifacts/api-server/package.json'));
const tsc = require.resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-b', 'lib/api-zod', 'lib/db', '--pretty', 'false'], { cwd: stage, windowsHide: true, stdio: 'pipe' });
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--noEmit', '--incremental', 'false'], { cwd: api, windowsHide: true, stdio: 'pipe' });
execFileSync(process.execPath, ['build.mjs'], { cwd: api, windowsHide: true, stdio: 'pipe' });
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ['dist/index.mjs'], {
  cwd: api, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: 'ignore',
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/healthz`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'The complete compiled backend must start');
  for (const [route, expected] of [['healthz', 200], ['supabase/admin/access', 401], ['supabase/manage/businesses', 401]]) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}`);
    assert.equal(response.status, expected);
    console.log(`${route}: ${response.status}`);
  }
} finally { child.kill(); }
console.log(JSON.stringify({ baseline, reviewed, stage, patch, typecheck: 'passed', build: 'passed', realAuth: 'not tested' }));
