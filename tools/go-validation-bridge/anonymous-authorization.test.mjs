import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createAnonymousAuthorization } = createRequire(import.meta.url)("./anonymous-authorization.cjs");

const start = Date.parse("2026-11-05T12:00:00Z");
function issuer() {
  let time = start;
  const claims = [];
  const authorization = createAnonymousAuthorization({
    now: () => time, issueToken: value => { claims.push(value); return `test-only-${value.exp}`; },
  });
  return { authorization, claims, advance: ms => { time += ms; } };
}

test("reproduces the current bridge failure: a startup-only credential expires after 24h", () => {
  const startupExpiration = Math.floor(start / 1000) + 86400;
  const afterSuspension = Math.floor((start + 86400001) / 1000);
  assert.ok(startupExpiration <= afterSuspension);
});

test("issuer repair renews after 24h or sleep without restarting any server", () => {
  const f = issuer(); const initial = f.authorization();
  f.advance(2 * 86400000);
  const next = f.authorization();
  assert.notEqual(next, initial);
  assert.equal(f.claims.length, 2);
  assert.deepEqual(Object.keys(f.claims[1]).sort(), ["exp", "role"]);
  assert.equal(f.claims[1].role, "anon");
  assert.equal(f.claims[1].exp, Math.floor((start + 2 * 86400000) / 1000) + 86400);
});

test("reuses a valid anonymous token and renews at the pre-expiry boundary", () => {
  const f = issuer(); const initial = f.authorization();
  f.advance(86339000); assert.equal(f.authorization(), initial);
  f.advance(1000); assert.notEqual(f.authorization(), initial);
  assert.equal(f.claims.length, 2);
});

test("never substitutes a caller token, including expired and malformed tokens", () => {
  const f = issuer();
  for (const value of ["Bearer test-user", "Bearer expired-user", "invalid", ""]) assert.equal(f.authorization(value), value);
  assert.equal(f.claims.length, 0);
});

test("clock reversal renews rather than trusting a credential minted in the future", () => {
  const f = issuer(); const first = f.authorization();
  f.advance(-100000); assert.notEqual(f.authorization(), first);
});

test("issuer failure cannot reuse an expired token or promote anon to a user", () => {
  let time = start, fail = false;
  const get = createAnonymousAuthorization({ now: () => time, issueToken: claims => {
    assert.equal(claims.role, "anon"); if (fail) throw Error("issuer unavailable"); return "test-only";
  } });
  get(); time += 86400000; fail = true;
  assert.throws(() => get(), /issuer unavailable/);
});

test("rejects invalid configuration and unusable signer responses", () => {
  for (const value of [null, "", "invalid token"]) {
    const get = createAnonymousAuthorization({ issueToken: () => value });
    assert.throws(() => get(), /could not be issued/);
  }
  assert.throws(() => createAnonymousAuthorization({ issueToken() {}, lifetimeSeconds: 60, renewBeforeSeconds: 60 }));
  assert.throws(() => createAnonymousAuthorization({ issueToken() {}, now: () => NaN })(), /clock/);
});
