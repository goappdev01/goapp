import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const policyScope = { exports: {} };
vm.runInNewContext(compile(fileURLToPath(new URL('../../../../lib/api-zod/src/module-publication.ts', import.meta.url))), policyScope);
export const modulePublicationPolicy = policyScope.exports;

/** Execute the production hook and policy. Only native context and the public metadata transport are fixtures. */
export function loadModulePublicationHook(React, { context = 'USER', owner = false } = {}) {
  const scope = { exports: {}, require(name) {
    if (name === 'react') return React;
    if (name === '@workspace/api-zod') return modulePublicationPolicy;
    if (name === '@/data/booking') return { supabaseApiRequest: async route => {
      if (route !== '/supabase/module-publication') throw Error('Unexpected publication transport ' + route);
      return modulePublicationPolicy.defaultGoModulePublication();
    } };
    if (name === '@/contexts/GoAdminAccessContext') return { useAdminAccess: () => ({ userId: owner ? 'fixture-owner' : 'fixture-user',
      allowed: owner, checking: false, level: owner ? 'owner' : null, permissions: owner ? ['admin.access', 'development'] : [] }) };
    if (name === '@/contexts/GoViewContext') return { useGoView: () => ({ loaded: true, view: context, isOwner: owner,
      isAdminView: owner && context === 'ADMIN', isBusinessPreview: owner && context === 'BUSINESS' }) };
    throw Error('Unexpected publication hook import ' + name);
  } };
  vm.runInNewContext(compile(fileURLToPath(new URL('../../hooks/useBookingModulePublication.ts', import.meta.url))), scope);
  return scope.exports;
}
