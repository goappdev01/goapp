import React, { useContext, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { GoNavigationHand } from "@/components/ui/GoNavigationHand";
import { GoNavigationFloating } from "@/components/ui/GoNavigationFloating";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import {
  DEMO_CLUBS,
  DEMO_EVENTS,
  DEMO_MODES,
  DEMO_SPORTS,
  DEMO_STATUS,
  DEMO_ZONES,
  createDemoOperation,
  createDemoState,
  demoEvent,
  demoScenario,
  emptyDemoFilters,
  filterDemoListings,
  saveDemoOffer,
  stageDemoPass,
  transitionDemoOperation,
  type DemoFilters,
  type DemoListing,
  type DemoMode,
  type DemoOffer,
  type DemoOperationStatus,
  type DemoPreferences,
  type DemoState,
  type DemoTicket,
} from "./sportsEventsDemoModel";

type PickContext = {
  side: "have" | "want";
  append: boolean;
  editIndex: number | null;
};
type Screen =
  | ((
      | { name: "sports" }
      | { name: "clubs"; sport: string }
      | { name: "events"; clubId: string }
      | { name: "seats"; eventId: string }
    ) & { pick?: PickContext })
  | { name: "compose" }
  | { name: "summary"; id: string }
  | { name: "search" }
  | { name: "detail"; listing: DemoListing }
  | { name: "passes" }
  | { name: "pass"; id: string }
  | { name: "offers" }
  | { name: "operations" };
type OrbitItem = { id: string; label: string; symbol: string; color?: string };
const euro = (n: number) =>
  `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;
const dateLabel = (date: string) =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const modeLabel = (mode: DemoMode) =>
  DEMO_MODES.find((m) => m.id === mode)!.label;
const preferencesLabel = (p?: DemoPreferences) =>
  p
    ? [
        p.zones.length ? `Zonas deseadas: ${p.zones.join(", ")}` : "",
        p.from || p.to
          ? `Fechas: ${p.from || "abiertas"} a ${p.to || "abiertas"}`
          : "",
        p.min !== undefined || p.max !== undefined
          ? `Diferencia: ${p.min ?? 0} a ${p.max ?? "sin límite"} EUR`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

function Button({
  label,
  onPress,
  selected = false,
  disabled = false,
  primary = false,
  compact = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  primary?: boolean;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        compact && s.compactButton,
        (selected || primary) && s.selected,
        disabled && { opacity: 0.42 },
      ]}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={[s.buttonText, compact && s.compactButtonText, (selected || primary) && s.selectedText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
const zoneLabel: Record<string, string> = {
  Norte: "Fondo Norte", Este: "Lateral Este", Sur: "Fondo Sur",
  Oeste: "Lateral Oeste", Tribuna: "Tribuna", VIP: "VIP",
};
/** A local, deliberately schematic stadium. Every marked zone is selectable. */
function StadiumMap({ zone, onSelect }: { zone: string; onSelect: (zone: string) => void }) {
  return <View style={s.stadium} accessibilityLabel="Esquema orientativo de zonas del estadio">
    <View style={s.stadiumOval} />
    <View style={s.stadiumField}>
      <View style={s.stadiumMidline} /><View style={s.stadiumCircle} />
    </View>
    {DEMO_ZONES.map((item) => <TouchableOpacity
      key={item} accessibilityRole="button" accessibilityLabel={`Zona ${zoneLabel[item]}`}
      accessibilityState={{ selected: zone === item }} onPress={() => onSelect(item)}
      style={[s.stadiumZone, s[`zone${item}` as keyof typeof s] as object, zone === item && s.stadiumZoneSelected]}
    ><Text numberOfLines={1} adjustsFontSizeToFit style={[s.stadiumZoneText, zone === item && s.stadiumZoneTextSelected]}>{zoneLabel[item]}</Text></TouchableOpacity>)}
  </View>;
}
function Field({
  label,
  value,
  onChange,
  numeric = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8d9e99"
        keyboardType={numeric ? "decimal-pad" : "default"}
        maxLength={240}
      />
    </View>
  );
}
function Orbit({
  items,
  onSelect,
  center,
}: {
  items: OrbitItem[];
  onSelect: (id: string) => void;
  center: string;
}) {
  const [width, setWidth] = useState(300),
    [page, setPage] = useState(0);
  const { fontScale } = useWindowDimensions();
  const count = 6,
    pages = Math.max(1, Math.ceil(items.length / count)),
    current = Math.min(page, pages - 1),
    shown = items.slice(current * count, (current + 1) * count);
  const size = Math.min(94, width * 0.27),
    radius = (width - size) / 2 - 2;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View
        style={fontScale > 1.35 ? s.wrap : { height: width, minHeight: 280 }}
      >
        {fontScale <= 1.35 && (
          <View
            pointerEvents="none"
            style={[
              s.orbitRing,
              {
                width: radius * 2,
                height: radius * 2,
                left: width / 2 - radius,
                top: width / 2 - radius,
              },
            ]}
          >
            <Text style={s.orbitCenter}>GO</Text>
            <Text style={s.small}>{center}</Text>
          </View>
        )}
        {shown.map((item, i) => {
          const angle = -Math.PI / 2 + (i * Math.PI * 2) / shown.length;
          return (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => onSelect(item.id)}
              style={[
                s.orbit,
                fontScale > 1.35
                  ? { width: "47%", minHeight: 100 }
                  : {
                      position: "absolute",
                      width: size,
                      minHeight: size,
                      left: width / 2 + Math.cos(angle) * radius - size / 2,
                      top: width / 2 + Math.sin(angle) * radius - size / 2,
                    },
              ]}
            >
              <Text style={[s.orbitSymbol, { color: item.color ?? "#1f7654" }]}>
                {item.symbol}
              </Text>
              <Text style={s.orbitLabel}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {pages > 1 && (
        <View style={s.wrap}>
          <Button
            label="Anteriores"
            disabled={current === 0}
            onPress={() => setPage(current - 1)}
          />
          <Text style={s.page}>
            {current + 1} / {pages}
          </Text>
          <Button
            label="Más deportes"
            disabled={current === pages - 1}
            onPress={() => setPage(current + 1)}
          />
        </View>
      )}
      {items.length === 0 && (
        <Text style={s.body}>Sin coincidencias. Prueba otro nombre.</Text>
      )}
    </View>
  );
}
function TicketCard({
  title,
  ticket,
  onEdit,
  onRemove,
}: {
  title: string;
  ticket: DemoTicket;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const e = demoEvent(ticket.eventId);
  return (
    <View style={s.card}>
      <Text style={s.kicker}>{title}</Text>
      <Text style={s.cardTitle}>{e.title}</Text>
      <Text style={s.body}>
        {dateLabel(e.date)} · {e.time} · {e.competition}
      </Text>
      <Text style={s.body}>{e.venue}</Text>
      <Text style={s.seatText}>
        {zoneLabel[ticket.zone] ?? ticket.zone} · sector {ticket.sector ?? "A"} · fila {ticket.row}
        {"\n"}Asientos {ticket.seats.join(", ")} · {ticket.seats.length}{" "}
        localidad(es)
      </Text>
      {(onEdit || onRemove) && (
        <View style={s.wrap}>
          {onEdit && <Button label={`Editar ${title}`} onPress={onEdit} />}
          {onRemove && <Button label={`Quitar ${title}`} onPress={onRemove} />}
        </View>
      )}
    </View>
  );
}

/** Mounted only by the existing server-verified ADMIN gate; discarded on identity/role change. */
export function SportsEventsDemo({ onClose }: { onClose: () => void }) {
  const handedness = useContext(GoNavigationHand),
    { width } = useWindowDimensions();
  const [state, setState] = useState(createDemoState),
    stateRef = useRef(state);
  const [stack, setStack] = useState<Screen[]>([{ name: "sports" }]);
  const screen = stack[stack.length - 1],
    scroller = useRef<React.ComponentRef<typeof ScrollView>>(null),
    sequence = useRef(0);
  const [query, setQuery] = useState(""),
    [month, setMonth] = useState(""),
    [clubLimit, setClubLimit] = useState(8),
    [eventLimit, setEventLimit] = useState(6);
  const [side, setSide] = useState<"have" | "want">("have"),
    [append, setAppend] = useState(false),
    [editIndex, setEditIndex] = useState<number | null>(null);
  const [have, setHave] = useState<DemoTicket[]>([]),
    [want, setWant] = useState<DemoTicket[]>([]);
  const [zone, setZone] = useState("Norte"),
    [sector, setSector] = useState("A"),
    [row, setRow] = useState(3),
    [seats, setSeats] = useState<number[]>([12]);
  const [mode, setMode] = useState<DemoMode>("exchange"),
    [amount, setAmount] = useState("0"),
    [recipient, setRecipient] = useState<"me" | "other">("other");
  const [salePrice, setSalePrice] = useState("75");
  const [conditions, setConditions] = useState(""),
    [preferences, setPreferences] = useState(false),
    [minDifference, setMinDifference] = useState(""),
    [maxDifference, setMaxDifference] = useState("");
  const [desiredZones, setDesiredZones] = useState<string[]>([]),
    [desiredFrom, setDesiredFrom] = useState(""),
    [desiredTo, setDesiredTo] = useState("");
  const [offerId, setOfferId] = useState<string | undefined>(),
    [filters, setFilters] = useState(emptyDemoFilters),
    [moreFilters, setMoreFilters] = useState(false);
  const [buyer, setBuyer] = useState(false);
  const [counterparty, setCounterparty] = useState("Alex · ficticio");
  const [passClub, setPassClub] = useState("valencia"),
    [passSeats, setPassSeats] = useState(2),
    [passSelections, setPassSelections] = useState<Record<string, string[]>>(
      {},
    );
  const [passMode, setPassMode] = useState<DemoMode>("sale"),
    [passPrice, setPassPrice] = useState("40");
  const [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const pick =
    "pick" in screen && screen.pick ? screen.pick : { side, append, editIndex };
  const passSelection =
    screen.name === "pass"
      ? (passSelections[screen.id] ??
        state.passes.find((p) => p.id === screen.id)?.selected ??
        [])
      : [];
  const setPassSelection = (
    value: string[] | ((old: string[]) => string[]),
    id = screen.name === "pass" ? screen.id : "pass-madrid",
  ) => {
    setPassSelections((old) => ({
      ...old,
      [id]:
        typeof value === "function"
          ? value(
              old[id] ?? state.passes.find((p) => p.id === id)?.selected ?? [],
            )
          : value,
    }));
  };
  const nextId = (prefix: string) => `${prefix}-${++sequence.current}`;
  const navigate = (next: Screen, replace = false) => {
    setStack((old) => (replace ? [...old.slice(0, -1), next] : [...old, next]));
    setError("");
    setNotice("");
    setQuery("");
    if (next.name === "events") setMonth("");
    if (next.name === "clubs") setClubLimit(8);
    if (next.name === "events") setEventLimit(6);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => {
    if (stack.length === 1) {
      onClose();
      return;
    }
    setStack((old) => old.slice(0, -1));
    setError("");
    setNotice("");
    setQuery("");
    scroller.current?.scrollTo({ y: 0, animated: false });
  };
  // Synchronous reference makes repeated taps observe the previous local transition immediately.
  const update = (fn: (s: DemoState) => DemoState): boolean => {
    try {
      const next = fn(stateRef.current);
      stateRef.current = next;
      setState(next);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const reset = () =>
    Alert.alert(
      "Reiniciar demostración",
      "Se borrarán solo los ejemplos locales de esta sesión.",
      [
        { text: "Conservar", style: "cancel" },
        {
          text: "Reiniciar demo",
          onPress: () => {
            const next = createDemoState();
            stateRef.current = next;
            setState(next);
            setHave([]);
            setWant([]);
            setOfferId(undefined);
            setBuyer(false);
            setCounterparty("Alex · ficticio");
            setSide("have");
            setAppend(false);
            setEditIndex(null);
            setAmount("0");
            setSalePrice("75");
            setZone("Norte");
            setSector("A");
            setRow(3);
            setSeats([12]);
            setMode("exchange");
            setRecipient("other");
            setConditions("");
            setPreferences(false);
            setMinDifference("");
            setMaxDifference("");
            setDesiredZones([]);
            setDesiredFrom("");
            setDesiredTo("");
            setFilters(emptyDemoFilters());
            setMoreFilters(false);
            setPassSelections({});
            setPassMode("sale");
            setPassPrice("40");
            setPassClub("valencia");
            setPassSeats(2);
            setStack([{ name: "sports" }]);
            setQuery("");
            setMonth("");
            setError("");
            setNotice("Demostración reiniciada");
          },
        },
      ],
    );
  const browse = (
    target: "have" | "want",
    add = false,
    index: number | null = null,
  ) => {
    setBuyer(false);
    setSide(target);
    setAppend(add);
    setEditIndex(index);
    navigate({
      name: "sports",
      pick: { side: target, append: add, editIndex: index },
    });
  };
  const chooseSide = (target: "have" | "want") => {
    setSide(target);
    setAppend(false);
    setEditIndex(null);
    setStack((old) => old.map((item) =>
      "pick" in item && item.pick
        ? { ...item, pick: { side: target, append: false, editIndex: null } }
        : item,
    ));
  };
  const selectSeat = (eventId: string) => {
    const existing = (pick.side === "have" ? have : want).find(
      (t) => t.eventId === eventId,
    );
    setZone(existing?.zone ?? "Norte");
    setSector(existing?.sector ?? "A");
    setRow(existing?.row ?? 3);
    setSeats(existing?.seats ?? [12]);
    navigate({ name: "seats", eventId, pick });
  };
  const commitTicket = (eventId: string) => {
    const ticket = {
      eventId,
      zone,
      sector,
      row,
      seats: [...seats].sort((a, b) => a - b),
    };
    const setter = pick.side === "have" ? setHave : setWant;
    const previous = pick.side === "have" ? have : want;
    const next =
      pick.editIndex !== null
        ? previous.map((t, i) => (i === pick.editIndex ? ticket : t))
        : pick.append
          ? [...previous, ticket]
          : [ticket];
    setter(next);
    if (
      pick.side === "have" &&
      !(offerId && (pick.append || pick.editIndex !== null))
    )
      setOfferId(
        state.offers.find(
          (o) =>
            o.status !== "withdrawn" &&
            JSON.stringify(o.tickets) === JSON.stringify(next),
        )?.id,
      );
    navigate({ name: "compose" });
  };
  const editTicket = (target: "have" | "want", index: number) => {
    const t = (target === "have" ? have : want)[index];
    setSide(target);
    setEditIndex(index);
    setAppend(false);
    setZone(t.zone);
    setSector(t.sector ?? "A");
    setRow(t.row);
    setSeats(t.seats);
    navigate({
      name: "seats",
      eventId: t.eventId,
      pick: { side: target, append: false, editIndex: index },
    });
  };
  const startScenario = (kind: "equal" | "cash") => {
    const scenario = demoScenario(kind);
    setBuyer(false);
    setCounterparty("Alex · ficticio");
    setMinDifference("");
    setMaxDifference("");
    setDesiredFrom("");
    setDesiredTo("");
    setDesiredZones([]);
    setHave(scenario.have);
    setWant(scenario.want);
    setMode(scenario.mode);
    setAmount(String(scenario.difference));
    setRecipient(scenario.recipient);
    setConditions(scenario.conditions);
    setOfferId(scenario.offerId);
    navigate({ name: "compose" });
  };
  const changeMode = (value: DemoMode) => {
    setMode(value);
    if (value === "free" || value === "share") setAmount("0");
  };
  const money = () => Number(amount.replace(",", "."));
  const exchange = mode === "exchange" || mode === "sale_or_exchange";
  const preferenceValue = (): DemoPreferences => ({
    zones: desiredZones,
    from: desiredFrom,
    to: desiredTo,
    ...(minDifference ? { min: Number(minDifference.replace(",", ".")) } : {}),
    ...(maxDifference ? { max: Number(maxDifference.replace(",", ".")) } : {}),
  });
  const restorePreferences = (value?: DemoPreferences) => {
    setDesiredZones(value?.zones ?? []);
    setDesiredFrom(value?.from ?? "");
    setDesiredTo(value?.to ?? "");
    setMinDifference(value?.min === undefined ? "" : String(value.min));
    setMaxDifference(value?.max === undefined ? "" : String(value.max));
  };
  const loadOffer = (offer: DemoOffer, asExchange = false) => {
    setBuyer(false);
    setHave(offer.tickets);
    setOfferId(offer.id);
    setMode(asExchange ? "exchange" : offer.mode);
    setAmount(
      asExchange
        ? "0"
        : String(
            ["exchange", "sale_or_exchange"].includes(offer.mode)
              ? (offer.exchangeDifference ?? 0)
              : offer.price,
          ),
    );
    setSalePrice(String(offer.price));
    setRecipient(offer.recipient ?? "other");
    setWant(offer.desiredTickets ?? (asExchange ? want : []));
    setCounterparty(
      offer.counterparty ?? (asExchange ? counterparty : "Alex · ficticio"),
    );
    setConditions(offer.conditions);
    restorePreferences(offer.preferences);
    navigate({ name: "compose" });
  };
  const validatePreferences = () => {
    if (
      (desiredFrom && !/^\d{4}-\d{2}-\d{2}$/.test(desiredFrom)) ||
      (desiredTo && !/^\d{4}-\d{2}-\d{2}$/.test(desiredTo)) ||
      (desiredFrom && desiredTo && desiredFrom > desiredTo)
    )
      throw new Error("Revisa el intervalo de fechas deseadas.");
    const min = minDifference ? Number(minDifference.replace(",", ".")) : 0,
      max = maxDifference ? Number(maxDifference.replace(",", ".")) : Infinity;
    if (
      !Number.isFinite(min) ||
      min < 0 ||
      Number.isNaN(max) ||
      max < min ||
      (exchange && (money() < min || money() > max))
    )
      throw new Error(
        "La propuesta debe respetar las diferencias mínima y máxima.",
      );
  };
  const saveDraft = () => {
    const id = offerId ?? nextId("offer");
    try {
      if (exchange) validatePreferences();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (
      update((s) =>
        saveDemoOffer(s, {
          id,
          tickets: have,
          mode,
          price:
            mode === "sale_or_exchange"
              ? Number(salePrice.replace(",", "."))
              : mode === "exchange"
                ? 0
                : money(),
          conditions,
          ...(exchange
            ? {
                counterparty,
                desiredTickets: want,
                preferences: preferenceValue(),
                exchangeDifference: money(),
                recipient,
              }
            : {}),
          status: "draft",
        }),
      )
    ) {
      setOfferId(id);
      navigate({ name: "offers" });
      setNotice("Borrador DEMO en memoria de esta sesión");
    }
  };
  const propose = () => {
    try {
      if (exchange) validatePreferences();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const id = nextId("operation");
    if (
      update((s) =>
        createDemoOperation(s, {
          id,
          have,
          want: exchange || buyer ? want : [],
          mode,
          difference: money(),
          recipient: buyer ? "other" : exchange ? recipient : "me",
          counterparty,
          conditions,
          ...(exchange ? { preferences: preferenceValue() } : {}),
          ...(mode === "sale_or_exchange"
            ? { salePrice: Number(salePrice.replace(",", ".")) }
            : {}),
          status: "proposal",
          offerId,
          ...(buyer ? { perspective: "buyer" as const } : {}),
        }),
      )
    )
      navigate({ name: "summary", id });
  };
  const setFilter = (key: keyof DemoFilters, value: string) =>
    setFilters((old) => ({ ...old, [key]: value }));
  const step =
    screen.name === "sports"
      ? "1 · Tengo o quiero"
      : screen.name === "clubs"
        ? "2 · Elige un club o equipo"
        : screen.name === "events"
          ? "3 · Eventos y fechas"
          : screen.name === "seats"
            ? "4 · Localidades"
            : screen.name === "compose" || screen.name === "summary"
              ? "5 · Propuesta local"
              : "Mi espacio";
  const title =
    screen.name === "sports"
      ? "Entradas, butacas y abonos"
      : screen.name === "clubs"
        ? DEMO_SPORTS.find((s) => s.id === screen.sport)!.label
        : screen.name === "events"
          ? DEMO_CLUBS.find((c) => c.id === screen.clubId)!.label
          : screen.name === "seats"
            ? "Ubicar butaca"
            : screen.name === "compose"
              ? "TENGO ↔ QUIERO"
              : screen.name === "summary"
                ? "Resumen de la propuesta"
                : screen.name === "search"
                  ? "Buscar entrada"
                  : screen.name === "detail"
                    ? "Oferta de muestra"
                    : screen.name === "passes"
                      ? "Mis abonos"
                      : screen.name === "pass"
                        ? "Calendario del abono"
                        : screen.name === "offers"
                          ? "Mis ofertas"
                          : "Mis operaciones";
  const clubCandidates = screen.name === "clubs"
    ? DEMO_CLUBS.filter((c) => c.sport === screen.sport && c.label.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")))
    : [];
  const eventCandidates = screen.name === "events"
    ? DEMO_EVENTS.filter((e) => e.clubId === screen.clubId && (!month || e.date.startsWith(month)))
      .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const sideSelector = (compact: boolean) => <View style={s.sideRow}>
    <View style={s.sideHalf}><Button label="TENGO" selected={pick.side === "have"} compact={compact} onPress={() => chooseSide("have")} /></View>
    <View style={s.sideHalf}><Button label="QUIERO" selected={pick.side === "want"} compact={compact} onPress={() => chooseSide("want")} /></View>
  </View>;
  const pairing = (
    opHave: DemoTicket[],
    opWant: DemoTicket[],
    editable = false,
  ) => (
    <View style={[s.pair, width >= 650 && { flexDirection: "row" }]}>
      <View style={s.column}>
        <Text style={s.section}>TENGO · Tú</Text>
        {opHave.map((t, i) => (
          <TicketCard
            key={`have-${i}`}
            title={`TENGO ${i + 1}`}
            ticket={t}
            onEdit={editable ? () => editTicket("have", i) : undefined}
            onRemove={
              editable
                ? () => setHave((old) => old.filter((_, n) => n !== i))
                : undefined
            }
          />
        ))}
        {editable && (
          <View style={s.wrap}>
            <Button
              label={
                opHave.length ? "+ Añadir otra entrada propia" : "Elegir TENGO"
              }
              onPress={() => browse("have", !!opHave.length)}
            />
            <Button
              label="Mis ofertas propias"
              onPress={() => navigate({ name: "offers" })}
            />
          </View>
        )}
      </View>
      <View style={s.column}>
        <Text style={s.section}>QUIERO · otra parte</Text>
        {opWant.map((t, i) => (
          <TicketCard
            key={`want-${i}`}
            title={`QUIERO ${i + 1}`}
            ticket={t}
            onEdit={editable ? () => editTicket("want", i) : undefined}
            onRemove={
              editable
                ? () => setWant((old) => old.filter((_, n) => n !== i))
                : undefined
            }
          />
        ))}
        {editable && (
          <View style={s.wrap}>
            <Button
              label={opWant.length ? "+ Añadir destino" : "Elegir QUIERO"}
              onPress={() => browse("want", !!opWant.length)}
            />
            <Button
              label="Buscar ofertas demo"
              onPress={() => navigate({ name: "search" })}
            />
          </View>
        )}
      </View>
    </View>
  );

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={s.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.header}>
            <Text style={s.kicker}>EVENTOS DEPORTIVOS</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reiniciar demo" onPress={reset} style={s.settingsButton}>
              <Feather name="settings" size={20} color="#15583e" />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={scroller}
            style={{ flex: 1 }}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Text accessibilityRole="header" style={s.title}>
              {title}
            </Text>
            <Text style={s.subtitle}>
              {screen.name === "sports" ? "Intercambia o encuentra localidades por deporte y encuentro."
                : screen.name === "clubs" ? "Selecciona el equipo u organizador."
                : screen.name === "events" ? "Elige un encuentro de presentación."
                : screen.name === "seats" ? "Selecciona zona, sector, fila y asiento."
                : "Explora y edita la propuesta local."}
            </Text>
            {(screen.name === "sports" || screen.name === "clubs" || screen.name === "events" || screen.name === "seats") && sideSelector(screen.name !== "sports")}
            {screen.name !== "sports" && <Text style={s.kicker}>{step}</Text>}
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {!!notice && (
              <Text accessibilityLiveRegion="polite" style={s.notice}>
                {notice}
              </Text>
            )}
            {screen.name === "sports" && (
              <>
                <Text style={s.section}>2 · Elige un deporte</Text>
                <Field
                  label="Buscar deporte"
                  value={query}
                  onChange={setQuery}
                />
                <Text style={s.disclaimer}>Presentación local · sin entradas ni cobros reales.</Text>
                <Orbit
                  key={query}
                  center="DEPORTES"
                  items={DEMO_SPORTS.filter((s) =>
                    s.label.toLowerCase().includes(query.toLowerCase()),
                  )}
                  onSelect={(sport) => navigate({ name: "clubs", sport, pick })}
                />
                <View style={s.wrap}>
                  <Button
                    label="Ofrecer entrada"
                    onPress={() => {
                      changeMode("sale");
                      browse("have");
                    }}
                  />
                  <Button
                    label="Buscar entrada"
                    onPress={() => navigate({ name: "search" })}
                  />
                  <Button
                    label="Intercambiar"
                    onPress={() => {
                      changeMode("exchange");
                      have.length
                        ? navigate({ name: "compose" })
                        : browse("have");
                    }}
                  />
                  <Button
                    label="Mis abonos"
                    onPress={() => navigate({ name: "passes" })}
                  />
                  <Button
                    label="Mis operaciones"
                    onPress={() => navigate({ name: "operations" })}
                  />
                  <Button
                    label="Mis ofertas"
                    onPress={() => navigate({ name: "offers" })}
                  />
                </View>
                <Text style={s.section}>Ejemplos guiados</Text>
                <Button
                  label="Intercambio 1:1"
                  onPress={() => startScenario("equal")}
                />
                <Button
                  label="Intercambio con 50 € de diferencia"
                  onPress={() => startScenario("cash")}
                />
                <Button
                  label="Abono · varios partidos"
                  onPress={() => {
                    setPassSelection([
                      "real-madrid-demo-2",
                      "real-madrid-demo-3",
                      "real-madrid-demo-4",
                    ]);
                    navigate({ name: "pass", id: "pass-madrid" });
                  }}
                />
              </>
            )}
            {screen.name === "clubs" && (
              <>
                <Field
                  label="Buscar club o equipo"
                  value={query}
                  onChange={setQuery}
                />
                <View style={s.clubGrid}>
                  {clubCandidates.slice(0, query ? clubCandidates.length : clubLimit).map((c) =>
                    <TouchableOpacity key={c.id} accessibilityRole="button" accessibilityLabel={c.label}
                      onPress={() => navigate({ name: "events", clubId: c.id, pick })} style={s.clubTile}>
                      <View style={s.neutralShield}><Feather name="shield" size={29} color="#198563" /></View>
                      <Text numberOfLines={2} adjustsFontSizeToFit style={s.clubName}>{c.label}</Text>
                    </TouchableOpacity>,
                  )}
                </View>
                {!clubCandidates.length && <Text style={s.body}>No hay coincidencias.</Text>}
                {!query && clubCandidates.length > clubLimit && <Button label="Ver más clubes" primary onPress={() => setClubLimit((n) => n + 8)} />}
                <Button
                  label="Buscar ofertas de este deporte"
                  onPress={() => {
                    setFilters({ ...emptyDemoFilters(), sport: screen.sport });
                    navigate({ name: "search" });
                  }}
                />
              </>
            )}
            {screen.name === "events" && (
              <>
                <Text style={s.disclaimer}>Fechas ilustrativas · no son calendario ni disponibilidad oficial.</Text>
                <View style={s.wrap}>
                  {["", "2027-01", "2027-02", "2027-03"].map((m) => (
                    <Button
                      key={m}
                      label={
                        m
                          ? ({
                              "2027-01": "Enero",
                              "2027-02": "Febrero",
                              "2027-03": "Marzo",
                            }[m] ?? m)
                          : "Todos"
                      }
                      selected={month === m}
                      compact
                      onPress={() => { setMonth(m); setEventLimit(6); }}
                    />
                  ))}
                </View>
                {eventCandidates.slice(0, eventLimit).map((e) => (
                  <View key={e.id} style={s.eventCard}>
                    <Text style={s.eventDate}>
                      {dateLabel(e.date)} · {e.time}
                    </Text>
                    <Text style={s.eventTitle}>{e.title}</Text>
                    <Text style={s.eventMeta}>{e.venue}</Text>
                    <View style={s.eventFooter}>
                      <View style={s.eventRule} />
                      <Button label={e.excluded ? "No disponible" : "Elegir encuentro"}
                        accessibilityLabel={`Elegir encuentro ${e.id.split("-").at(-1)}`}
                        compact primary disabled={e.excluded} onPress={() => selectSeat(e.id)} />
                    </View>
                  </View>
                ))}
                {eventCandidates.length > eventLimit && <Button label="Ver más encuentros" onPress={() => setEventLimit((n) => n + 6)} />}
              </>
            )}
            {screen.name === "seats" && (
              <>
                <Text style={s.cardTitle}>
                  {demoEvent(screen.eventId).title}
                </Text>
                <Text style={s.body}>
                  {dateLabel(demoEvent(screen.eventId).date)} ·{" "}
                  {demoEvent(screen.eventId).time} ·{" "}
                  {demoEvent(screen.eventId).venue}
                </Text>
                <StadiumMap zone={zone} onSelect={setZone} />
                <Text style={s.disclaimer}>Esquema orientativo · selección local sin disponibilidad oficial.</Text>
                <Text style={s.label}>Grada / sector</Text>
                <View style={s.wrap}>
                  {DEMO_ZONES.map((z) => (
                    <Button
                      key={z}
                      label={zoneLabel[z]}
                      selected={zone === z}
                      onPress={() => setZone(z)}
                      compact
                    />
                  ))}
                </View>
                <Text style={s.label}>Sector</Text>
                <View style={s.wrap}>{["A", "B", "C", "D"].map((value) =>
                  <Button key={value} label={`Sector ${value}`} selected={sector === value} compact onPress={() => setSector(value)} />,
                )}</View>
                <Text style={s.label}>Fila</Text>
                <View style={s.wrap}>
                  {[1, 2, 3, 4, 5, 12].map((n) => (
                    <Button
                      key={n}
                      label={`Fila ${n}`}
                      selected={row === n}
                      onPress={() => setRow(n)}
                    />
                  ))}
                </View>
                <Field label="Número de fila (1–30)" value={String(row)} numeric onChange={(value) => { const n = Number(value); if (Number.isInteger(n) && n >= 1 && n <= 30) setRow(n); }} />
                <Field label="Asiento inicial (1–60)" value={String(seats[0] ?? "")} numeric onChange={(value) => { const n = Number(value); if (Number.isInteger(n) && n >= 1 && n <= 60) setSeats([n]); }} />
                <Text style={s.label}>Cantidad de localidades</Text>
                <View style={s.wrap}>{[1, 2, 3, 4].map((count) =>
                  <Button key={count} label={String(count)} selected={seats.length === count} compact onPress={() => {
                    const start = Math.min(seats[0] ?? 1, 61 - count);
                    setSeats(Array.from({ length: count }, (_, i) => start + i));
                  }} />,
                )}</View>
                <Text style={s.label}>Asientos · selección múltiple</Text>
                <View style={s.wrap}>
                  {Array.from({ length: 12 }, (_, n) => n + 1).map((n) => (
                    <Button
                      key={n}
                      label={`Asiento ${n}`}
                      selected={seats.includes(n)}
                      onPress={() =>
                        setSeats((old) =>
                          old.includes(n)
                            ? old.filter((v) => v !== n)
                            : [...old, n],
                        )
                      }
                    />
                  ))}
                </View>
                <Text style={s.body}>
                  {seats.length} localidad(es) · {zoneLabel[zone]} · sector {sector}
                  · fila {row}
                </Text>
                <Button
                  primary
                  label="Guardar ubicación"
                  accessibilityLabel={`Usar ${seats.length} localidad(es) en ${pick.side === "have" ? "TENGO" : "QUIERO"}`}
                  disabled={!seats.length}
                  onPress={() => commitTicket(screen.eventId)}
                />
                <Button
                  label="Cambiar encuentro"
                  onPress={back}
                />
              </>
            )}
            {screen.name === "compose" && (
              <>
                {!buyer && (
                  <View style={s.wrap}>
                    {DEMO_MODES.map((m) => (
                      <Button
                        key={m.id}
                        label={m.label}
                        selected={mode === m.id}
                        onPress={() => changeMode(m.id)}
                      />
                    ))}
                  </View>
                )}
                {buyer ? (
                  <>
                    <Text style={s.section}>QUIERO · compra / cesión demo</Text>
                    {want.map((t, i) => (
                      <TicketCard
                        key={i}
                        title="Oferta de titular ficticio"
                        ticket={t}
                      />
                    ))}
                    <Button
                      label="Volver a buscar"
                      onPress={() => navigate({ name: "search" })}
                    />
                  </>
                ) : exchange ? (
                  pairing(have, want, true)
                ) : (
                  <>
                    <Text style={s.section}>TENGO · propuesta propia</Text>
                    {have.map((t, i) => (
                      <TicketCard
                        key={i}
                        title={`TENGO ${i + 1}`}
                        ticket={t}
                        onEdit={() => editTicket("have", i)}
                        onRemove={() =>
                          setHave((old) => old.filter((_, n) => n !== i))
                        }
                      />
                    ))}
                    <Button
                      label={
                        have.length ? "+ Añadir entrada propia" : "Elegir TENGO"
                      }
                      onPress={() => browse("have", !!have.length)}
                    />
                  </>
                )}
                {exchange && (
                  <>
                    <Text style={s.section}>Combinación de localidades</Text>
                    <Text style={s.body}>
                      {have.reduce((n, t) => n + t.seats.length, 0)} propia(s)
                      por {want.reduce((n, t) => n + t.seats.length, 0)}{" "}
                      deseada(s) · admite eventos, clubes y deportes distintos.
                    </Text>
                    <View style={s.wrap}>
                      <Button
                        label="Configurar 1:1"
                        onPress={() => {
                          setHave((old) =>
                            old.slice(0, 1).map((t) => ({
                              ...t,
                              seats: t.seats.slice(0, 1),
                            })),
                          );
                          setWant((old) =>
                            old.slice(0, 1).map((t) => ({
                              ...t,
                              seats: t.seats.slice(0, 1),
                            })),
                          );
                        }}
                      />
                      <Button
                        label="Varias por una / varias"
                        onPress={() =>
                          have.length ? editTicket("have", 0) : browse("have")
                        }
                      />
                    </View>
                  </>
                )}
                {!(["free", "share"] as DemoMode[]).includes(mode) && (
                  <>
                    <Field
                      label={
                        exchange
                          ? "Diferencia propuesta en EUR · simulada"
                          : "Precio indicado en EUR · simulado"
                      }
                      value={amount}
                      onChange={setAmount}
                      numeric
                    />
                    <View style={s.wrap}>
                      {[0, 25, 50, 100].map((n) => (
                        <Button
                          key={n}
                          label={euro(n)}
                          selected={money() === n}
                          onPress={() => setAmount(String(n))}
                        />
                      ))}
                    </View>
                    {exchange && (
                      <View style={s.wrap}>
                        <Button
                          label="Yo aportaría la diferencia"
                          selected={recipient === "other"}
                          onPress={() => setRecipient("other")}
                        />
                        <Button
                          label="Diferencia a mi favor"
                          selected={recipient === "me"}
                          onPress={() => setRecipient("me")}
                        />
                      </View>
                    )}
                  </>
                )}
                {mode === "sale_or_exchange" && (
                  <Field
                    label="Precio de venta alternativo EUR · simulado"
                    value={salePrice}
                    onChange={setSalePrice}
                    numeric
                  />
                )}
                <Text style={s.notice}>
                  {exchange
                    ? money() === 0
                      ? "Sin diferencia económica simulada."
                      : recipient === "other"
                        ? `Tú aportarías ${euro(money())} a ${counterparty}.`
                        : `${counterparty} aportaría ${euro(money())} a tu favor.`
                    : mode === "free"
                      ? "Cesión gratuita propuesta · 0 €"
                      : mode === "share"
                        ? "Compartir propuesta dentro de esta demo · sin envío"
                        : `Precio propuesto: ${euro(money())}`}{" "}
                  No se cobra ni se liquida dinero.
                </Text>
                <Field
                  label="Condiciones opcionales · solo datos ficticios"
                  value={conditions}
                  onChange={setConditions}
                  placeholder="Ej.: prefiero dos asientos contiguos"
                />
                {exchange && (
                  <>
                    <Button
                      label={
                        preferences
                          ? "Ocultar preferencias"
                          : "Preferencias de intercambio"
                      }
                      onPress={() => setPreferences((v) => !v)}
                    />
                    {preferences && (
                      <View style={s.card}>
                        <Text style={s.label}>Zonas deseadas</Text>
                        <View style={s.wrap}>
                          {DEMO_ZONES.map((z) => (
                            <Button
                              key={z}
                              label={z}
                              selected={desiredZones.includes(z)}
                              onPress={() =>
                                setDesiredZones((old) =>
                                  old.includes(z)
                                    ? old.filter((x) => x !== z)
                                    : [...old, z],
                                )
                              }
                            />
                          ))}
                        </View>
                        <Field
                          label="Fecha deseada desde (AAAA-MM-DD)"
                          value={desiredFrom}
                          onChange={setDesiredFrom}
                        />
                        <Field
                          label="Fecha deseada hasta (AAAA-MM-DD)"
                          value={desiredTo}
                          onChange={setDesiredTo}
                        />
                        <Field
                          label="Diferencia mínima EUR"
                          value={minDifference}
                          onChange={setMinDifference}
                          numeric
                        />
                        <Field
                          label="Diferencia máxima EUR"
                          value={maxDifference}
                          onChange={setMaxDifference}
                          numeric
                        />
                      </View>
                    )}
                  </>
                )}
                <Button
                  primary
                  label="Ver resumen · propuesta demo"
                  onPress={propose}
                  disabled={
                    buyer
                      ? !want.length
                      : !have.length || (exchange && !want.length)
                  }
                />
                {!buyer && (
                  <Button
                    label="Guardar borrador demo"
                    onPress={saveDraft}
                    disabled={!have.length}
                  />
                )}
              </>
            )}
            {screen.name === "summary" &&
              (() => {
                const op = state.operations.find((o) => o.id === screen.id);
                if (!op) return null;
                const transition = (status: DemoOperationStatus) =>
                  update((s) => transitionDemoOperation(s, op.id, status));
                const actor = (op.counterparty ?? "Alex · ficticio").split(
                  " · ",
                )[0];
                return (
                  <>
                    <Text accessibilityLiveRegion="polite" style={s.status}>
                      {DEMO_STATUS[op.status]}
                    </Text>
                    <Text style={s.body}>
                      {modeLabel(op.mode)} · dos participantes ficticios
                    </Text>
                    {pairing(op.have, op.want)}
                    <View style={s.card}>
                      <Text style={s.section}>Desglose de la propuesta</Text>
                      <Text style={s.body}>
                        {op.perspective === "buyer"
                          ? `Solicitas ${op.want.reduce((n, t) => n + t.seats.length, 0)} localidad(es) a ${actor} (ficticio).`
                          : `Tú propones ${op.have.reduce((n, t) => n + t.seats.length, 0)} localidad(es).`}
                        {op.want.length && op.perspective !== "buyer"
                          ? ` ${actor} propone ${op.want.reduce((n, t) => n + t.seats.length, 0)} localidad(es).`
                          : ""}
                      </Text>
                      <Text style={s.seatText}>
                        {op.difference === 0
                          ? "Sin diferencia económica · 0 €"
                          : `${op.recipient === "me" ? `${actor} → Tú` : `Tú → ${actor}`}: ${euro(op.difference)} simulados`}
                      </Text>
                      <Text style={s.body}>
                        {op.conditions || "Sin condiciones adicionales"}
                      </Text>
                    </View>
                    <Text style={s.disclaimer}>Propuesta local de presentación · no se envía, cobra ni transfiere ninguna entrada.</Text>
                    {op.status === "proposal" && (
                      <Button
                        primary
                        label="Simular envío de propuesta"
                        onPress={() => transition("pending")}
                      />
                    )}
                    {op.status === "pending" && (
                      <>
                        <Button
                          primary
                          label="Simular aceptación"
                          onPress={() => transition("accepted")}
                        />
                        <Button
                          label="Simular rechazo"
                          onPress={() => transition("rejected")}
                        />
                      </>
                    )}
                    {op.status === "accepted" && (
                      <Button
                        primary
                        label="Ver siguiente paso externo"
                        onPress={() => transition("external_pending")}
                      />
                    )}
                    {op.status === "external_pending" && (
                      <>
                        <Text style={s.body}>
                          Pendiente de transferencia oficial y confirmación del
                          emisor. Esta demo termina aquí; ninguna entrada se ha
                          transferido.
                        </Text>
                        <Button
                          label="Simular incidencia / disputa"
                          onPress={() => transition("disputed")}
                        />
                        <Button
                          label="Simular invalidación del derecho"
                          onPress={() => transition("invalidated")}
                        />
                      </>
                    )}
                    {op.status === "disputed" && (
                      <>
                        <Text style={s.body}>
                          Ejemplo: revocación, duplicado, aplazamiento o acceso
                          denegado. Localidades bloqueadas hasta cancelar o
                          invalidar la propuesta demo. En producción requerirá
                          revisión y evidencias oficiales, nunca capturas de QR.
                        </Text>
                        <Button
                          label="Resolver demo como invalidada"
                          onPress={() => transition("invalidated")}
                        />
                      </>
                    )}
                    {!["cancelled", "rejected", "invalidated"].includes(
                      op.status,
                    ) && (
                      <Button
                        label="Cancelar propuesta demo"
                        onPress={() => transition("cancelled")}
                      />
                    )}
                    {!!preferencesLabel(op.preferences) && (
                      <Text style={s.body}>
                        {preferencesLabel(op.preferences)}
                      </Text>
                    )}
                    {op.salePrice !== undefined && (
                      <Text style={s.body}>
                        Alternativa de venta propuesta: {euro(op.salePrice)} ·
                        sin cobro
                      </Text>
                    )}
                    <Button
                      label="Editar / repetir este ejemplo"
                      onPress={() => {
                        if (
                          !["cancelled", "rejected", "invalidated"].includes(
                            op.status,
                          ) &&
                          !transition("cancelled")
                        )
                          return;
                        setBuyer(op.perspective === "buyer");
                        setCounterparty(op.counterparty ?? "Alex · ficticio");
                        setHave(op.have);
                        setWant(op.want);
                        setMode(op.mode);
                        setAmount(String(op.difference));
                        setSalePrice(String(op.salePrice ?? 75));
                        setRecipient(op.recipient);
                        setConditions(op.conditions);
                        restorePreferences(op.preferences);
                        setOfferId(op.offerId);
                        navigate({ name: "compose" });
                      }}
                    />
                    <Button
                      label="Mis operaciones"
                      onPress={() => navigate({ name: "operations" })}
                    />
                  </>
                );
              })()}
            {screen.name === "search" && (
              <>
                <Text style={s.disclaimer}>Ofertas de presentación · filtros de esta sesión.</Text>
                <ScrollView
                  horizontal
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                  showsHorizontalScrollIndicator={false}
                >
                  <Button
                    label="Todos los deportes"
                    selected={!filters.sport}
                    onPress={() =>
                      setFilters((old) => ({ ...old, sport: "", club: "" }))
                    }
                  />
                  {DEMO_SPORTS.map((sport) => (
                    <Button
                      key={sport.id}
                      label={sport.label}
                      selected={filters.sport === sport.id}
                      onPress={() =>
                        setFilters((old) => ({
                          ...old,
                          sport: sport.id,
                          club: "",
                        }))
                      }
                    />
                  ))}
                </ScrollView>
                <View style={s.wrap}>
                  <Button
                    label="Todos los clubes"
                    selected={!filters.club}
                    onPress={() => setFilter("club", "")}
                  />
                  {DEMO_CLUBS.filter(
                    (c) => c.sport === (filters.sport || "football"),
                  ).map((c) => (
                    <Button
                      key={c.id}
                      label={c.label}
                      selected={filters.club === c.id}
                      onPress={() => setFilter("club", c.id)}
                    />
                  ))}
                </View>
                <View style={s.wrap}>
                  <Button
                    label="Cualquier ciudad"
                    selected={!filters.city}
                    onPress={() => setFilter("city", "")}
                  />
                  {["Madrid", "Barcelona", "Valencia"].map((c) => (
                    <Button
                      key={c}
                      label={c}
                      selected={filters.city === c}
                      onPress={() => setFilter("city", c)}
                    />
                  ))}
                </View>
                <View style={s.wrap}>
                  <Button
                    label="Todas las modalidades"
                    selected={!filters.mode}
                    onPress={() => setFilter("mode", "")}
                  />
                  {DEMO_MODES.map((m) => (
                    <Button
                      key={m.id}
                      label={m.id === "sale" ? "Compra" : m.label}
                      selected={filters.mode === m.id}
                      onPress={() => setFilter("mode", m.id)}
                    />
                  ))}
                </View>
                <Field
                  label="Precio máximo EUR"
                  value={filters.max}
                  onChange={(v) => setFilter("max", v)}
                  numeric
                />
                <Button
                  label={
                    moreFilters
                      ? "Ocultar filtros avanzados"
                      : "Competición, fechas y recinto"
                  }
                  onPress={() => setMoreFilters((v) => !v)}
                />
                {moreFilters && (
                  <View style={s.card}>
                    <Field
                      label="Ciudad o zona"
                      value={filters.city}
                      onChange={(v) => setFilter("city", v)}
                    />
                    <View style={s.wrap}>
                      {["", "Liga GO · ficticia", "Copa GO · ficticia"].map(
                        (c) => (
                          <Button
                            key={c}
                            label={c || "Toda competición"}
                            selected={filters.competition === c}
                            onPress={() => setFilter("competition", c)}
                          />
                        ),
                      )}
                    </View>
                    <Field
                      label="Recinto"
                      value={filters.venue}
                      onChange={(v) => setFilter("venue", v)}
                      placeholder="Recinto Madrid"
                    />
                    <Field
                      label="Desde (AAAA-MM-DD)"
                      value={filters.from}
                      onChange={(v) => setFilter("from", v)}
                    />
                    <Field
                      label="Hasta (AAAA-MM-DD)"
                      value={filters.to}
                      onChange={(v) => setFilter("to", v)}
                    />
                  </View>
                )}
                <View style={s.wrap}>
                  <Button
                    label="Limpiar filtros"
                    onPress={() => setFilters(emptyDemoFilters())}
                  />
                  <Button
                    label="Guardar filtros demo"
                    onPress={() => {
                      update((s) => ({
                        ...s,
                        savedFilters: [...s.savedFilters, { ...filters }].slice(
                          -5,
                        ),
                      }));
                      setNotice("Filtros guardados en memoria demo");
                    }}
                  />
                </View>
                {state.savedFilters.map((f, i) => (
                  <Button
                    key={i}
                    label={`Recuperar búsqueda ${i + 1}`}
                    onPress={() => setFilters({ ...f })}
                  />
                ))}
                <Text style={s.section}>
                  Resultados DEMO · {filterDemoListings(filters).length}
                </Text>
                {filterDemoListings(filters)
                  .slice(0, 30)
                  .map((l) => (
                    <View key={l.id} style={s.card}>
                      <Text style={s.cardTitle}>
                        {demoEvent(l.ticket.eventId).title}
                      </Text>
                      <Text style={s.body}>
                        {dateLabel(demoEvent(l.ticket.eventId).date)} ·{" "}
                        {demoEvent(l.ticket.eventId).venue}
                        {"\n"}
                        {l.ticket.zone} · fila {l.ticket.row} · asientos{" "}
                        {l.ticket.seats.join(", ")}
                        {"\n"}
                        {modeLabel(l.mode)} · {euro(l.price)} · {l.holder}
                      </Text>
                      <Button
                        label="Ver detalle"
                        accessibilityLabel={`Ver oferta de ${l.holder} · ${demoEvent(l.ticket.eventId).title}`}
                        onPress={() => navigate({ name: "detail", listing: l })}
                      />
                    </View>
                  ))}
                {filterDemoListings(filters).length > 30 && (
                  <Text style={s.body}>
                    Mostrando 30 ejemplos. Elige deporte o club para acotar.
                  </Text>
                )}
                {!filterDemoListings(filters).length && (
                  <Text style={s.body}>
                    Sin ejemplos con estos filtros. Puedes limpiarlos.
                  </Text>
                )}
              </>
            )}
            {screen.name === "detail" && (
              <>
                <TicketCard
                  title={screen.listing.holder}
                  ticket={screen.listing.ticket}
                />
                <Text style={s.seatText}>
                  {modeLabel(screen.listing.mode)} ·{" "}
                  {euro(screen.listing.price)} DEMO
                </Text>
                <Text style={s.disclaimer}>Oferta de presentación · sin entrada ni disponibilidad real.</Text>
                <Button
                  primary
                  label="Elegir para QUIERO · intercambio"
                  onPress={() => {
                    setBuyer(false);
                    setCounterparty(screen.listing.holder);
                    setWant([screen.listing.ticket]);
                    setMode("exchange");
                    navigate({ name: "compose" });
                  }}
                />
                {screen.listing.mode !== "exchange" && (
                  <Button
                    label="Simular esta propuesta de compra / cesión"
                    onPress={() => {
                      setBuyer(true);
                      setCounterparty(screen.listing.holder);
                      setHave([]);
                      setWant([screen.listing.ticket]);
                      setOfferId(undefined);
                      changeMode(screen.listing.mode);
                      setAmount(String(screen.listing.price));
                      navigate({ name: "compose" });
                    }}
                  />
                )}
              </>
            )}
            {screen.name === "offers" && (
              <>
                <Text style={s.body}>
                  Borradores privados y estados de muestra. Puedes editar cada
                  partido por separado.
                </Text>
                {state.offers.map((offer) => {
                  const locked = state.operations.some(
                    (op) =>
                      !["cancelled", "rejected", "invalidated"].includes(
                        op.status,
                      ) && op.offerId === offer.id,
                  );
                  return (
                    <View key={offer.id} style={s.card}>
                      <Text style={s.status}>
                        {
                          {
                            draft: "Borrador demo",
                            available: "Disponible en demo",
                            paused: "Pausada",
                            withdrawn: "Retirada",
                          }[offer.status]
                        }
                        {locked ? " · bloqueada por operación" : ""}
                      </Text>
                      {offer.tickets.map((t, i) => (
                        <TicketCard
                          key={i}
                          title={modeLabel(offer.mode)}
                          ticket={t}
                        />
                      ))}
                      <Text style={s.seatText}>
                        {euro(offer.price)} indicados
                      </Text>
                      <View style={s.wrap}>
                        <Button
                          label="Editar oferta"
                          disabled={locked || offer.status === "withdrawn"}
                          onPress={() => loadOffer(offer)}
                        />
                        <Button
                          label="Usar para intercambio"
                          disabled={
                            locked ||
                            offer.status === "withdrawn" ||
                            offer.status === "paused"
                          }
                          onPress={() => loadOffer(offer, true)}
                        />
                        <Button
                          label="Marcar disponible en demo"
                          disabled={
                            locked ||
                            offer.status === "withdrawn" ||
                            offer.status === "available"
                          }
                          onPress={() =>
                            update((s) =>
                              saveDemoOffer(s, {
                                ...offer,
                                status: "available",
                              }),
                            )
                          }
                        />
                        <Button
                          label={
                            offer.status === "paused"
                              ? "Reanudar demo"
                              : "Pausar"
                          }
                          disabled={locked || offer.status === "withdrawn"}
                          onPress={() =>
                            update((s) =>
                              saveDemoOffer(s, {
                                ...offer,
                                status:
                                  offer.status === "paused"
                                    ? "draft"
                                    : "paused",
                              }),
                            )
                          }
                        />
                        <Button
                          label="Retirar"
                          disabled={locked || offer.status === "withdrawn"}
                          onPress={() =>
                            update((s) =>
                              saveDemoOffer(s, {
                                ...offer,
                                status: "withdrawn",
                              }),
                            )
                          }
                        />
                      </View>
                    </View>
                  );
                })}
                <Button
                  label="Nueva oferta demo"
                  onPress={() => {
                    setHave([]);
                    setWant([]);
                    setOfferId(undefined);
                    changeMode("sale");
                    browse("have");
                  }}
                />
              </>
            )}
            {screen.name === "passes" && (
              <>
                <Text style={s.disclaimer}>Abonos de presentación · selección por partido, sin transferencia.</Text>
                {state.passes.map((pass) => (
                  <View key={pass.id} style={s.card}>
                    <Text style={s.cardTitle}>{pass.title}</Text>
                    <Text style={s.body}>
                      Asientos contiguos {pass.seats.join(", ")} · 30 encuentros
                      de muestra · restricciones por validar
                    </Text>
                    <Button
                      label={`Abrir ${pass.title}`}
                      onPress={() => {
                        setPassSelection(
                          passSelections[pass.id] ?? pass.selected,
                          pass.id,
                        );
                        navigate({ name: "pass", id: pass.id });
                      }}
                    />
                  </View>
                ))}
                <Text style={s.section}>Registrar otro abono demo</Text>
                <View style={s.wrap}>
                  {DEMO_CLUBS.filter((c) => c.sport === "football").map((c) => (
                    <Button
                      key={c.id}
                      label={c.label}
                      selected={passClub === c.id}
                      onPress={() => setPassClub(c.id)}
                    />
                  ))}
                </View>
                <View style={s.wrap}>
                  {[1, 2, 3].map((n) => (
                    <Button
                      key={n}
                      label={`${n} asiento(s) contiguos`}
                      selected={passSeats === n}
                      onPress={() => setPassSeats(n)}
                    />
                  ))}
                </View>
                <Button
                  primary
                  label="Registrar abono ficticio"
                  onPress={() => {
                    const club = DEMO_CLUBS.find((c) => c.id === passClub)!,
                      seats = Array.from(
                        { length: passSeats },
                        (_, i) => i + 1,
                      );
                    if (
                      state.passes.some(
                        (p) =>
                          p.clubId === passClub &&
                          p.seats.some((n) => seats.includes(n)),
                      )
                    ) {
                      setError(
                        "Estos asientos ya tienen un abono demo. Abre el existente.",
                      );
                      return;
                    }
                    const id = nextId("pass");
                    update((s) => ({
                      ...s,
                      passes: [
                        ...s.passes,
                        {
                          id,
                          clubId: passClub,
                          title: `Abono ${club.label} · DEMO 2027`,
                          seats,
                          selected: [],
                        },
                      ],
                    }));
                    setPassSelection([], id);
                    navigate({ name: "pass", id });
                  }}
                />
              </>
            )}
            {screen.name === "pass" &&
              (() => {
                const pass = state.passes.find((p) => p.id === screen.id);
                if (!pass) return null;
                const events = DEMO_EVENTS.filter(
                    (e) => e.clubId === pass.clubId,
                  ),
                  eligible = events.filter((e) => !e.excluded);
                return (
                  <>
                    <Text style={s.cardTitle}>{pass.title}</Text>
                    <Text style={s.body}>
                      No asistiré a los encuentros seleccionados. Se preparan
                      derechos individuales por partido, nunca una cesión del
                      abono completo.
                    </Text>
                    <View style={s.wrap}>
                      <Button
                        label={`Seleccionar ${eligible.length} permitidos`}
                        onPress={() =>
                          setPassSelection(eligible.map((e) => e.id))
                        }
                      />
                      <Button
                        label="Quitar selección"
                        onPress={() => setPassSelection([])}
                      />
                    </View>
                    <Text style={s.seatText}>
                      {passSelection.length} partidos seleccionados · asientos{" "}
                      {pass.seats.join(", ")}
                    </Text>
                    <View style={s.card}>
                      <Text style={s.label}>
                        Regla para la selección · editable por partido después
                      </Text>
                      <View style={s.wrap}>
                        {DEMO_MODES.map((m) => (
                          <Button
                            key={m.id}
                            label={m.label}
                            selected={passMode === m.id}
                            onPress={() => {
                              setPassMode(m.id);
                              if (["free", "share"].includes(m.id))
                                setPassPrice("0");
                            }}
                          />
                        ))}
                      </View>
                      {!["free", "share"].includes(passMode) && (
                        <Field
                          label="Precio por evento EUR · demo"
                          value={passPrice}
                          onChange={setPassPrice}
                          numeric
                        />
                      )}
                      <Button
                        primary
                        label={`Preparar ${passSelection.length} borradores demo`}
                        disabled={!passSelection.length}
                        onPress={() => {
                          if (
                            update((s) =>
                              stageDemoPass(
                                s,
                                pass.id,
                                passSelection,
                                passMode,
                                Number(passPrice.replace(",", ".")),
                              ),
                            )
                          ) {
                            navigate({ name: "offers" });
                            setNotice(
                              `${passSelection.length} borradores individuales en memoria. Edita cada evento para variar precio o modalidad.`,
                            );
                          }
                        }}
                      />
                    </View>
                    {events.map((e) => (
                      <View key={e.id} style={s.calendarRow}>
                        <Text style={s.body}>
                          {dateLabel(e.date)} · {e.time}
                          {"\n"}
                          {e.title}
                          {"\n"}
                          {e.competition}
                        </Text>
                        <Button
                          label={
                            e.excluded
                              ? "Excluido por regla demo"
                              : `${passSelection.includes(e.id) ? "✓ " : ""}No asistiré · ${e.id.split("-").at(-1)}`
                          }
                          selected={passSelection.includes(e.id)}
                          disabled={e.excluded}
                          onPress={() =>
                            setPassSelection((old) =>
                              old.includes(e.id)
                                ? old.filter((x) => x !== e.id)
                                : [...old, e.id],
                            )
                          }
                        />
                      </View>
                    ))}
                  </>
                );
              })()}
            {screen.name === "operations" && (
              <>
                {!state.operations.length && (
                  <Text style={s.body}>
                    Aún no hay operaciones demo. Empieza con un escenario
                    guiado.
                  </Text>
                )}
                {state.operations.map((op, i) => (
                  <View key={op.id} style={s.card}>
                    <Text style={s.status}>{DEMO_STATUS[op.status]}</Text>
                    <Text style={s.cardTitle}>
                      {modeLabel(op.mode)} · {euro(op.difference)} simulados
                    </Text>
                    <Text style={s.body}>
                      {demoEvent((op.have[0] ?? op.want[0]).eventId).title}
                    </Text>
                    <Button
                      label="Ver acuerdo"
                      accessibilityLabel={`Abrir acuerdo ${i + 1}`}
                      onPress={() => navigate({ name: "summary", id: op.id })}
                    />
                  </View>
                ))}
                <Button
                  label="Probar intercambio 1:1"
                  onPress={() => startScenario("equal")}
                />
                <Text style={s.section}>Historial local de estados</Text>
                {state.audit.slice(-12).map((a, i) => (
                  <Text key={i} style={s.small}>
                    {a}
                  </Text>
                ))}
              </>
            )}
          </ScrollView>
          <GoNavigationFloating
            screenKey="sports-events-demo"
            handedness={handedness}
            width={136}
          >
            <GoCloseButton
              level="panel"
              appearance="light"
              accessibilityLabel="Volver un nivel en Eventos Deportivos"
              onPress={back}
            />
            <GoCloseButton
              level="container"
              appearance="light"
              accessibilityLabel="Cerrar Eventos Deportivos"
              onPress={onClose}
            />
          </GoNavigationFloating>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f9fbf8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    minHeight: 52,
  },
  kicker: {
    color: "#145b41",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  settingsButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff",
    borderWidth: 1, borderColor: "#dce9e1", alignItems: "center", justifyContent: "center",
    shadowColor: "#153b2c", shadowOpacity: .08, shadowRadius: 5, elevation: 2,
  },
  content: {
    padding: 16,
    paddingBottom: 136,
    gap: 11,
    maxWidth: 950,
    width: "100%",
    alignSelf: "center",
  },
  title: { color: "#16251f", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#63716b", fontSize: 14, lineHeight: 20 },
  section: { color: "#18362b", fontSize: 17, fontWeight: "800", marginTop: 8 },
  body: { color: "#394b42", fontSize: 14, lineHeight: 21 },
  small: { color: "#64756c", fontSize: 12, lineHeight: 18 },
  disclaimer: { color: "#6c7972", fontSize: 11, lineHeight: 16 },
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#d6e1da",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 1,
    shadowColor: "#224737", shadowOffset: { width: 0, height: 2 }, shadowOpacity: .07, shadowRadius: 4,
    elevation: 1,
  },
  compactButton: { minHeight: 42, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 13 },
  compactButtonText: { fontSize: 12 },
  selected: { backgroundColor: "#0d7954", borderColor: "#0d7954" },
  buttonText: {
    color: "#1a5940",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  selectedText: { color: "#fff" },
  sideRow: { flexDirection: "row", gap: 8, padding: 5, borderRadius: 19, backgroundColor: "#f0f6f2", borderWidth: 1, borderColor: "#e0eae3" },
  sideHalf: { flex: 1 },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  field: { gap: 6 },
  label: { color: "#315544", fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 50,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#ccd9d0",
    color: "#172b20",
    fontSize: 16,
    backgroundColor: "#fff",
  },
  card: {
    borderRadius: 19,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e1e9e2",
    backgroundColor: "#fff",
    gap: 10,
    shadowColor: "#204932", shadowOpacity: .07, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { color: "#172c20", fontSize: 17, fontWeight: "700" },
  seatText: {
    color: "#226746",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "700",
  },
  notice: {
    padding: 12,
    backgroundColor: "#eef6ee",
    color: "#285944",
    borderRadius: 13,
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    padding: 12,
    backgroundColor: "#fff0ef",
    color: "#a93027",
    borderRadius: 13,
    fontSize: 14,
  },
  status: { color: "#35664b", fontSize: 16, fontWeight: "800" },
  orbit: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e8dc",
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    padding: 7,
    gap: 3,
    shadowColor: "#1b553b", shadowOpacity: .07, shadowRadius: 5, elevation: 2,
  },
  orbitSymbol: { fontSize: 23, fontWeight: "800" },
  orbitLabel: {
    color: "#183a29",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  orbitRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#cfe5d6",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitCenter: { color: "#1f7654", fontSize: 30, fontWeight: "900" },
  page: { color: "#315d47", padding: 8 },
  clubGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 9 },
  clubTile: { width: "48%", minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: "#e1ebe4", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 6, padding: 9, shadowColor: "#23513c", shadowOpacity: .06, shadowRadius: 5, elevation: 1 },
  neutralShield: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "#eaf6ed" },
  clubName: { color: "#1d3025", fontSize: 14, fontWeight: "800", textAlign: "center" },
  eventCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2eae3", borderRadius: 18, padding: 12, gap: 4, shadowColor: "#294638", shadowOpacity: .06, shadowRadius: 7, elevation: 1 },
  eventDate: { color: "#225a42", fontSize: 12, fontWeight: "800" },
  eventTitle: { color: "#1a2920", fontSize: 16, fontWeight: "800" },
  eventMeta: { color: "#66746b", fontSize: 12, lineHeight: 17 },
  eventFooter: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "flex-end", marginTop: 5 },
  eventRule: { height: 1, flex: 1, backgroundColor: "#d2e4d7" },
  stadium: { width: "100%", aspectRatio: 1.4, maxHeight: 330, borderRadius: 28, backgroundColor: "#f2f9f4", overflow: "hidden", borderWidth: 1, borderColor: "#d5e8db" },
  stadiumOval: { position: "absolute", left: "6%", right: "6%", top: "5%", bottom: "5%", borderRadius: 170, borderWidth: 17, borderColor: "#cae7d5", backgroundColor: "#e5f3e9" },
  stadiumField: { position: "absolute", left: "25%", right: "25%", top: "34%", bottom: "34%", borderRadius: 12, borderWidth: 2, borderColor: "#fff", backgroundColor: "#5cb870", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  stadiumMidline: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: "#fff" },
  stadiumCircle: { width: 35, height: 35, borderRadius: 18, borderWidth: 1, borderColor: "#fff" },
  stadiumZone: { position: "absolute", minWidth: 70, minHeight: 36, paddingHorizontal: 6, borderRadius: 18, borderWidth: 1, borderColor: "#b5d5c3", backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  stadiumZoneSelected: { backgroundColor: "#0d7954", borderColor: "#0d7954" },
  stadiumZoneText: { color: "#28513b", fontSize: 11, fontWeight: "800" },
  stadiumZoneTextSelected: { color: "#fff" },
  zoneNorte: { left: "2%", top: "43%" },
  zoneSur: { right: "2%", top: "43%" },
  zoneEste: { left: "36%", bottom: "20%" },
  zoneOeste: { left: "36%", top: "20%" },
  zoneTribuna: { left: "35%", top: "2%" },
  zoneVIP: { left: "42%", bottom: "2%" },
  pair: { gap: 14 },
  column: { flex: 1, gap: 12 },
  calendarRow: {
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#dce8df",
    gap: 10,
  },
  footer: { color: "#718077", fontSize: 11, lineHeight: 17, marginTop: 12 },
});
