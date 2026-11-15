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
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  primary?: boolean;
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
        (selected || primary) && s.selected,
        disabled && { opacity: 0.42 },
      ]}
    >
      <Text style={[s.buttonText, (selected || primary) && s.selectedText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
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
              <Text style={[s.orbitSymbol, { color: item.color ?? "#b6f9d7" }]}>
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
        Grada {ticket.zone} · sector {ticket.zone}-D · fila {ticket.row}
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
    [month, setMonth] = useState("");
  const [side, setSide] = useState<"have" | "want">("have"),
    [append, setAppend] = useState(false),
    [editIndex, setEditIndex] = useState<number | null>(null);
  const [have, setHave] = useState<DemoTicket[]>([]),
    [want, setWant] = useState<DemoTicket[]>([]);
  const [zone, setZone] = useState("Norte"),
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
    setMonth("");
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
  const selectSeat = (eventId: string) => {
    const existing = (pick.side === "have" ? have : want).find(
      (t) => t.eventId === eventId,
    );
    setZone(existing?.zone ?? "Norte");
    setRow(existing?.row ?? 3);
    setSeats(existing?.seats ?? [12]);
    navigate({ name: "seats", eventId, pick });
  };
  const commitTicket = (eventId: string) => {
    const ticket = {
      eventId,
      zone,
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
      ? "1 · Disciplinas"
      : screen.name === "clubs"
        ? "2 · Clubes / equipos"
        : screen.name === "events"
          ? "3 · Eventos y fechas"
          : screen.name === "seats"
            ? "4 · Localidades"
            : screen.name === "compose" || screen.name === "summary"
              ? "5 · Operación simulada"
              : "Mi espacio demo";
  const title =
    screen.name === "sports"
      ? "Elige un deporte"
      : screen.name === "clubs"
        ? DEMO_SPORTS.find((s) => s.id === screen.sport)!.label
        : screen.name === "events"
          ? DEMO_CLUBS.find((c) => c.id === screen.clubId)!.label
          : screen.name === "seats"
            ? "Elige tus localidades"
            : screen.name === "compose"
              ? "TENGO ↔ QUIERO"
              : screen.name === "summary"
                ? "Resumen del acuerdo"
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
  const pairing = (
    opHave: DemoTicket[],
    opWant: DemoTicket[],
    editable = false,
  ) => (
    <View style={[s.pair, width >= 650 && { flexDirection: "row" }]}>
      <View style={s.column}>
        <Text style={s.section}>TENGO · Tú (demo)</Text>
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
        <Text style={s.section}>QUIERO · otra parte ficticia</Text>
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
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>ADMIN · EVENTOS DEPORTIVOS</Text>
              <Text style={s.badge}>DEMO · simulación</Text>
            </View>
            <Button label="Reiniciar demo" onPress={reset} />
          </View>
          <Text style={s.privacy}>
            Espacio privado de esta cuenta ADMIN. Los ejemplos no se publican ni
            son visibles para EMPRESA o USUARIO.
          </Text>
          <ScrollView
            ref={scroller}
            style={{ flex: 1 }}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Text style={s.kicker}>{step}</Text>
            <Text accessibilityRole="header" style={s.title}>
              {title}
            </Text>
            {(screen.name === "clubs" ||
              screen.name === "events" ||
              screen.name === "seats") && (
              <Text style={s.small}>
                Seleccionando {pick.side === "have" ? "TENGO" : "QUIERO"}
                {have.length || want.length
                  ? ` · TENGO ${have.reduce((n, t) => n + t.seats.length, 0)} / QUIERO ${want.reduce((n, t) => n + t.seats.length, 0)}`
                  : ""}
              </Text>
            )}
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
                <Text style={s.body}>
                  Entradas, butacas y abonos. Elige disciplina y después club.
                  Ejemplos sintéticos; sin inventario real.
                </Text>
                <Field
                  label="Buscar deporte"
                  value={query}
                  onChange={setQuery}
                />
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
                <Text style={s.section}>
                  Demo guiada · un toque para empezar
                </Text>
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
                <Text style={s.body}>
                  Nombres de clubes como referencia de navegación. Sin
                  afiliación ni acuerdos oficiales; todos los eventos y recintos
                  son ficticios.
                </Text>
                <Field
                  label="Buscar club o equipo"
                  value={query}
                  onChange={setQuery}
                />
                <Orbit
                  key={`${screen.sport}:${query}`}
                  center="CLUBES"
                  items={DEMO_CLUBS.filter(
                    (c) =>
                      c.sport === screen.sport &&
                      c.label.toLowerCase().includes(query.toLowerCase()),
                  ).map((c) => ({
                    id: c.id,
                    label: c.label,
                    symbol: c.initials,
                    color: c.color,
                  }))}
                  onSelect={(clubId) =>
                    navigate({ name: "events", clubId, pick })
                  }
                />
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
                <Text style={s.body}>
                  Calendario DEMO 2027 · fechas inventadas para la presentación.
                </Text>
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
                      onPress={() => setMonth(m)}
                    />
                  ))}
                </View>
                {DEMO_EVENTS.filter(
                  (e) =>
                    e.clubId === screen.clubId &&
                    (!month || e.date.startsWith(month)),
                ).map((e) => (
                  <View key={e.id} style={s.card}>
                    <Text style={s.kicker}>
                      {dateLabel(e.date)} · {e.time}
                    </Text>
                    <Text style={s.cardTitle}>{e.title}</Text>
                    <Text style={s.body}>
                      {e.competition} · {e.venue}
                    </Text>
                    <Button
                      label={
                        e.excluded
                          ? "Excluido · ejemplo de restricción"
                          : `Elegir encuentro ${e.id.split("-").at(-1)}`
                      }
                      disabled={e.excluded}
                      onPress={() => selectSeat(e.id)}
                    />
                  </View>
                ))}
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
                <Text style={s.notice}>
                  Esquema ilustrativo NO OFICIAL. Los asientos son de muestra;
                  no representan disponibilidad ni derechos de acceso.
                </Text>
                <View style={s.pitch}>
                  <Text style={s.pitchText}>RECINTO DEMO</Text>
                </View>
                <Text style={s.label}>Grada / sector</Text>
                <View style={s.wrap}>
                  {DEMO_ZONES.map((z) => (
                    <Button
                      key={z}
                      label={z}
                      selected={zone === z}
                      onPress={() => setZone(z)}
                    />
                  ))}
                </View>
                <Text style={s.label}>Fila</Text>
                <View style={s.wrap}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Button
                      key={n}
                      label={`Fila ${n}`}
                      selected={row === n}
                      onPress={() => setRow(n)}
                    />
                  ))}
                </View>
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
                  {seats.length} localidad(es) · grada {zone} · sector {zone}-D
                  · fila {row}
                </Text>
                <Button
                  primary
                  label={`Usar ${seats.length} localidad(es) en ${pick.side === "have" ? "TENGO" : "QUIERO"}`}
                  disabled={!seats.length}
                  onPress={() => commitTicket(screen.eventId)}
                />
                <Button
                  label="Cambiar club o evento"
                  onPress={() => browse(pick.side, pick.append, pick.editIndex)}
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
                    <Text style={s.notice}>
                      Acceso no verificado. Aceptar este ejemplo no valida
                      titularidad, disponibilidad ni permiso de cesión. La
                      entrega de ambas partes requeriría un proceso oficial; no
                      hay depósito ni garantía de atomicidad.
                    </Text>
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
                <Text style={s.body}>
                  Ofertas y titulares ficticios. Filtros guardados solo durante
                  esta sesión demo.
                </Text>
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
                <Text style={s.body}>
                  Titular ficticio · acceso no verificado · ninguna
                  disponibilidad real.
                </Text>
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
                <Text style={s.body}>
                  Cada abono es independiente de sus derechos por evento. No se
                  transfiere el abono completo. Calendario inventado, sin
                  importación oficial.
                </Text>
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
            <Text style={s.footer}>
              DEMO · datos sintéticos en memoria. Se descartan al cerrar o
              cambiar de cuenta. Sin QR, pagos, publicación ni transferencia
              real. Acceso no verificado.
            </Text>
          </ScrollView>
          <GoNavigationFloating
            screenKey="sports-events-demo"
            handedness={handedness}
            width={136}
          >
            <GoCloseButton
              level="panel"
              accessibilityLabel="Volver un nivel en Eventos Deportivos"
              onPress={back}
            />
            <GoCloseButton
              level="container"
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
  safe: { flex: 1, backgroundColor: "#081510" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  kicker: {
    color: "#8ee7b5",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  badge: { color: "#f7d77c", fontSize: 15, fontWeight: "800", marginTop: 5 },
  privacy: {
    color: "#9faea8",
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  content: {
    padding: 16,
    paddingBottom: 112,
    gap: 12,
    maxWidth: 950,
    width: "100%",
    alignSelf: "center",
  },
  title: { color: "#fff", fontSize: 27, fontWeight: "800" },
  section: { color: "#e8f7ef", fontSize: 18, fontWeight: "800", marginTop: 8 },
  body: { color: "#c5d5cc", fontSize: 14, lineHeight: 21 },
  small: { color: "#9eb7a9", fontSize: 12, lineHeight: 18 },
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3a5949",
    backgroundColor: "#152c20",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 1,
  },
  selected: { backgroundColor: "#b5f47e", borderColor: "#b5f47e" },
  buttonText: {
    color: "#ecf8f0",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  selectedText: { color: "#102116" },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  field: { gap: 6 },
  label: { color: "#c8e1d2", fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 50,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#41604d",
    color: "#fff",
    fontSize: 16,
    backgroundColor: "#10241a",
  },
  card: {
    borderRadius: 19,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2f4f3d",
    backgroundColor: "#10251b",
    gap: 10,
  },
  cardTitle: { color: "#f1fff6", fontSize: 17, fontWeight: "700" },
  seatText: {
    color: "#d0f3b9",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "700",
  },
  notice: {
    padding: 12,
    backgroundColor: "#26301b",
    color: "#eee0a7",
    borderRadius: 13,
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    padding: 12,
    backgroundColor: "#401e20",
    color: "#ffd0cb",
    borderRadius: 13,
    fontSize: 14,
  },
  status: { color: "#ecdb98", fontSize: 16, fontWeight: "800" },
  orbit: {
    backgroundColor: "#163d2c",
    borderWidth: 1.5,
    borderColor: "#68ae87",
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    padding: 7,
    gap: 3,
  },
  orbitSymbol: { fontSize: 23, fontWeight: "800" },
  orbitLabel: {
    color: "#fff",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  orbitRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#284f3a",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitCenter: { color: "#c5f774", fontSize: 30, fontWeight: "900" },
  page: { color: "#c9e4d4", padding: 8 },
  pitch: {
    height: 80,
    backgroundColor: "#236144",
    borderWidth: 2,
    borderColor: "#8cc9a5",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pitchText: {
    color: "#c9efb4",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2,
  },
  pair: { gap: 14 },
  column: { flex: 1, gap: 12 },
  calendarRow: {
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#34523f",
    gap: 10,
  },
  footer: { color: "#91a89b", fontSize: 11, lineHeight: 17, marginTop: 12 },
});
