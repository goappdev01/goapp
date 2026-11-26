import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const businessId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const fixture = (request, identity = businessId) => {
  const source = readFileSync("data/commercialQr.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: key => key === "./booking" ? {
      isCloudId: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? ""),
      supabaseApiRequest: request,
      getAuthenticatedUserId: async () => identity,
    } : { useEffect() {}, useState: value => [value, () => {}] },
  });
  return exports;
};

test("commercial QR advertises only a server-published matching company", async () => {
  const requests = [];
  const api = fixture(async path => { requests.push(path); return { state: "published", businessId }; });
  const valid = await api.resolveCommercialBusinessLink(businessId);
  assert.equal(valid.state, "published");
  assert.equal(valid.url, `https://goapp-api-production.up.railway.app/api/commercial/b/${businessId}`);
  assert.equal(await api.resolveCommercialCode(businessId), businessId);
  assert.deepEqual(requests, [`/commercial/resolve/${businessId}`, `/commercial/resolve/${businessId}`]);
  assert.equal((await api.resolveCommercialBusinessLink("demo-company")).url, null);
});

test("a mismatched, unpublished or unavailable company cannot expose a shareable QR", async () => {
  for (const result of [{ state: "published", businessId: otherId }, { state: "not_published" }]) {
    const api = fixture(async () => result);
    assert.equal((await api.resolveCommercialBusinessLink(businessId)).url, null);
  }
  const failed = fixture(async () => { throw Error("unavailable"); });
  assert.equal((await failed.resolveCommercialBusinessLink(businessId)).url, null);
});

test("acquisition claim requires the current authenticated identity", async () => {
  let calls = 0;
  const token = "a".repeat(64);
  const api = fixture(async (path, init, requireToken, expectedUserId) => {
    calls++;
    assert.equal(path, "/commercial/acquisition/claim");
    assert.equal(requireToken, true);
    assert.equal(expectedUserId, businessId);
    assert.equal(JSON.parse(init.body).token, token);
  });
  assert.equal(await api.claimCommercialAcquisition(token, otherId), false);
  assert.equal(calls, 0);
  assert.equal(await api.claimCommercialAcquisition(token, businessId), true);
  assert.equal(calls, 1);
});

test("company QR screens no longer contain or render the public placeholder", () => {
  assert.match(readFileSync("data/booking.ts", "utf8"), /commercial\\\/resolve[\s\S]*\[0-9a-f\]\{64\}/);
  for (const path of ["components/empresa/EmpresaConfigScreen.tsx", "components/empresa/EmpresaSetupGuide.tsx"]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /MOCK_LINK|go\.teso\.app\/b\/mi-negocio/);
    assert.match(source, /commercialQr\.url \? <View/);
    assert.match(source, /disabled=\{!commercialQr\.url\}/);
  }
});
