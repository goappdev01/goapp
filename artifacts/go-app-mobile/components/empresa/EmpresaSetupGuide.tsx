/**
 * EmpresaSetupGuide
 * Guided 4-step onboarding for new business accounts.
 * Rendered as an absolute overlay inside EmpresaPanel (no nested Modal).
 * State persisted via AsyncStorage so the user can exit and resume.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GoTimeField } from "@/components/ui/GoTimePicker";
import { DraggableFAB } from "@/components/DraggableFAB";
import { hapticNextStep } from "@/utils/goHaptics";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import {
  EMOJI_PALETTE,
  PlantillaItem,
  SECTORS,
  SUGGESTED_SERVICES,
  getAddLabel,
  getSectorLabel,
  getSubName,
  type Sector,
} from "@/data/goSectorData";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { trSector } from "@/data/goSectorTranslations";
import type { Lang } from "@/i18n/translations";

// ─── Storage ────────────────────────────────────────────────────────────────

export const SETUP_KEY = "go_empresa_setup_v2";

export type SavedService = { name: string; duration: number; price: number };

export type SetupState = {
  completedSteps: number[];
  firstOpenDone: boolean;
  // Configuración persistida de la empresa
  sectorId?: string;
  subId?: string;
  activeDays?: number[];
  openFrom?: string;
  openTo?: string;
  services?: SavedService[];
  paymentPolicy?: number;
  approvalPolicy?: number;
  cancelPolicy?: number;
};

export const DEFAULT_SETUP_STATE: SetupState = {
  completedSteps: [],
  firstOpenDone: false,
};

export async function loadSetupState(): Promise<SetupState> {
  try {
    const raw = await AsyncStorage.getItem(SETUP_KEY);
    return raw ? (JSON.parse(raw) as SetupState) : DEFAULT_SETUP_STATE;
  } catch {
    return DEFAULT_SETUP_STATE;
  }
}

export async function saveSetupState(s: SetupState): Promise<void> {
  try {
    await AsyncStorage.setItem(SETUP_KEY, JSON.stringify(s));
  } catch { /* silencioso */ }
}

// ─── Visual tokens ───────────────────────────────────────────────────────────

const BG      = "#F7F8FA";
const CARD    = "#FFFFFF";
const BORDER  = "rgba(0,0,0,0.08)";
const TEXT    = "#111827";
const GRAY    = "#6B7280";
const DIM     = "#9CA3AF";
const BLUE    = "#4A80BD";
const GREEN   = "#3D9A84";
const PURPLE  = "#7C69BE";
const GOLD    = "#C4883A";

// ─── Step definitions ────────────────────────────────────────────────────────

type StepDef = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  label: string;
};

function buildSteps(t: (k: any) => string): StepDef[] {
  return [
    { key: "actividad", icon: "tag",     color: GREEN,  title: t("biz_step_actividad_title"), subtitle: t("biz_step_actividad_subtitle"), label: t("biz_step_actividad_label") },
    { key: "plantilla", icon: "layers",  color: BLUE,   title: t("biz_step_plantilla_title"), subtitle: t("biz_step_plantilla_subtitle"), label: t("biz_step_plantilla_label") },
    { key: "horario",   icon: "clock",   color: PURPLE, title: t("biz_step_horario_title"),   subtitle: t("biz_step_horario_subtitle"),   label: t("biz_step_horario_label")  },
    { key: "reserva",   icon: "share-2", color: GOLD,   title: t("biz_step_reserva_title"),   subtitle: t("biz_step_reserva_subtitle"),   label: t("biz_step_reserva_label")  },
  ];
}

const MOCK_LINK = "https://go.teso.app/b/mi-negocio";

// ─── Day picker / Horarios y Servicios (Step 2) ───────────────────────────────

const DAYS_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

type MiniService = { id: string; name: string; duration: number; price: number };


function makeSuggestedServices(subId: string | null | undefined): MiniService[] {
  if (!subId) return [{ id: "s1", name: "", duration: 30, price: 0 }];
  const suggestions = SUGGESTED_SERVICES[subId];
  if (!suggestions || suggestions.length === 0) return [{ id: "s1", name: "", duration: 30, price: 0 }];
  return suggestions.map((s, i) => ({ id: `s${i + 1}`, name: s.name, duration: s.duration, price: s.price }));
}

