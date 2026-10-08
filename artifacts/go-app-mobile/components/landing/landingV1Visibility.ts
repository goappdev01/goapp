/**
 * Public User V1 surface policy for the Landing. A complete architecture is
 * available only after the server-backed Admin access check succeeds.
 */
export const USER_V1_VISIBLE_PRIMARY_SATELLITES = [
  "bell",
  "list",
  "calendar",
  "settings",
  "mas",
] as const;

const USER_V1_SATELLITE_KEYS = new Set<string>(USER_V1_VISIBLE_PRIMARY_SATELLITES);

export function hasFullLandingArchitecture(serverAdminAllowed: unknown): boolean {
  return serverAdminAllowed === true;
}

export function isUserV1Landing(userMode: unknown, serverAdminAllowed: unknown): boolean {
  return userMode === true && !hasFullLandingArchitecture(serverAdminAllowed);
}

export function visibleLandingSatelliteKeys(keys: readonly string[], userV1: boolean): string[] {
  return userV1 ? keys.filter(key => USER_V1_SATELLITE_KEYS.has(key)) : [...keys];
}

export function visibleLandingContextAction(userV1: boolean, explicitlyVisibleInV1: unknown): boolean {
  return !userV1 || explicitlyVisibleInV1 === true;
}
