/** Synthetic, memory-only presentation model. No API, storage, ticket codes or payment adapters. */
export const DEMO_SPORTS = [
  ["football", "Fútbol", "⚽"],
  ["basketball", "Baloncesto", "🏀"],
  ["baseball", "Béisbol", "⚾"],
  ["tennis", "Tenis", "🎾"],
  ["padel", "Pádel", "◉"],
  ["rugby", "Rugby", "🏉"],
  ["motorsport", "Motor", "🏁"],
  ["handball", "Balonmano", "●"],
  ["volleyball", "Voleibol", "🏐"],
  ["hockey", "Hockey", "🏑"],
  ["golf", "Golf", "⛳"],
  ["cycling", "Ciclismo", "🚴"],
  ["athletics", "Atletismo", "🏃"],
  ["swimming", "Natación", "🏊"],
  ["boxing", "Boxeo", "🥊"],
  ["futsal", "Fútbol sala", "⚽"],
  ["badminton", "Bádminton", "◈"],
  ["tabletennis", "Tenis de mesa", "🏓"],
  ["waterpolo", "Waterpolo", "◉"],
  ["gymnastics", "Gimnasia", "★"],
  ["skating", "Patinaje", "⛸"],
  ["ski", "Esquí", "⛷"],
  ["surf", "Surf", "🏄"],
  ["sailing", "Vela", "⛵"],
  ["equestrian", "Hípica", "♞"],
  ["esports", "eSports", "🎮"],
  ["other", "Otros", "+"],
].map(([id, label, symbol]) => ({ id, label, symbol }));
export type DemoClub = {
  id: string;
  sport: string;
  label: string;
  city: string;
  initials: string;
  color: string;
};
export const DEMO_CLUBS: DemoClub[] = [
  {
    id: "real-madrid",
    sport: "football",
    label: "Real Madrid",
    city: "Madrid",
    initials: "RM",
    color: "#f1e4b3",
  },
  {
    id: "barcelona",
    sport: "football",
    label: "FC Barcelona",
    city: "Barcelona",
    initials: "FCB",
    color: "#d994b1",
  },
  {
    id: "valencia",
    sport: "football",
    label: "Valencia CF",
    city: "Valencia",
    initials: "VCF",
    color: "#ffba79",
  },
  {
    id: "atletico",
    sport: "football",
    label: "Atlético de Madrid",
    city: "Madrid",
    initials: "ATM",
    color: "#f89999",
  },
  ...DEMO_SPORTS.filter((s) => s.id !== "football").flatMap((s) =>
    ["Madrid", "Barcelona"].map((city, i) => ({
      id: `${s.id}-${i}`,
      sport: s.id,
      label: `${s.label} ${city} · ficticio`,
      city,
      initials: i ? "B" : "M",
      color: "#86efac",
    })),
  ),
];
export type DemoEvent = {
  id: string;
  clubId: string;
  sport: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  competition: string;
  excluded: boolean;
};
// Deliberately unrelated to any official fixture, stadium map or inventory.
export const DEMO_EVENTS: DemoEvent[] = DEMO_CLUBS.flatMap((club) =>
  Array.from({ length: 30 }, (_, index) => ({
    id: `${club.id}-demo-${index + 1}`,
    clubId: club.id,
    sport: club.sport,
    title: `${club.label} · encuentro de muestra ${index + 1}`,
    date: new Date(Date.UTC(2027, 0, 3 + index * 7)).toISOString().slice(0, 10),
    time: index % 2 ? "18:00" : "20:00",
    venue: `Recinto ${club.city} · DEMO`,
    city: club.city,
    competition: index % 3 === 2 ? "Copa GO · ficticia" : "Liga GO · ficticia",
    excluded: index === 5,
  })),
);
export const demoEvent = (id: string) => DEMO_EVENTS.find((e) => e.id === id)!;
export const DEMO_ZONES = ["Norte", "Este", "Sur", "Oeste"];
export type DemoTicket = {
  eventId: string;
  zone: string;
  row: number;
  seats: number[];
};
export type DemoMode =
  "sale" | "exchange" | "sale_or_exchange" | "free" | "share";
