/** Technical safeguards, not a legal opinion or an alternative authorization engine. */
export const GO_PRIVACY_CONTROLS_VERSION = "2026-11-27.1";
const forbidden = /^(?:__proto__|prototype|constructor|password|secret|token|authorization|cookie|credentials?|api[_-]?key|access[_-]?token|refresh[_-]?token)$/i;
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function cloneData(value: unknown, depth: number, budget: { nodes: number }): JsonValue {
  if (--budget.nodes < 0 || depth > 8) throw Error("CONTEXT_TOO_COMPLEX");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || !value) throw Error("CONTEXT_NOT_DATA");
  const result: Record<string, JsonValue> = Object.create(null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || "toJSON" in value) throw Error("CONTEXT_NOT_DATA");
  if (Array.isArray(value)) {
    if (value.length > 256) throw Error("CONTEXT_TOO_COMPLEX");
    const list: JsonValue[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor)) throw Error("CONTEXT_NOT_DATA");
      list.push(cloneData(descriptor.value, depth + 1, budget));
    }
    return list;
  }
  const prototype = Object.getPrototypeOf(value);
  // Objects from a different JS realm may have a different Object.prototype.
  if (prototype !== null && Object.getPrototypeOf(prototype) !== null) throw Error("CONTEXT_NOT_DATA");
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable) continue;
    if (forbidden.test(key) || !("value" in descriptor)) throw Error("CONTEXT_NOT_DATA");
    result[key] = cloneData(descriptor.value, depth + 1, budget);
  }
  return result;
}

/** Explicit fields only. Does not inspect arbitrary getters or claim to anonymize free text. */
export function projectAllowedFields<T extends object>(source: T, fields: readonly (keyof T & string)[]): Partial<T> {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw Error("CONTEXT_NOT_DATA");
  const projected: Record<string, JsonValue> = Object.create(null), budget = { nodes: 4096 };
  for (const field of fields) {
    if (forbidden.test(field)) throw Error("CONTEXT_FIELD_FORBIDDEN");
    const descriptor = Object.getOwnPropertyDescriptor(source, field);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw Error("CONTEXT_NOT_DATA");
    if (descriptor.value !== undefined) projected[field] = cloneData(descriptor.value, 0, budget);
  }
  return projected as Partial<T>;
}

export type DisclosureReview = {
  necessary: boolean; purposeReviewed: boolean; recipientReviewed: boolean;
  legalBasis: "consent" | "contract" | "legal-obligation" | "vital-interests" | "public-task" | "legitimate-interests" | "pending";
  consentGranted: boolean; consentWithdrawn: boolean;
  actorVerified: boolean; sameAccount: boolean; actionPermitted: boolean;
  audience: "adult" | "under14" | "14to17" | "unknown";
  enhancedSafeguardsReviewed: boolean; guardianConsentVerified: boolean;
  vulnerableContext: boolean; specialCategoryData: boolean; article9ConditionReviewed: boolean;
};
/** Use reviewed facts from existing identity/legal controls, never flags supplied by an AI model. */
export function evaluateDisclosure(review: DisclosureReview): { allowed: boolean; reason: string; reviewAudience: boolean } {
  const deny = (reason: string) => ({ allowed: false, reason, reviewAudience: review.audience === "unknown" });
  if (!["consent", "contract", "legal-obligation", "vital-interests", "public-task", "legitimate-interests", "pending"].includes(review.legalBasis)
    || !["adult", "under14", "14to17", "unknown"].includes(review.audience)
    || [review.necessary,review.purposeReviewed,review.recipientReviewed,review.consentGranted,review.consentWithdrawn,
      review.actorVerified,review.sameAccount,review.actionPermitted,review.enhancedSafeguardsReviewed,
      review.guardianConsentVerified,review.vulnerableContext,review.specialCategoryData,review.article9ConditionReviewed].some(value=>typeof value!=="boolean")) return deny("REVIEW_REQUIRED");
  if (!review.actorVerified || !review.sameAccount || !review.actionPermitted) return deny("ACCESS_DENIED");
  if (!review.necessary || !review.purposeReviewed || !review.recipientReviewed || review.legalBasis === "pending") return deny("REVIEW_REQUIRED");
  if (review.legalBasis === "consent" && (!review.consentGranted || review.consentWithdrawn)) return deny("CONSENT_REQUIRED");
  if (review.legalBasis === "consent" && review.audience === "under14" && !review.guardianConsentVerified) return deny("GUARDIAN_REVIEW_REQUIRED");
  if ((review.vulnerableContext || ["under14", "14to17"].includes(review.audience)) && !review.enhancedSafeguardsReviewed) return deny("SAFEGUARDS_REVIEW_REQUIRED");
  if (review.specialCategoryData && !review.article9ConditionReviewed) return deny("ARTICLE9_REVIEW_REQUIRED");
  return { allowed: true, reason: "REVIEWED_SCOPE", reviewAudience: review.audience === "unknown" };
}