function Step1Horario({
  subId, sector,
  activeDays, setActiveDays,
  openFrom, setOpenFrom,
  openTo, setOpenTo,
  services, setServices,
}: {
  subId?: string | null;
  sector?: Sector | null;
  activeDays: number[];
  setActiveDays: (v: number[]) => void;
  openFrom: string;
  setOpenFrom: (v: string) => void;
  openTo: string;
  setOpenTo: (v: string) => void;
  services: MiniService[];
  setServices: (v: MiniService[]) => void;
}) {
  const { t, lang } = useLanguage();
  const toggleDay = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveDays(activeDays.includes(i) ? activeDays.filter(d => d !== i) : [...activeDays, i]);
  };

  const addService = () => {
    Haptics.selectionAsync().catch(() => {});
    setServices([...services, { id: Date.now().toString(), name: "", duration: 30, price: 0 }]);
  };

  const patchService = (id: string, patch: Partial<MiniService>) => {
    setServices(services.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeService = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setServices(services.filter(s => s.id !== id));
  };

  // Context pill — which activity was selected
  const ctxSub = sector?.subs.find(s => s.id === subId);
  const hasSuggestions = !!(subId && SUGGESTED_SERVICES[subId]?.length);

  return (
    <View style={g.stepBody}>
      {/* Activity context indicator */}
      {sector && sector.id !== "otros" && (
        <View style={[g.sectionCard, { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }]}>
          <View style={[g.actIcon, { backgroundColor: sector.color + "18", width: 38, height: 38, borderRadius: 12 }]}>
            <Text style={{ fontSize: 18 }}>{sector.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[g.sectionLabel, { color: sector.color }]}>
              {getSectorLabel(sector, lang)}{ctxSub ? ` · ${getSubName(ctxSub, lang)}` : ""}
            </Text>
            <Text style={g.sectionSub}>
              {hasSuggestions ? t("biz_preloaded_services_hint") : t("biz_customize_services_hint")}
            </Text>
          </View>
        </View>
      )}

      {/* Days */}
      <View style={g.sectionCard}>
        <Text style={g.sectionLabel}>{t("biz_available_days")}</Text>
        <View style={g.chipRow}>
          {DAYS_SHORT.map((d, i) => {
            const active = activeDays.includes(i);
            return (
              <TouchableOpacity
                key={d}
                activeOpacity={0.8}
                onPress={() => toggleDay(i)}
                style={[g.dayChip, active && { backgroundColor: BLUE }]}
              >
                <Text style={[g.dayChipTxt, active && { color: "#fff" }]}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Hours */}
      <View style={g.sectionCard}>
        <Text style={g.sectionLabel}>{t("biz_opening_hours")}</Text>
        <View style={g.timeRow}>
          <View style={{ flex: 1 }}>
            <GoTimeField label={t("biz_opens")} value={openFrom} onConfirm={setOpenFrom} minuteStep={30} accentColor={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <GoTimeField label={t("biz_closes")} value={openTo} onConfirm={setOpenTo} minuteStep={30} accentColor={BLUE} />
          </View>
        </View>
      </View>

      {/* Services */}
      <View style={g.sectionCard}>
        <Text style={g.sectionLabel}>{t("biz_main_services")}</Text>
        <Text style={g.sectionSub}>{t("biz_add_whats_offered")}</Text>
        {services.map((svc, idx) => (
          <View key={svc.id} style={g.svcRow}>
            <TextInput
              style={g.svcNameInput}
              value={trSector(svc.name, lang)}
              onChangeText={v => patchService(svc.id, { name: v })}
              placeholder={idx === 0 ? t("biz_service_placeholder_first") : t("biz_service_placeholder")}
              placeholderTextColor={DIM}
              returnKeyType="done"
            />
            <View style={g.svcMeta}>
              <View style={g.numBox}>
                <TextInput
                  style={g.numInput}
                  value={String(svc.duration)}
                  onChangeText={v => patchService(svc.id, { duration: parseInt(v) || 0 })}
                  selectTextOnFocus keyboardType="numeric" returnKeyType="done"
                />
                <Text style={g.numUnit}>min</Text>
              </View>
              <View style={g.numBox}>
                <TextInput
                  style={g.numInput}
                  value={svc.price ? String(svc.price) : ""}
                  onChangeText={v => patchService(svc.id, { price: parseFloat(v) || 0 })}
                  selectTextOnFocus keyboardType="numeric" returnKeyType="done"
                  placeholder="0"
                  placeholderTextColor={DIM}
                />
                <Text style={g.numUnit}>€</Text>
              </View>
              {services.length > 1 && (
                <TouchableOpacity onPress={() => removeService(svc.id)} hitSlop={8} activeOpacity={0.7}>
                  <Feather name="x" size={16} color={DIM} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={addService} activeOpacity={0.8} style={g.addSvcBtn}>
            <Feather name="plus" size={14} color={BLUE} />
            <Text style={g.addSvcTxt}>{t("biz_add_service_btn")}</Text>
          </TouchableOpacity>

          {hasSuggestions && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setServices(makeSuggestedServices(subId));
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4 }}
            >
              <Feather name="refresh-cw" size={12} color={DIM} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: DIM }}>{t("biz_reset")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Activity picker (Step 0) ────────────────────────────────────────────────

function getSpaceTypesOtros(t: (key: string) => string) {
  return [
    { label: t("biz_space_mesa"),       icon: "square",      color: "#4A80BD" },
    { label: t("biz_space_cabina"),     icon: "box",         color: "#3D9A84" },
    { label: t("biz_space_sala"),       icon: "home",        color: "#7C69BE" },
    { label: t("biz_space_puesto"),     icon: "briefcase",   color: "#C4883A" },
    { label: t("biz_space_habitacion"), icon: "map-pin",     color: "#C25A5A" },
    { label: t("biz_space_otro"),       icon: "plus-circle", color: "#6B7280" },
  ];
}

export function Step0Actividad({ sector, setSector, subId, setSubId, onSubConfirmed }: {
  sector: Sector | null;
  setSector: (s: Sector | null) => void;
  subId: string | null;
  setSubId: (id: string | null) => void;
  onSubConfirmed?: () => void;
}) {
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState("");

  // Reset query whenever the user changes sector view
  useEffect(() => { setQuery(""); }, [sector?.id]);

  // Auto-advance when sector has exactly one sub-activity — no intermediate screen needed
  useEffect(() => {
    if (sector && sector.id !== "otros" && sector.subs.length === 1) {
      setSubId(sector.subs[0].id);
      onSubConfirmed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector?.id]);

  const q = query.toLowerCase().trim();

  // Filtered sectors: match label or any subsector name (both languages)
  const filteredSectors = q
    ? SECTORS.filter(s =>
        s.label.toLowerCase().includes(q) ||
        getSectorLabel(s, lang).toLowerCase().includes(q) ||
        s.subs.some(sub => sub.name.toLowerCase().includes(q) || getSubName(sub, lang).toLowerCase().includes(q))
      )
    : SECTORS;

  // Filtered subsectors (only relevant when a sector is selected)
  const filteredSubs = sector
    ? (q ? sector.subs.filter(sub => sub.name.toLowerCase().includes(q) || getSubName(sub, lang).toLowerCase().includes(q)) : sector.subs)
    : [];

  // ── Sector grid
  if (!sector) {
    const rows: Sector[][] = [];
    for (let i = 0; i < filteredSectors.length; i += 2) rows.push(filteredSectors.slice(i, i + 2));
    return (
      <View style={g.stepBody}>
        <View style={g.sectionCard}>
          {/* Buscador — solo cuando hay suficientes sectores */}
          {SECTORS.length > 5 && (
            <View style={g.searchBox}>
              <Feather name="search" size={13} color={DIM} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("biz_search_sector_ph")}
                placeholderTextColor={DIM}
                style={g.searchInput}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCorrect={false}
              />
            </View>
          )}

          {rows.length > 0 ? rows.map((row, ri) => (
            <View key={ri} style={[g.actRow, row.length === 1 && { justifyContent: "center" }]}>
              {row.map(sec => (
                <TouchableOpacity
                  key={sec.id}
                  activeOpacity={0.8}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setSector(sec); setSubId(null); }}
                  style={[g.actTile, { borderColor: sec.color + "65" }, row.length === 1 && { flex: 0, width: "100%" }]}
                >
                  <View style={[g.actIcon, { backgroundColor: sec.color + "15" }]}>
                    <Text style={{ fontSize: 30 }}>{sec.emoji}</Text>
                  </View>
                  <Text
                    style={[g.actLabel, { color: sec.color }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >{getSectorLabel(sec, lang)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )) : (
            <View style={g.emptySearch}>
              <Feather name="search" size={20} color={DIM} />
              <Text style={g.emptySearchTxt}>{t("biz_not_found")}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ── "Otros / Desde cero" — no sub-activities; advance immediately
  if (sector.id === "otros") {
    return <View style={g.stepBody} />;
  }

  // ── Sub-template grid (same 2-col visual as sector grid)
  const subRows: (typeof sector.subs[number])[][] = [];
  for (let i = 0; i < filteredSubs.length; i += 2) subRows.push(filteredSubs.slice(i, i + 2));

  return (
    <View style={g.stepBody}>
      <View style={g.sectionCard}>
        {/* Buscador de subsectores — solo cuando hay suficientes */}
        {sector.subs.length > 5 && (
          <View style={g.searchBox}>
            <Feather name="search" size={13} color={DIM} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`${t("biz_search_in_prefix")}${getSectorLabel(sector, lang)}...`}
              placeholderTextColor={DIM}
              style={g.searchInput}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
          </View>
        )}

        {subRows.length > 0 ? subRows.map((row, ri) => (
          <View key={ri} style={[g.actRow, row.length === 1 && { justifyContent: "center" }]}>
            {row.map(sub => (
              <TouchableOpacity
                key={sub.id}
                activeOpacity={0.75}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSubId(sub.id);
                  onSubConfirmed?.();
                }}
                style={[g.actTile, { borderColor: sector.color + "60" }, row.length === 1 && { flex: 0, width: "100%" }]}
              >
                <View style={[g.actIcon, { backgroundColor: sector.color + "12" }]}>
                  <Text style={{ fontSize: 30 }}>{sub.emoji}</Text>
                </View>
                <Text style={[g.actLabel, { color: GRAY }]} numberOfLines={2}>{getSubName(sub, lang)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )) : (
          <View style={g.emptySearch}>
            <Feather name="search" size={20} color={DIM} />
            <Text style={g.emptySearchTxt}>{t("biz_not_found")}</Text>
          </View>
        )}
      </View>

    </View>
  );
}

// ─── Template & Structure (Step 1) ───────────────────────────────────────────

// (SECTOR_STRUCTURES, PlantillaItem, initPlantillaItems, getAddLabel, EMOJI_PALETTE
//  imported from @/data/goSectorData — single source of truth)

function Step1Plantilla({ sector, subId }: {
  sector: Sector | null;
  subId: string | null;
}) {
  const { t, lang } = useLanguage();
  // ── Única fuente de verdad: GoBusinessConfigContext ──────────────────────────
  const { config: bc, updateConfig: upd } = useBusinessConfig();
  const items = bc.plantillaItems;
  const setItems = (updater: PlantillaItem[] | ((prev: PlantillaItem[]) => PlantillaItem[])) => {
    const next = typeof updater === "function" ? updater(bc.plantillaItems) : updater;
    upd({ plantillaItems: next });
  };
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState("🪑");
  const [spaceIdx, setSpaceIdx] = useState(0);

  const removeItem = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const patchCount = (id: string, delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, count: Math.max(1, it.count + delta) } : it
    ));
  };

  const patchLabel = (id: string, label: string) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, label } : it));

  const cycleEmoji = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const idx = EMOJI_PALETTE.indexOf(it.emoji);
      const next = EMOJI_PALETTE[(idx + 1) % EMOJI_PALETTE.length];
      return { ...it, emoji: next };
    }));
  };

  const commitNewItem = () => {
    if (!newLabel.trim()) return;
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => [...prev, {
      id: `pi_${Date.now()}`,
      emoji: newEmoji,
      label: newLabel.trim(),
      count: 1,
    }]);
    setNewLabel("");
    setNewEmoji("🪑");
    setAddingNew(false);
  };

  // No activity selected yet
  if (!sector) {
    return (
      <View style={g.stepBody}>
        <View style={[g.sectionCard, { alignItems: "center", paddingVertical: 28 }]}>
          <Feather name="arrow-left" size={28} color={DIM} style={{ marginBottom: 10 }} />
          <Text style={[g.sectionLabel, { fontSize: 12, textAlign: "center" }]}>{t("biz_back_to_previous_step")}</Text>
          <Text style={[g.sectionSub, { textAlign: "center", marginTop: 4 }]}>{t("biz_select_activity_first")}</Text>
        </View>
      </View>
    );
  }

  // "Otros" — show space type picker here
  if (sector.id === "otros") {
    return (
      <View style={g.stepBody}>
        <View style={g.sectionCard}>
          <Text style={g.sectionLabel}>{t("biz_main_space_type")}</Text>
          <Text style={g.sectionSub}>{t("biz_define_own_spaces")}</Text>
          <View style={g.spaceGrid}>
            {getSpaceTypesOtros(t as (key: string) => string).map((st, i) => {
              const active = spaceIdx === i;
              return (
                <TouchableOpacity
                  key={st.label}
                  activeOpacity={0.8}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setSpaceIdx(i); }}
                  style={[g.spaceCard, active && { borderColor: st.color, backgroundColor: st.color + "10" }]}
                >
                  <View style={[g.spaceIcon, { backgroundColor: st.color + "20" }]}>
                    <Feather name={st.icon as any} size={22} color={st.color} />
                  </View>
                  <Text style={[g.spaceTxt, active && { color: st.color, fontWeight: "700" }]} numberOfLines={1}>{trSector(st.label, lang)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={g.previewRow}>
          <Feather name="info" size={13} color={DIM} />
          <Text style={g.previewTxt}>{t("biz_add_more_space_hint")}</Text>
        </View>
      </View>
    );
  }

  const sub = sector.subs.find((s: { id: string }) => s.id === subId);
  const addLabel = getAddLabel(subId, lang);

  return (
    <View style={g.stepBody}>

      {/* Header card — activity context */}
      <View style={[g.sectionCard, { borderLeftWidth: 3, borderLeftColor: sector.color }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 22 }}>{sub?.emoji ?? sector.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[g.sectionLabel, { color: sector.color }]}>{sub ? getSubName(sub, lang) : getSectorLabel(sector, lang)}</Text>
            <Text style={g.sectionSub}>{t("biz_suggested_template")}</Text>
          </View>
        </View>
      </View>

      {/* Editable template items */}
      <View style={g.sectionCard}>
        <Text style={g.sectionLabel}>{t("biz_spaces_and_zones")}</Text>

        {items.length === 0 && !addingNew && (
          <View style={[g.previewRow, { paddingHorizontal: 0 }]}>
            <Feather name="info" size={13} color={DIM} />
            <Text style={g.previewTxt}>
              {subId
                ? t("biz_no_items_add_first")
                : t("biz_select_specialty_first")}
            </Text>
          </View>
        )}

        {items.map(item => (
          <View
            key={item.id}
            style={[g.plantillaRow, { borderColor: sector.color + "25", backgroundColor: sector.color + "04" }]}
          >
            {/* Emoji — tap to cycle */}
            <TouchableOpacity onPress={() => cycleEmoji(item.id)} hitSlop={8} activeOpacity={0.6}>
              <Text style={{ fontSize: 20, minWidth: 28, textAlign: "center" }}>{item.emoji}</Text>
            </TouchableOpacity>
            {/* Label — inline editable */}
            <TextInput
              style={[g.subLabel, { flex: 1, paddingVertical: 2 }]}
              value={item.label}
              onChangeText={v => patchLabel(item.id, v)}
              placeholder={t("biz_space_name_ph")}
              placeholderTextColor={DIM}
              returnKeyType="done"
            />

            {/* Count stepper */}
            <View style={g.miniCounter}>
              <TouchableOpacity
                onPress={() => patchCount(item.id, -1)}
                hitSlop={8}
                activeOpacity={0.7}
                style={[g.miniCountBtn, item.count <= 1 && { opacity: 0.3 }]}
                disabled={item.count <= 1}
              >
                <Feather name="minus" size={12} color={BLUE} />
              </TouchableOpacity>
              <Text style={g.miniCountNum}>{item.count}</Text>
              <TouchableOpacity
                onPress={() => patchCount(item.id, 1)}
                hitSlop={8}
                activeOpacity={0.7}
                style={g.miniCountBtn}
              >
                <Feather name="plus" size={12} color={BLUE} />
              </TouchableOpacity>
            </View>

            {/* Delete */}
            <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={10} activeOpacity={0.7} style={g.deleteBtn}>
              <Feather name="x" size={15} color={DIM} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add new item form */}
        {addingNew ? (
          <View style={[g.plantillaRow, { flexDirection: "column", alignItems: "stretch", borderColor: BLUE + "40", backgroundColor: BLUE + "04", gap: 10 }]}>
            {/* Emoji picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 4 }}>
                {EMOJI_PALETTE.map(em => (
                  <TouchableOpacity
                    key={em}
                    activeOpacity={0.7}
                    onPress={() => setNewEmoji(em)}
                    style={[
                      g.emojiChip,
                      newEmoji === em && { borderColor: BLUE, backgroundColor: BLUE + "12" },
                    ]}
                  >
                    <Text style={{ fontSize: 18 }}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Label input */}
            <TextInput
              style={g.svcNameInput}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder={t("biz_space_name_ph")}
              placeholderTextColor={DIM}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={commitNewItem}
            />

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={commitNewItem}
                style={[g.addSvcBtn, { backgroundColor: BLUE + "12", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }]}
              >
                <Feather name="check" size={14} color={BLUE} />
                <Text style={g.addSvcTxt}>{t("biz_add")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { setAddingNew(false); setNewLabel(""); }}
                style={{ paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center" }}
              >
                <Text style={{ fontSize: 13, color: DIM, fontWeight: "600" }}>{t("biz_cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          subId ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setAddingNew(true); }}
              style={g.addSvcBtn}
            >
              <Feather name="plus" size={14} color={BLUE} />
              <Text style={g.addSvcTxt}>{addLabel}</Text>
            </TouchableOpacity>
          ) : null
        )}
      </View>

      <View style={g.previewRow}>
        <Feather name="info" size={13} color={DIM} />
        <Text style={g.previewTxt}>
          {t("biz_go_proposes_base")}
        </Text>
      </View>
    </View>
  );
}

// ─── Booking rules (Step 2 — was Step 3) ─────────────────────────────────────

type PolicyOpt = { label: string; sub: string; icon: keyof typeof Feather.glyphMap };

function buildPaymentOpts(t: (k: any) => string): PolicyOpt[] {
  return [
    { label: t("biz_free_booking"), sub: t("biz_no_prepay"),        icon: "gift"        },
    { label: t("biz_prepay"),       sub: t("biz_prepay_required"),  icon: "credit-card" },
  ];
}
function buildApprovalOpts(t: (k: any) => string): PolicyOpt[] {
  return [
    { label: t("biz_automatic"), sub: t("biz_auto_confirm"),   icon: "zap"   },
    { label: t("biz_manual"),    sub: t("biz_manual_approve"), icon: "check" },
  ];
}
function buildCancelOpts(t: (k: any) => string): PolicyOpt[] {
  return [
    { label: t("biz_flexible"),         sub: t("biz_flexible_24h"),          icon: "refresh-cw" },
    { label: t("biz_strict"),           sub: t("biz_strict_48h"),            icon: "shield"      },
    { label: t("biz_no_cancellation"),  sub: t("biz_no_cancellation_allowed"), icon: "x-circle"  },
  ];
}

function PolicyRow({ title, opts, value, onChange, color }: {
  title: string;
  opts: PolicyOpt[];
  value: number;
  onChange: (i: number) => void;
  color: string;
}) {
  return (
    <View style={g.sectionCard}>
      <Text style={g.sectionLabel}>{title}</Text>
      <View style={{ gap: 8 }}>
        {opts.map((o, i) => {
          const active = value === i;
          return (
            <TouchableOpacity
              key={o.label}
              activeOpacity={0.8}
              onPress={() => { onChange(i); }}
              style={[g.policyCard, active && { borderColor: color, backgroundColor: color + "08" }]}
            >
              <View style={[g.policyIcon, { backgroundColor: color + (active ? "20" : "10") }]}>
                <Feather name={o.icon} size={18} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[g.policyLabel, active && { color, fontWeight: "700" }]}>{o.label}</Text>
                <Text style={g.policySub}>{o.sub}</Text>
              </View>
              {active && <Feather name="check-circle" size={18} color={color} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Reservas + Publicación (Step 3 — combines old Steps 3+4) ────────────────

function Step3ReservaPublicacion({
  isVerified,
  payment, setPayment,
  approval, setApproval,
  cancel, setCancel,
  onOpenVerificacion,
}: {
  isVerified?: boolean;
  payment: number;  setPayment:  (v: number) => void;
  approval: number; setApproval: (v: number) => void;
  cancel: number;   setCancel:   (v: number) => void;
  onOpenVerificacion?: () => void;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const sinPago = payment === 0;
  const PAYMENT_OPTS = buildPaymentOpts(t);
  const APPROVAL_OPTS = buildApprovalOpts(t);
  const CANCEL_OPTS = buildCancelOpts(t);

  const handleShare = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({ message: `${t("biz_book_via_go")}\n${MOCK_LINK}`, url: MOCK_LINK, title: t("biz_book_in_business") });
    } catch { /* silencioso */ }
  };

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(MOCK_LINK);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* silencioso */ }
  };

  return (
    <View style={g.stepBody}>
      {/* ── Booking policy ── */}
      <PolicyRow title={t("biz_booking_type")} opts={PAYMENT_OPTS}  value={payment}  onChange={setPayment}  color={GOLD}   />
      <PolicyRow title={t("biz_approval")}     opts={APPROVAL_OPTS} value={approval} onChange={setApproval} color={BLUE}   />

      {sinPago ? (
        <View style={[g.sectionCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
          <View style={[g.policyIcon, { backgroundColor: GREEN + "15" }]}>
            <Feather name="check-circle" size={18} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[g.policyLabel, { color: GREEN, fontWeight: "700" }]}>{t("biz_free_cancellation")}</Text>
            <Text style={g.policySub}>{t("biz_no_prepay_no_refund")}</Text>
          </View>
        </View>
      ) : (
        <PolicyRow title={t("biz_cancellations")} opts={CANCEL_OPTS} value={cancel} onChange={setCancel} color={GREEN} />
      )}

      {/* ── Divider ── */}
      <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 4 }} />

      {/* ── Share / QR ── */}
      <View style={[g.sectionCard, { alignItems: "center", paddingVertical: 20 }]}>
        <View style={g.qrWrapper}>
          <QRCode value={MOCK_LINK} size={150} backgroundColor="#FFFFFF" color="#111827" />
        </View>
        <Text style={g.qrLinkTxt}>{MOCK_LINK}</Text>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={handleShare} style={[g.bigBtn, { backgroundColor: GOLD }]}>
        <Feather name="share-2" size={18} color="#fff" />
        <Text style={g.bigBtnTxt}>{t("biz_share_whatsapp")}</Text>
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.85} onPress={handleCopy} style={[g.bigBtn, { backgroundColor: copied ? GREEN : CARD, borderWidth: 1, borderColor: copied ? GREEN : BORDER }]}>
        <Feather name={copied ? "check" : "copy"} size={18} color={copied ? "#fff" : BLUE} />
        <Text style={[g.bigBtnTxt, { color: copied ? "#fff" : BLUE }]}>
          {copied ? t("biz_link_copied") : t("biz_copy_link")}
        </Text>
      </TouchableOpacity>

      {isVerified ? (
        <View style={g.previewRow}>
          <Feather name="check-circle" size={13} color={GREEN} />
          <Text style={[g.previewTxt, { color: GREEN }]}>{t("biz_can_receive_bookings")}</Text>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpenVerificacion?.(); }}
          style={[g.sectionCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}
        >
          <View style={[g.policyIcon, { backgroundColor: GOLD + "18" }]}>
            <Feather name="alert-circle" size={18} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[g.policyLabel, { color: GOLD, fontWeight: "700" }]}>{t("biz_verification_pending")}</Text>
            <Text style={g.policySub}>{t("biz_tap_to_verify_hint")}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={GOLD} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface EmpresaSetupGuideProps {
  visible: boolean;
  setupState: SetupState;
  onClose: () => void;
  onSetupStateChange: (s: SetupState) => void;
  isVerified?: boolean;
  onOpenVerificacion?: () => void;
}

export function EmpresaSetupGuide({
  visible,
  setupState,
  onClose,
  onSetupStateChange,
  isVerified,
  onOpenVerificacion,
}: EmpresaSetupGuideProps) {
  const insets  = useSafeAreaInsets();
  const { t } = useLanguage();
  const STEPS = buildSteps(t);
  const { config: bConfig, updateConfig, resetToSubActivity } = useBusinessConfig();

  // ── Actividad (Step 0) — estado de visualización; subId viene del contexto ───
  const [selectedSector, setSelectedSector] = useState<Sector | null>(() =>
    bConfig.sectorId
      ? (SECTORS.find(s => s.id === bConfig.sectorId) ?? null)
      : null
  );
  const selectedSubId = bConfig.subId;

  // ── Horarios y Servicios (Step 2) — estado local sembrado desde contexto ─────
  const [activeDays,  setActiveDays]  = useState<number[]>(bConfig.activeDays);
  const [openFrom,    setOpenFrom]    = useState<string>(bConfig.openFrom);
  const [openTo,      setOpenTo]      = useState<string>(bConfig.openTo);
  const [services,    setServices]    = useState<MiniService[]>(() =>
    bConfig.services.length > 0
      ? bConfig.services.map((s, i) => ({ id: `sv${i}`, ...s }))
      : makeSuggestedServices(bConfig.subId ?? null)
  );

  // ── Reservas y Publicación (Step 3) — estado local sembrado desde contexto ───
  const [paymentPolicy,  setPaymentPolicy]  = useState<number>(bConfig.paymentPolicy);
  const [approvalPolicy, setApprovalPolicy] = useState<number>(bConfig.approvalPolicy);
  const [cancelPolicy,   setCancelPolicy]   = useState<number>(bConfig.cancelPolicy);

  // Determine which step to show based on first incomplete step
  const firstIncomplete = STEPS.findIndex((_, i) => !setupState.completedSteps.includes(i));
  const [currentStep, setCurrentStep] = useState(firstIncomplete >= 0 ? firstIncomplete : 0);

  const slideAnim  = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const scrollRef  = useRef<ScrollView>(null);

  // Fade in when visible
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  // Sync currentStep when setupState changes externally
  useEffect(() => {
    const first = STEPS.findIndex((_, i) => !setupState.completedSteps.includes(i));
    setCurrentStep(first >= 0 ? first : STEPS.length - 1);
  }, [setupState.completedSteps.length]);

  const animateToStep = (next: number) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: 1, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start(() => {
      setCurrentStep(next);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 40);
    });
  };

  // Snapshot de toda la configuración actual para guardar en AsyncStorage
  const syncToContext = useCallback(() => {
    updateConfig({
      activeDays,
      openFrom,
      openTo,
      services: services.filter(s => s.name.trim()).map(({ name, duration, price }) => ({ name, duration, price })),
      paymentPolicy,
      approvalPolicy,
      cancelPolicy,
    });
  }, [updateConfig, activeDays, openFrom, openTo, services, paymentPolicy, approvalPolicy, cancelPolicy]);

  const buildConfigSnapshot = useCallback((): Partial<SetupState> => ({
    sectorId:      selectedSector?.id,
    subId:         bConfig.subId ?? undefined,
    activeDays,
    openFrom,
    openTo,
    services: services
      .filter(s => s.name.trim())
      .map(({ name, duration, price }) => ({ name, duration, price })),
    paymentPolicy,
    approvalPolicy,
    cancelPolicy,
  }), [selectedSector, bConfig.subId, activeDays, openFrom, openTo, services, paymentPolicy, approvalPolicy, cancelPolicy]);

  const handleNext = async () => {
    await hapticNextStep();

    // Sincroniza horario/servicios/políticas con el contexto global
    syncToContext();

    const snapshot = buildConfigSnapshot();
    const already = setupState.completedSteps.includes(currentStep);
    const newCompleted = already
      ? setupState.completedSteps
      : [...setupState.completedSteps, currentStep].sort();

    const updated: SetupState = { ...setupState, ...snapshot, completedSteps: newCompleted, firstOpenDone: true };
    await saveSetupState(updated);
    onSetupStateChange(updated);

    const isLast = currentStep >= STEPS.length - 1;
    if (isLast) { onClose(); } else { animateToStep(currentStep + 1); }
  };

  const handleSkipStep = async () => {
    await Haptics.selectionAsync().catch(() => {});
    syncToContext();
    const snapshot = buildConfigSnapshot();
    const updated: SetupState = { ...setupState, ...snapshot, firstOpenDone: true };
    await saveSetupState(updated);
    onSetupStateChange(updated);

    const isLast = currentStep >= STEPS.length - 1;
    if (isLast) { onClose(); } else { animateToStep(currentStep + 1); }
  };

  const handleClose = async () => {
    syncToContext();
    const snapshot = buildConfigSnapshot();
    const updated: SetupState = { ...setupState, ...snapshot, firstOpenDone: true };
    await saveSetupState(updated);
    onSetupStateChange(updated);
    onClose();
  };

  if (!visible) return null;

  const step  = STEPS[currentStep];
  const total = STEPS.length;
  const done  = setupState.completedSteps.length;
  const isLast = currentStep >= total - 1;

  return (
    <Animated.View style={[g.overlay, { opacity: fadeAnim, paddingTop: insets.top }]}>

      {/* ── Progress header ── */}
      <View style={g.progressSection}>
        <Text style={g.progressTitle}>{t("biz_config_initial")}</Text>
        <Text style={g.progressCount}>{done}/{total} {t("biz_completed_of")}</Text>
        <View style={g.stepsRow}>
          {STEPS.map((s, i) => {
            const isDone    = setupState.completedSteps.includes(i);
            const isActive  = i === currentStep;
            const stepColor = isDone ? GREEN : (isActive ? s.color : "rgba(0,0,0,0.12)");
            return (
              <TouchableOpacity
                key={s.key}
                activeOpacity={0.7}
                onPress={() => animateToStep(i)}
                style={g.stepPill}
              >
                <View style={[g.stepDot, { backgroundColor: stepColor }]}>
                  {isDone
                    ? <Feather name="check" size={10} color="#fff" />
                    : <Text style={g.stepDotNum}>{i + 1}</Text>
                  }
                </View>
                <Text style={[g.stepPillLabel, { color: isDone ? GREEN : (isActive ? s.color : DIM) }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Step header ── */}
      <Animated.View style={{
        opacity:   slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) }],
      }}>
        <View style={[g.stepHeader, { borderLeftColor: step.color }]}>
          <View style={[g.stepIconCircle, { backgroundColor: step.color + "18" }]}>
            <Feather name={step.icon} size={26} color={step.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={g.stepTitle}>{step.title}</Text>
            <Text style={g.stepSubtitle}>{step.subtitle}</Text>
          </View>
        </View>
      </Animated.View>

      {/* ── Step content ── */}
      <Animated.View style={[g.contentArea, {
        opacity:   slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) }],
      }]}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {currentStep === 0 && (
            <Step0Actividad
              sector={selectedSector}
              setSector={(s) => {
                setSelectedSector(s);
                if (!s) updateConfig({ sectorId: null, subId: null, plantillaItems: [] });
                else updateConfig({ sectorId: s.id });
              }}
              subId={selectedSubId}
              setSubId={(id) => {
                if (id && selectedSector) {
                  resetToSubActivity(selectedSector.id, id);
                  setServices(makeSuggestedServices(id));
                } else {
                  updateConfig({ subId: null });
                }
              }}
              onSubConfirmed={() => animateToStep(currentStep + 1)}
            />
          )}
          {currentStep === 1 && (
            <Step1Plantilla sector={selectedSector} subId={selectedSubId} />
          )}
          {currentStep === 2 && (
            <Step1Horario
              subId={selectedSubId}
              sector={selectedSector}
              activeDays={activeDays}
              setActiveDays={setActiveDays}
              openFrom={openFrom}
              setOpenFrom={setOpenFrom}
              openTo={openTo}
              setOpenTo={setOpenTo}
              services={services}
              setServices={setServices}
            />
          )}
          {currentStep === 3 && (
            <Step3ReservaPublicacion
              isVerified={isVerified}
              payment={paymentPolicy}
              setPayment={setPaymentPolicy}
              approval={approvalPolicy}
              setApproval={setApprovalPolicy}
              cancel={cancelPolicy}
              setCancel={setCancelPolicy}
              onOpenVerificacion={onOpenVerificacion}
            />
          )}
        </ScrollView>
      </Animated.View>

      {/* ── Footer actions ── */}
      <View style={[g.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={handleSkipStep} style={g.skipBtn} hitSlop={8}>
          <Text style={g.skipTxt}>{isLast ? t("biz_finish_later") : t("biz_skip_step")}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.88} onPress={handleNext} style={[g.nextBtn, { backgroundColor: step.color }]}>
          <Text style={g.nextBtnTxt}>{isLast ? t("biz_done") : t("biz_next")}</Text>
          <Feather name={isLast ? "check" : "arrow-right"} size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── FAB flotante de cierre — igual que en todos los paneles GO ── */}
      <DraggableFAB
        screenKey="empresa_setup"
        buttonKey="close"
        initialRight={20}
        initialBottom={insets.bottom + 90}
        maxH={48}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleClose}
          accessibilityLabel={t("biz_close_config")}
          style={g.fabCloseBtn}
        >
          <View style={{ alignItems: "center" }}>
            <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
            <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
          </View>
        </TouchableOpacity>
      </DraggableFAB>

    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get("window");

const g = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 100,
    flexDirection: "column",
  },

  fabCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.40,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },

  progressSection: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  progressTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: DIM,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  progressCount: {
    fontSize: 22,
    fontWeight: "900",
    color: TEXT,
    marginBottom: 14,
  },
  stepsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  stepPill: {
    alignItems: "center",
    gap: 5,
    flex: 1,
    maxWidth: (SW - 40) / 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotNum: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  stepPillLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },

  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stepIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle:    { fontSize: 16, fontWeight: "800", color: TEXT, marginBottom: 3 },
  stepSubtitle: { fontSize: 12, color: GRAY, lineHeight: 17 },

  contentArea: { flex: 1, paddingHorizontal: 16 },

  // Shared step layout
  stepBody: { gap: 12 },
  sectionCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: DIM,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionSub: { color: DIM, fontSize: 11, marginTop: 3 },

  // Numeric input (duration, etc.)
  numBox:   { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 4, flexShrink: 0 },
  numInput: { color: TEXT, fontSize: 18, fontWeight: "600", minWidth: 36, textAlign: "center" },
  numUnit:  { color: GRAY, fontSize: 13 },

  // Day chips
  chipRow:   { flexDirection: "row", gap: 6 },
  dayChip:   {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipTxt: { fontSize: 12, fontWeight: "700", color: GRAY },

  // Time selectors
  timeRow: { flexDirection: "row", gap: 12 },

  // Extra space chips (Step 1 Plantilla)
  extraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  extraChipTxt: { fontSize: 13, fontWeight: "600", color: GRAY },

  // Segment buttons
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.03)",
    alignItems: "center",
  },
  segTxt: { fontSize: 12, fontWeight: "700", color: GRAY },

  // Service rows (Step 1)
  svcRow: {
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    paddingBottom: 10,
    marginBottom: 2,
  },
  svcNameInput: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
  },
  svcMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addSvcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addSvcTxt: { fontSize: 13, fontWeight: "700", color: BLUE },

  // Activity sector grid (Step 2)
  actRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  actTile: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: CARD,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    position: "relative",
  },
  actIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actLabel: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
  },

  // Back row
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 2,
  },

  // Search bar
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    paddingVertical: 0,
  },
  emptySearch: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptySearchTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: DIM,
  },

  // Sub-template rows
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  subLabel: { fontSize: 14, fontWeight: "600", color: TEXT, flex: 1 },

  // Plantilla editable rows
  plantillaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  miniCounter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  miniCountBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: BLUE + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  miniCountNum: {
    fontSize: 13,
    fontWeight: "800",
    color: TEXT,
    minWidth: 18,
    textAlign: "center",
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  emojiChip: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.02)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Space grid
  spaceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  spaceCard: {
    width: "30%",
    flexGrow: 1,
    alignItems: "center",
    gap: 7,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  spaceIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  spaceTxt: { fontSize: 11, fontWeight: "600", color: GRAY, textAlign: "center" },

  // Counter — centrado vertical
  counterCard: {
    alignItems: "center",
    paddingVertical: 14,
    gap: 10,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  counterBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: BLUE + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  counterVal:  { alignItems: "center" },
  counterNum:  { fontSize: 18, fontWeight: "900", color: TEXT, minWidth: 28, textAlign: "center" },
  counterUnit: { fontSize: 12, fontWeight: "600", color: GRAY },

  // Preview row
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  previewTxt: { fontSize: 12, color: GRAY, flex: 1, lineHeight: 17 },

  // Policy cards
  policyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  policyIcon:  {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  policyLabel: { fontSize: 13, fontWeight: "600", color: TEXT },
  policySub:   { fontSize: 11, color: DIM, marginTop: 1 },

  // QR
  qrWrapper: {
    padding: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 14,
  },
  qrLinkTxt: { fontSize: 11, color: DIM, fontWeight: "500" },

  // Buttons
  bigBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  bigBtnTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  skipTxt:   { fontSize: 13, fontWeight: "600", color: DIM },
  nextBtn:   {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  nextBtnTxt: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