export const DEMO_MODES: { id: DemoMode; label: string }[] = [
  { id: "sale", label: "Vender" },
  { id: "exchange", label: "Intercambiar" },
  { id: "sale_or_exchange", label: "Vender o intercambiar" },
  { id: "free", label: "Ceder gratis" },
  { id: "share", label: "Compartir propuesta" },
];
export type DemoFilters = {
  sport: string;
  club: string;
  city: string;
  competition: string;
  venue: string;
  from: string;
  to: string;
  max: string;
  mode: string;
};
export const emptyDemoFilters = (): DemoFilters => ({
  sport: "",
  club: "",
  city: "",
  competition: "",
  venue: "",
  from: "",
  to: "",
  max: "",
  mode: "",
});
export type DemoPreferences = {
  zones: string[];
  from: string;
  to: string;
  min?: number;
  max?: number;
};
export type DemoOffer = {
  id: string;
  tickets: DemoTicket[];
  mode: DemoMode;
  price: number;
  conditions: string;
  status: "draft" | "available" | "paused" | "withdrawn";
  passId?: string;
  preferences?: DemoPreferences;
  exchangeDifference?: number;
  recipient?: "me" | "other";
  desiredTickets?: DemoTicket[];
  counterparty?: string;
};
export type DemoListing = {
  id: string;
  ticket: DemoTicket;
  mode: DemoMode;
  price: number;
  holder: string;
};
export const DEMO_LISTINGS: DemoListing[] = DEMO_CLUBS.flatMap((club, i) =>
  [0, 1, 2].map((n) => ({
    id: `listing-${club.id}-${n}`,
    ticket: {
      eventId: `${club.id}-demo-${n + 1}`,
      zone: DEMO_ZONES[n],
      row: n + 2,
      seats: n === 2 ? [8, 9] : [8],
    },
    mode: (["exchange", "sale", "free"] as const)[n],
    price: n === 2 ? 0 : 75 + (i % 3) * 25,
    holder: ["Alex · ficticio", "Cris · ficticio", "Dani · ficticio"][n],
  })),
);
export function filterDemoListings(filters: DemoFilters): DemoListing[] {
  const norm = (s: string) => s.trim().toLocaleLowerCase("es");
  return DEMO_LISTINGS.filter((l) => {
    const e = demoEvent(l.ticket.eventId);
    return (
      (!filters.sport || e.sport === filters.sport) &&
      (!filters.club || e.clubId === filters.club) &&
      (!filters.city || norm(e.city).includes(norm(filters.city))) &&
      (!filters.venue || norm(e.venue).includes(norm(filters.venue))) &&
      (!filters.competition || e.competition === filters.competition) &&
      (!filters.from || e.date >= filters.from) &&
      (!filters.to || e.date <= filters.to) &&
      (!filters.max || l.price <= Number(filters.max.replace(",", "."))) &&
      (!filters.mode || l.mode === filters.mode)
    );
  });
}
export type DemoOperationStatus =
  | "proposal"
  | "pending"
  | "accepted"
  | "external_pending"
  | "cancelled"
  | "rejected"
  | "disputed"
  | "invalidated";
export const DEMO_STATUS: Record<DemoOperationStatus, string> = {
  proposal: "Propuesta demo",
  pending: "Pendiente de aceptación",
  accepted: "Aceptada en demo",
  external_pending: "Pendiente de validación / transferencia externa",
  cancelled: "Cancelada",
  rejected: "Rechazada en demo",
  disputed: "Disputada en demo",
  invalidated: "Invalidada en demo",
};
export type DemoOperation = {
  id: string;
  have: DemoTicket[];
  want: DemoTicket[];
  mode: DemoMode;
  difference: number;
  recipient: "me" | "other";
  conditions: string;
  status: DemoOperationStatus;
  offerId?: string;
  perspective?: "buyer";
  preferences?: DemoPreferences;
  salePrice?: number;
  counterparty?: string;
};
export type DemoPass = {
  id: string;
  clubId: string;
  title: string;
  seats: number[];
  selected: string[];
};
export type DemoState = {
  offers: DemoOffer[];
  operations: DemoOperation[];
  passes: DemoPass[];
  savedFilters: DemoFilters[];
  audit: string[];
};
export const ticketKeys = (tickets: DemoTicket[]) =>
  tickets.flatMap((t) =>
    t.seats.map((seat) => `${t.eventId}/${t.zone}/${t.row}/${seat}`),
  );
const active = (op: DemoOperation) =>
  ["proposal", "pending", "accepted", "external_pending", "disputed"].includes(
    op.status,
  );
