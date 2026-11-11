import { z } from "zod";

export const sportsEventKinds = ["football", "basketball", "tennis", "padel", "motorsport", "rugby", "handball", "volleyball", "other"] as const;
// These are internal ADMIN workspace states only. They do not represent an
// accepted purchase, payment, ticket transfer, or verified right of entry.
export const sportsRecordStates = ["draft", "available", "paused", "cancelled"] as const;
const shortText = (max = 160) => z.string().trim().max(max);
const optionalText = (max = 160) => shortText(max).optional().default("");
const safeUrl = z.string().trim().url().max(1000).optional().or(z.literal(""));
const dateTime = z.string().trim().max(64).refine(value => !value || (/(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))), "La fecha debe incluir su zona horaria.");
const eventSchema = z.object({
  key: z.string().trim().min(1).max(180), title: z.string().trim().min(1).max(180),
  sport: z.enum(sportsEventKinds), competition: optionalText(160), homeTeam: optionalText(120), awayTeam: optionalText(120),
  startsAt: dateTime, timeZone: optionalText(80), city: optionalText(120), region: optionalText(120), venue: optionalText(180),
  officialEventUrl: safeUrl,
}).strict();
const seatSchema = z.object({ stand: optionalText(100), section: optionalText(100), row: optionalText(40), seat: optionalText(40), quantity: z.number().int().min(1).max(20) }).strict();
const policySchema = z.object({ status: z.literal("unverified"), sourceUrl: safeUrl, checkedAt: z.string().trim().max(40).optional() }).strict();
const exchangeSchema = z.object({
  sport: z.enum(sportsEventKinds).optional(), competition: optionalText(160), team: optionalText(120),
  fromDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional().default(""),
  toDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional().default(""),
  zones: z.array(shortText(100)).max(20).default([]), minCashDifference: z.number().finite().min(0).optional(),
  maxCashDifference: z.number().finite().min(0).optional(), compatibleModes: z.array(z.enum(["ticket", "ticket_plus_cash", "cash_plus_ticket", "multiple"])).max(4).default([]),
}).strict().refine(value => value.minCashDifference === undefined || value.maxCashDifference === undefined || value.minCashDifference <= value.maxCashDifference,
  "La diferencia mínima no puede superar la máxima.").refine(value => !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
  "La fecha inicial no puede ser posterior a la final.");
const seasonEventSchema = z.object({ key: z.string().trim().min(1).max(180), title: z.string().trim().min(1).max(180), startsAt: dateTime,
  attendance: z.enum(["attend", "offer", "excluded", "unknown"]).default("unknown") }).strict();
const common = {
  id: z.string().uuid(), ownerUserId: z.string().uuid(), profile: z.literal("ADMIN"), version: z.number().int().nonnegative(),
  status: z.enum(sportsRecordStates), accessStatus: z.literal("unverified"), policy: policySchema,
};
const offerRecordSchema = z.object({ ...common, recordType: z.literal("offer"), event: eventSchema, seat: seatSchema,
    mode: z.enum(["sale", "exchange", "sale_or_exchange", "free", "share"]), price: z.number().finite().min(0).optional(),
    faceValue: z.number().finite().min(0).optional(), currency: z.literal("EUR").default("EUR"), exchange: exchangeSchema.optional(),
    ownerStatement: z.literal("self_declared"), }).strict();
const seasonPassRecordSchema = z.object({ ...common, recordType: z.literal("season_pass"), title: z.string().trim().min(1).max(180),
    sport: z.enum(sportsEventKinds), competition: optionalText(160), season: z.string().trim().min(1).max(40),
    venue: optionalText(180), seat: seatSchema, coveredEvents: z.array(seasonEventSchema).max(100), ownerStatement: z.literal("self_declared") }).strict();
const savedSearchRecordSchema = z.object({ ...common, recordType: z.literal("saved_search"), title: z.string().trim().min(1).max(180),
    sport: z.enum(sportsEventKinds).optional(), city: optionalText(120), region: optionalText(120), team: optionalText(120),
    competition: optionalText(160), venue: optionalText(180), fromDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/), maxPrice: z.number().finite().min(0).optional(),
    modes: z.array(z.enum(["sale", "exchange", "sale_or_exchange", "free", "share"])).max(5), }).strict()
  .superRefine((value, context) => {
    if (value.fromDate && value.toDate && value.fromDate > value.toDate)
      context.addIssue({ code: "custom", path: ["toDate"], message: "La fecha final no puede ser anterior a la inicial." });
  });
export const sportsEventRecordSchema = z.union([offerRecordSchema, seasonPassRecordSchema, savedSearchRecordSchema]).superRefine((value, context) => {
  if (value.recordType !== "offer") return;
  if (["sale", "sale_or_exchange"].includes(value.mode) && value.price === undefined)
    context.addIssue({ code: "custom", path: ["price"], message: "Indica el precio solicitado para una oferta de venta." });
  if (["exchange", "sale_or_exchange"].includes(value.mode) && !value.exchange)
    context.addIssue({ code: "custom", path: ["exchange"], message: "Completa las preferencias de intercambio." });
  if ((value.mode === "sale" && value.exchange) || (value.mode === "exchange" && value.price !== undefined)
    || (["free", "share"].includes(value.mode) && (value.price !== undefined || value.exchange)))
    context.addIssue({ code: "custom", path: ["mode"], message: "El importe y las preferencias deben corresponder a la modalidad seleccionada." });
});
export type SportsEventRecord = z.infer<typeof sportsEventRecordSchema>;
export function canUseSportsEvents(profile: string, authorized: boolean, userId: string | null | undefined): boolean {
  return profile === "ADMIN" && authorized && !!userId;
}