export type HumanControlReview = {
  enabledByUser: boolean; actorVerified: boolean; actionPermitted: boolean;
  requestedBy: "human" | "model" | "external-data";
  sensitiveOperation: boolean; confirmedRevision: string | null; currentRevision: string;
  interventionAvailable: boolean; stopped: boolean;
};
/** Complements existing confirmations; this function never executes or rolls back an action. */
export function evaluateHumanControl(review: HumanControlReview): { allowed: boolean; reason: string } {
  if (![review.enabledByUser,review.actorVerified,review.actionPermitted,review.sensitiveOperation,review.interventionAvailable,review.stopped].every(value=>typeof value==="boolean")
    || !["human","model","external-data"].includes(review.requestedBy) || typeof review.currentRevision!=="string"
    || review.confirmedRevision!==null&&typeof review.confirmedRevision!=="string") return {allowed:false,reason:"HUMAN_CONTROL_REQUIRED"};
  if (review.stopped) return { allowed: false, reason: "STOPPED" };
  if (!review.actorVerified || !review.actionPermitted) return { allowed: false, reason: "ACCESS_DENIED" };
  if (!review.enabledByUser || !review.interventionAvailable) return { allowed: false, reason: "HUMAN_CONTROL_REQUIRED" };
  if (review.sensitiveOperation && (review.requestedBy !== "human" || !review.currentRevision
    || review.confirmedRevision !== review.currentRevision)) return { allowed: false, reason: "EXACT_CONFIRMATION_REQUIRED" };
  return { allowed: true, reason: "REVIEWED_SCOPE" };
}

const auditModules = ["identity", "central-ai", "booking-ai", "reservations", "shopping", "notes", "communication", "location", "catalog", "support", "finance", "boards", "sports", "commercial", "notifications", "printing", "agents"] as const;
const auditOutcomes = ["allowed", "blocked", "cancelled", "failed", "completed"] as const;
const auditReasons = ["ACCESS_DENIED", "REVIEW_REQUIRED", "CONSENT_REQUIRED", "GUARDIAN_REVIEW_REQUIRED", "SAFEGUARDS_REVIEW_REQUIRED", "ARTICLE9_REVIEW_REQUIRED", "STOPPED", "HUMAN_CONTROL_REQUIRED", "EXACT_CONFIRMATION_REQUIRED", "REVIEWED_SCOPE", "UNAVAILABLE"] as const;
/** Metadata projection only; no sink, telemetry, IDs, content, timestamps or new retention policy. */
export function minimalComplianceEvent(input: { module: string; outcome: string; reason: string }) {
  if (!(auditModules as readonly string[]).includes(input.module) || !(auditOutcomes as readonly string[]).includes(input.outcome)
    || !(auditReasons as readonly string[]).includes(input.reason)) throw Error("AUDIT_METADATA_INVALID");
  return Object.freeze({ version: GO_PRIVACY_CONTROLS_VERSION, module: input.module, outcome: input.outcome, reason: input.reason });
}