function validateTickets(tickets: DemoTicket[]) {
  for (const t of tickets) {
    const e = demoEvent(t.eventId);
    if (!e || e.excluded)
      throw new Error("Evento excluido del ejemplo: no permite propuestas.");
    if (
      !DEMO_ZONES.includes(t.zone) ||
      !Number.isInteger(t.row) ||
      t.row < 1 ||
      t.row > 5 ||
      !t.seats.length ||
      t.seats.length > 12 ||
      t.seats.some((s) => !Number.isInteger(s) || s < 1 || s > 12)
    )
      throw new Error("Revisa las localidades demo.");
  }
  const keys = ticketKeys(tickets);
  if (new Set(keys).size !== keys.length)
    throw new Error("Hay localidades repetidas para el mismo evento.");
}
export function createDemoState(): DemoState {
  return {
    offers: [
      {
        id: "my-demo-offer",
        tickets: [
          { eventId: "real-madrid-demo-1", zone: "Norte", row: 3, seats: [12] },
        ],
        mode: "exchange",
        price: 75,
        conditions: "Solo propuesta de muestra",
        status: "draft",
      },
    ],
    operations: [],
    passes: [
      {
        id: "pass-madrid",
        clubId: "real-madrid",
        title: "Abono Madrid · DEMO 2027",
        seats: [11, 12],
        selected: [],
      },
      {
        id: "pass-barcelona",
        clubId: "barcelona",
        title: "Abono Barcelona · DEMO 2027",
        seats: [10],
        selected: [],
      },
    ],
    savedFilters: [],
    audit: [],
  };
}
const audit = (s: DemoState, message: string) =>
  [...s.audit, message].slice(-50);
