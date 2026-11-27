import { randomUUID } from "node:crypto";
import { bearerHeader, supabaseRequest } from "./supabase";

export const CENTRAL_MODEL = "gpt-5.4-mini";
export const CENTRAL_MAX_CALLS = 4;
export const CENTRAL_MAX_OUTPUT = 1200; // Includes reasoning tokens, not just visible text.
export const CENTRAL_MAX_PAYLOAD_BYTES = 32768;
export const CENTRAL_CALL_RESERVE_MICRO_USD = 50000;
export class CentralAiError extends Error {
  constructor(readonly code: string, message: string, readonly status = 503) { super(message); }
}
export function centralSettings() {
  const secret = process.env.GO_CENTRAL_AI_LEDGER_SECRET;
  const enabled = process.env.GO_CENTRAL_AI_ENABLED === "true"
    && process.env.GO_CENTRAL_AI_TEST_MODE === "true"
    && process.env.GO_CENTRAL_AI_MODEL === CENTRAL_MODEL
    && !!process.env.OPENAI_API_KEY && !!secret && secret.length >= 64;
  return { enabled, model: CENTRAL_MODEL, output: CENTRAL_MAX_OUTPUT };
}

/** Caller JWT + a server-only capability. No service-role key or elevated booking identity. */
export async function centralControl(authorization: string | undefined, operation: string, payload: object = {}): Promise<Record<string, any>> {
  const secret = process.env.GO_CENTRAL_AI_LEDGER_SECRET;
  if (!secret || secret.length < 64) throw new CentralAiError("AI_BUDGET_UNAVAILABLE", "Falta verificar el control de gasto de la prueba.");
  const response = await supabaseRequest("/rest/v1/rpc/go_ai_test_control", {
    method: "POST", headers: { ...bearerHeader(authorization), "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: secret, p_operation: operation, p_payload: payload }),
  });
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) {
    const code = typeof result?.message === "string" && /^AI_[A-Z_]+$/.test(result.message) ? result.message : "AI_BUDGET_UNAVAILABLE";
    throw new CentralAiError(code, code === "AI_BUDGET_EXHAUSTED" ? "Se ha alcanzado el límite acumulado de la prueba. No se hará otra llamada."
      : code === "AI_CONCURRENT_REQUEST" ? "Ya hay una consulta o confirmación en curso. Espera su resultado."
      : code === "AI_REQUEST_EXISTS" ? "Esta consulta ya fue enviada. No se repetirá el consumo."
      : code === "AI_PROPOSAL_STALE" ? "La propuesta ha cambiado o caducado. Revisa de nuevo sus datos."
      : "La prueba no está habilitada o no se pudo verificar su presupuesto y autorización.", code === "AI_PROPOSAL_STALE" ? 409 : 503);
  }
  // 'current' has a legitimate null result when no proposal exists.
  if (result === null && operation !== "current" || result !== null && (typeof result !== "object" || Array.isArray(result)))
    throw new CentralAiError("AI_BUDGET_UNAVAILABLE", "No se pudo comprobar el estado de la prueba.");
  return result as Record<string, any>;
}

/** Standard text tariff, USD millionths. Cached input is deliberately charged at full rate. */
export function centralUsageCost(input: unknown, output: unknown): number {
  if (!Number.isSafeInteger(input) || Number(input) < 0 || !Number.isSafeInteger(output) || Number(output) < 0)
    throw new CentralAiError("AI_USAGE_UNKNOWN", "El proveedor no confirmó el consumo. Se mantiene la reserva máxima de presupuesto.");
  return Math.ceil((Number(input) * 75 + Number(output) * 450) / 100);
}

export async function reserveCentralTurn(authorization: string | undefined, requestId: string = randomUUID()) {
  await centralControl(authorization, "reserve", { id: requestId, maximum: CENTRAL_MAX_CALLS * CENTRAL_CALL_RESERVE_MICRO_USD });
  return requestId;
}

/** A failed/aborted/unknown provider call is never refunded automatically. */
export async function settleCentralTurn(authorization: string | undefined, id: string,
  usage: { input: number; output: number; cost: number; calls: number }, certain: boolean) {
  return centralControl(authorization, "settle", { id, ...usage, certain });
}
