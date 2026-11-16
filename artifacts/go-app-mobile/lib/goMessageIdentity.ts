import type { AuthSession } from "./authSession";

export type GoAccountIdentity = { userId: string | null; phone: string };

/** A phone is optional contact data, never the account or device identifier. */
export function goAccountIdentity(session: AuthSession | null): GoAccountIdentity {
  const user = session?.user;
  if (!user?.id) return { userId: null, phone: "" };
  // Auth's confirmed phone only: profile/user_metadata and old local drafts are unverified.
  const confirmed = typeof user.phone_confirmed_at === "string"
    && Number.isFinite(Date.parse(user.phone_confirmed_at));
  return { userId: user.id, phone: confirmed && typeof user.phone === "string" ? user.phone : "" };
}

/** Normalize an explicit contact number for wa.me; never infer a device's SIM number. */
export function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  const withCc = digits.length === 9 ? `34${digits}` : digits;
  return withCc.length >= 8 && withCc.length <= 15 ? withCc : null;
}

export type ProposalParticipant = {
  phone: string;
  kind: string;
  senderPhone?: string;
  receiverPhone?: string;
  ownerUserId?: string;
  direction?: string;
  intentLabel?: string;
};

/** kind records our side of the local entry; sending needs only the counterpart's number. */
export function resolveProposalDestination(
  entry: ProposalParticipant,
  identity: GoAccountIdentity,
): { targetPhone: string | null } {
  if (!identity.userId || entry.ownerUserId && entry.ownerUserId !== identity.userId
    || entry.direction === "self") return { targetPhone: null };
  const sender = normalizePhoneForWhatsApp(entry.senderPhone);
  const receiver = normalizePhoneForWhatsApp(entry.receiverPhone);
  if (sender && sender === receiver) return { targetPhone: null };
  const targetPhone = entry.kind === "sent" ? receiver || normalizePhoneForWhatsApp(entry.phone)
    : entry.kind === "received" ? sender || normalizePhoneForWhatsApp(entry.phone) : null;
  return { targetPhone: targetPhone && targetPhone !== normalizePhoneForWhatsApp(identity.phone) ? targetPhone : null };
}