export function saveDemoOffer(s: DemoState, offer: DemoOffer): DemoState {
  if (!offer.tickets.length)
    throw new Error("Selecciona al menos una localidad.");
  validateTickets(offer.tickets);
  if (!Number.isFinite(offer.price) || offer.price < 0)
    throw new Error("El precio debe ser válido y no negativo.");
  if (
    offer.exchangeDifference !== undefined &&
    (!Number.isFinite(offer.exchangeDifference) || offer.exchangeDifference < 0)
  )
    throw new Error("Revisa la diferencia simulada.");
  const keys = ticketKeys(offer.tickets);
  if (
    s.operations.some(
      (op) =>
        active(op) &&
        ticketKeys([...op.have, ...op.want]).some((k) => keys.includes(k)),
    )
  )
    throw new Error(
      "Localidades bloqueadas por una operación demo. Cancélala antes de editar.",
    );
  if (
    offer.status !== "withdrawn" &&
    s.offers.some(
      (o) =>
        o.id !== offer.id &&
        o.status !== "withdrawn" &&
        ticketKeys(o.tickets).some((k) => keys.includes(k)),
    )
  )
    throw new Error("Ya existe una oferta demo para ese asiento y evento.");
  const normalized = {
    ...offer,
    passId: offer.passId ?? s.offers.find((o) => o.id === offer.id)?.passId,
    price: ["free", "share"].includes(offer.mode) ? 0 : offer.price,
  };
  return {
    ...s,
    offers: [...s.offers.filter((o) => o.id !== offer.id), normalized],
    audit: audit(s, `Oferta ${offer.id}: ${offer.status}`),
  };
}
export function createDemoOperation(
  s: DemoState,
  operation: DemoOperation,
): DemoState {
  if (s.operations.some((o) => o.id === operation.id)) return s; // Local idempotency, never a commercial reservation.
  if (
    operation.perspective === "buyer"
      ? !operation.want.length
      : !operation.have.length
  )
    throw new Error("Selecciona las localidades de la propuesta.");
  const exchange = ["exchange", "sale_or_exchange"].includes(operation.mode);
  if (exchange && !operation.want.length)
    throw new Error("Selecciona QUIERO para intercambiar.");
  if (operation.perspective === "buyer" && exchange)
    throw new Error("Configura TENGO para proponer un intercambio.");
  validateTickets([...operation.have, ...operation.want]);
  if (
    !Number.isFinite(operation.difference) ||
    operation.difference < 0 ||
    (["free", "share"].includes(operation.mode) && operation.difference !== 0)
  )
    throw new Error("Revisa la diferencia simulada.");
  if (
    operation.mode === "sale_or_exchange" &&
    (operation.salePrice === undefined ||
      !Number.isFinite(operation.salePrice) ||
      operation.salePrice < 0)
  )
    throw new Error("Indica el precio alternativo de venta.");
  const keys = ticketKeys([...operation.have, ...operation.want]);
  if (
    s.operations.some(
      (o) =>
        active(o) &&
        ticketKeys([...o.have, ...o.want]).some((k) => keys.includes(k)),
    )
  )
    throw new Error("Localidad bloqueada en otra operación demo.");
  if (operation.offerId) {
    const offer = s.offers.find((o) => o.id === operation.offerId);
    if (!offer || ["paused", "withdrawn"].includes(offer.status))
      throw new Error("La oferta propia no está disponible en la demo.");
  }
  if (
    s.offers.some(
      (o) =>
        o.status !== "withdrawn" &&
        o.id !== operation.offerId &&
        ticketKeys(o.tickets).some((k) =>
          ticketKeys(operation.have).includes(k),
        ),
    )
  )
    throw new Error(
      "Selecciona la oferta propia existente para estas localidades.",
    );
  return {
    ...s,
    operations: [...s.operations, { ...operation, status: "proposal" }],
    audit: audit(s, `Operación ${operation.id}: propuesta demo`),
  };
}
const transitions: Record<DemoOperationStatus, DemoOperationStatus[]> = {
  proposal: ["pending", "cancelled"],
  pending: ["accepted", "rejected", "cancelled"],
  accepted: ["external_pending", "cancelled", "disputed"],
  external_pending: ["cancelled", "disputed", "invalidated"],
  disputed: ["cancelled", "invalidated"],
  cancelled: [],
  rejected: [],
  invalidated: [],
};
export function transitionDemoOperation(
  s: DemoState,
  id: string,
  status: DemoOperationStatus,
): DemoState {
  const op = s.operations.find((o) => o.id === id);
  if (!op || op.status === status) return s;
  if (!transitions[op.status].includes(status))
    throw new Error("Ese cambio de estado no está permitido en la demo.");
  return {
    ...s,
    operations: s.operations.map((o) => (o.id === id ? { ...o, status } : o)),
    audit: audit(s, `Operación ${id}: ${DEMO_STATUS[status]}`),
  };
}
export function stageDemoPass(
  s: DemoState,
  passId: string,
  eventIds: string[],
  mode: DemoMode,
  price: number,
): DemoState {
  const pass = s.passes.find((p) => p.id === passId);
  if (!pass || !eventIds.length)
    throw new Error("Selecciona partidos del abono.");
  let next = s;
  for (const eventId of [...new Set(eventIds)]) {
    const event = demoEvent(eventId);
    if (!event || event.clubId !== pass.clubId)
      throw new Error("Este evento no pertenece al abono demo.");
    const tickets = [
        { eventId, zone: "Norte", row: 3, seats: [...pass.seats] },
      ],
      keys = ticketKeys(tickets);
    const existing = next.offers.filter(
      (o) =>
        o.status !== "withdrawn" &&
        ticketKeys(o.tickets).some((k) => keys.includes(k)),
    );
    if (
      existing.length > 1 ||
      existing.some((o) => ticketKeys(o.tickets).some((k) => !keys.includes(k)))
    )
      throw new Error(
        "Ya hay una combinación de ofertas para este evento; edítala individualmente.",
      );
    const id = existing[0]?.id ?? `pass-offer-${pass.id}-${eventId}`;
    next = saveDemoOffer(next, {
      id,
      passId,
      tickets,
      mode,
      price,
      conditions: "Derecho por evento · restricciones sin verificar",
      status: "draft",
    });
  }
  return {
    ...next,
    passes: next.passes.map((p) =>
      p.id === passId ? { ...p, selected: [...new Set(eventIds)] } : p,
    ),
  };
}
export function demoScenario(
  kind: "equal" | "cash",
): Omit<DemoOperation, "id" | "status"> {
  return {
    have: [
      { eventId: "real-madrid-demo-1", zone: "Norte", row: 3, seats: [12] },
    ],
    want: [{ eventId: "barcelona-demo-1", zone: "Este", row: 2, seats: [8] }],
    mode: "exchange",
    difference: kind === "cash" ? 50 : 0,
    recipient: "other",
    conditions: "Escenario sintético, sin entrega ni cobro",
    offerId: "my-demo-offer",
  };
}
