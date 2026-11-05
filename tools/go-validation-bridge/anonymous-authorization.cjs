"use strict";

/**
 * Prepared issuer-side repair for the local validation bridge, NOT Supabase Auth.
 * The existing bridge supplies its own signer. This module has no keys, cannot
 * validate a user or grant business access, and never replaces a caller token.
 * Not loaded by the application or the currently running bridge.
 */
function createAnonymousAuthorization({ issueToken, now = Date.now, lifetimeSeconds = 86400, renewBeforeSeconds = 60 }) {
  if (typeof issueToken !== "function" || typeof now !== "function"
    || !Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 2
    || !Number.isSafeInteger(renewBeforeSeconds) || renewBeforeSeconds < 0 || renewBeforeSeconds >= lifetimeSeconds) {
    throw new TypeError("Invalid anonymous issuer configuration");
  }
  let cached;
  return function authorizationFor(callerAuthorization) {
    // Even an invalid/expired caller token must reach verification unchanged.
    // Downgrading an invalid caller to anon would hide an authentication error.
    if (callerAuthorization !== undefined && callerAuthorization !== null) return callerAuthorization;
    const seconds = Math.floor(now() / 1000);
    if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("Invalid issuer clock");
    if (!cached || seconds < cached.issuedAt || seconds >= cached.expiresAt - renewBeforeSeconds) {
      const expiresAt = seconds + lifetimeSeconds;
      const token = issueToken({ role: "anon", exp: expiresAt });
      if (typeof token !== "string" || !token || /\s/.test(token)) throw new Error("Anonymous token could not be issued");
      cached = { value: "Bearer " + token, issuedAt: seconds, expiresAt };
    }
    return cached.value;
  };
}

module.exports = { createAnonymousAuthorization };
