/**
 * EmpresaConfigScreen
 * ═══════════════════════════════════════════════════════════════════════════
 * Configuración guiada en 8 pasos — única ruta de configuración del negocio.
 *
 * Paso 1: Nombre
 * Paso 2: Ubicación (dirección del negocio)
 * Paso 3: Horarios  (cuándo abre el negocio)
 * Paso 4: Servicios (nombre, duración, precio, capacidad)
 * Paso 5: Espacios/Profesionales (pistas, mesas, cabinas… + servicios por profesional)
 * Paso 6: Reservas  (pago previo, cancelaciones)
 * Paso 7: Plano     (editor visual del local — módulo real)
 * Paso 8: Publicar  (resumen + QR + compartir)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  PanResponder,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COUNTRY_CONFIGS, MARKET_STORAGE_KEY, type Market } from "@/utils/countryConfig";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";
import { adjacentDemoCompanyId } from "@/data/businessDemoCatalog";
import { getBusinessDemoSetupState, ensureBusinessDemoStaffIds } from "@/data/businessDemoStore";
import { OwnerContextModal as Modal } from "@/components/debug/OwnerContextIndicator";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { PlanoEmpresaScreen } from "@/components/booking/PlanoEmpresaScreen";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { GoOcrImportSheet } from "@/components/empresa/GoOcrImportSheet";
import { Step0Actividad } from "@/components/empresa/EmpresaSetupGuide";

import { GoTimeField } from "@/components/ui/GoTimePicker";
import {
  EMOJI_PALETTE,
  PEOPLE_SECTORS,
  SECTORS,
  SUB_TO_SECTOR,
  getAddLabel,
  getDefaultStaffEmoji,
  getStaffEmojiPalette,
  getSectorLabel,
  getSubName,
  type PlantillaItem,
  type Sector,
} from "@/data/goSectorData";
import { trSector } from "@/data/goSectorTranslations";
import {
  useBusinessConfig,
  type SavedService,
  type DayShift,
  type DaySchedule,
  type StaffScheduleConfig,
} from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";

function blockDemoExternal(lang: string) {
  Alert.alert(lang === "en" ? "Local business DEMO" : "Empresa DEMO local",
    lang === "en" ? "This action uses an external service. Enter the test data manually; no real operation will run."
      : "Esta acción utiliza un servicio externo. Introduce los datos de prueba manualmente; no se ejecutará ninguna operación real.");
}

// Local format validation does not prove number ownership or WhatsApp registration.
export type BusinessPhoneCountry = "ES" | "US" | "GB" | "FR" | "BR";
type BusinessPhoneKind = "landline" | "mobile" | "whatsapp";
const PHONE_PLANS = {
  ES: { prefix: "34", min: 9, max: 9, trunk: false },
  US: { prefix: "1", min: 10, max: 10, trunk: false },
  GB: { prefix: "44", min: 9, max: 10, trunk: true },
  FR: { prefix: "33", min: 9, max: 9, trunk: true },
  BR: { prefix: "55", min: 10, max: 11, trunk: false },
} as const;
const PHONE_COUNTRIES = Object.values(COUNTRY_CONFIGS).map(country => ({ ...country,
  code: country.countryCode as BusinessPhoneCountry,
  prefix: "+" + PHONE_PLANS[country.countryCode as BusinessPhoneCountry].prefix,
}));
const isPhoneCountry = (value: unknown): value is BusinessPhoneCountry => typeof value === "string" && Object.prototype.hasOwnProperty.call(PHONE_PLANS, value);
export function resolveBusinessPhoneCountry(businessCountry?: string, deviceLocale?: string): BusinessPhoneCountry {
  if (isPhoneCountry(businessCountry)) return businessCountry;
  const pieces = (deviceLocale ?? "").replace(/_/g, "-").split("-");
  const region = pieces.slice(1).find(part => /^[A-Z]{2}$/i.test(part))?.toUpperCase();
  return isPhoneCountry(region) ? region : "ES";
}
export function nationalBusinessPhone(value: string, country: BusinessPhoneCountry): string {
  const raw = (value ?? "").trim(), plan = PHONE_PLANS[country];
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && digits.startsWith(plan.prefix)) digits = digits.slice(plan.prefix.length);
  else if (raw.startsWith("00") && digits.startsWith("00" + plan.prefix)) digits = digits.slice(2 + plan.prefix.length);
  if (plan.trunk && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}
export function validateBusinessPhone(value: string, country: BusinessPhoneCountry, kind: BusinessPhoneKind = "whatsapp") {
  const raw = (value ?? "").trim(), plan = PHONE_PLANS[country], national = nationalBusinessPhone(raw, country);
  if (!raw) return { valid: true, empty: true, national: "", international: "" };
  let valid = /^[+\d\s().-]+$/.test(raw) && national.length >= plan.min && national.length <= plan.max;
  if (country === "ES") valid = valid && (kind === "landline" ? /^[89]\d{8}$/ : kind === "mobile" ? /^[67]\d{8}$/ : /^[6789]\d{8}$/).test(national);
  if (country === "US") valid = valid && /^[2-9]\d{2}[2-9]\d{6}$/.test(national);
  if (country === "FR") valid = valid && (kind === "mobile" ? /^[67]\d{8}$/ : /^[1-9]\d{8}$/).test(national);
  if (country === "GB" && kind === "mobile") valid = valid && /^7\d{9}$/.test(national);
  if (country === "BR") valid = valid && /^[1-9]\d/.test(national) && (kind !== "mobile" || /^\d{2}9\d{8}$/.test(national));
  if ((raw.startsWith("+") || raw.startsWith("00")) && national === raw.replace(/\D/g, "")) valid = false;
  return { valid, empty: false, national, international: valid ? "+" + plan.prefix + national : "" };
}
export function businessPhoneInput(value: string, country: BusinessPhoneCountry): string {
  const raw = value.trim(), digits = raw.replace(/\D/g, ""), prefix = PHONE_PLANS[country].prefix;
  const foreign = raw.startsWith("+") ? !digits.startsWith(prefix) : raw.startsWith("00") && !digits.startsWith("00" + prefix);
  return foreign || !/^[+\d\s().-]*$/.test(raw) ? value : nationalBusinessPhone(value, country);
}
export function businessPhoneError(value: string, country: BusinessPhoneCountry, kind: BusinessPhoneKind, lang: string): string {
  const en = lang === "en", raw = value.trim(), national = nationalBusinessPhone(raw, country), plan = PHONE_PLANS[country];
  if (validateBusinessPhone(value, country, kind).valid) return "";
  if (!/^[+\d\s().-]+$/.test(raw)) return en ? "Use digits, spaces and a valid calling code." : "Utiliza cifras, espacios y un prefijo válido.";
  if ((raw.startsWith("+") || raw.startsWith("00")) && national === raw.replace(/\D/g, "")) return en ? "The calling code does not match the selected country." : "El prefijo no corresponde al país seleccionado.";
  if (national.length < plan.min || national.length > plan.max) return country === "ES" ? (en ? "Spanish numbers require 9 digits, excluding +34." : "El número español necesita 9 cifras, sin contar +34.") : (en ? "Check the number length for the selected country." : "Revisa la longitud del número para el país seleccionado.");
  if (country === "ES" && kind === "landline") return en ? "Use a landline starting with 8 or 9. Put mobiles in Mobile." : "El fijo debe comenzar por 8 o 9. Introduce los móviles en Móvil.";
  if (country === "ES" && kind === "mobile") return en ? "The mobile must start with 6 or 7. Put landlines in Landline." : "El móvil debe comenzar por 6 o 7. Introduce los fijos en Teléfono fijo.";
  return en ? "The number format does not match the selected contact type." : "El formato no corresponde al tipo de teléfono seleccionado.";
}

type BusinessCoordinates = { latitude: number; longitude: number };
type DeviceLocationAdapter = Pick<typeof Location, "requestForegroundPermissionsAsync" | "getCurrentPositionAsync" | "reverseGeocodeAsync" | "Accuracy">;
export async function readBusinessDeviceLocation(adapter: DeviceLocationAdapter, options: {
  allowAddressLookup: boolean;
  onCoordinates: (coordinates: BusinessCoordinates) => void | Promise<void>;
}): Promise<{ status: "denied" } | { status: "coordinates" | "address"; coordinates: BusinessCoordinates; address?: string }> {
  if ((await adapter.requestForegroundPermissionsAsync()).status !== "granted") return { status: "denied" };
  const position = await adapter.getCurrentPositionAsync({ accuracy: adapter.Accuracy.Balanced });
  const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)
    || Math.abs(coordinates.latitude) > 90 || Math.abs(coordinates.longitude) > 180) throw new Error("Invalid device coordinates");
  await options.onCoordinates(coordinates);
  if (options.allowAddressLookup) {
    try {
      const results = await adapter.reverseGeocodeAsync(coordinates);
      // A locality/province alone cannot identify a business address reliably.
      const geo = results.find(value => value.street?.trim());
      if (geo) {
        const street = [geo.street?.trim(), geo.streetNumber?.trim()].filter(Boolean).join(" ");
        const city = [geo.postalCode?.trim(), geo.city?.trim() ?? geo.district?.trim()].filter(Boolean).join(" ");
        const address = [...new Set([street, city, geo.region?.trim(), geo.country?.trim()].filter(Boolean))].join(", ");
        if (address) return { status: "address", coordinates, address };
      }
    } catch { /* Coordinates already persist; the user can enter an address manually. */ }
  }
  return { status: "coordinates", coordinates };
}

// ─── Visual tokens ────────────────────────────────────────────────────────────

const BG     = "#F7F8FA";
const CARD   = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.08)";
const TEXT   = "#111827";
const GRAY   = "#6B7280";
const DIM    = "#9CA3AF";
const BLUE   = "#4A80BD";
const GREEN  = "#3D9A84";
const GOLD   = "#C4883A";
const PURPLE = "#7C69BE";
const RED    = "#EF4444";

const MOCK_LINK  = "https://go.teso.app/b/mi-negocio";

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepKey = "nombre" | "ubicacion" | "horario" | "espacios" | "servicios" | "reservas" | "plano" | "publicar";

type StepDefCfg = {
  key:      StepKey;
  icon:     keyof typeof Feather.glyphMap;
  label:    string;
  title:    string;
  subtitle: string;
  color:    string;
};

function buildStepsCfg(t: (k: any) => string): StepDefCfg[] {
  return [
    { key: "nombre",    icon: "briefcase", label: t("biz_cfg_step_name"),      title: t("biz_cfg_name_title"),      subtitle: t("biz_cfg_name_subtitle"),      color: BLUE   },
    { key: "ubicacion", icon: "map-pin",   label: t("biz_cfg_step_location"),  title: t("biz_cfg_location_title"),  subtitle: t("biz_cfg_location_subtitle"),  color: GREEN  },
    { key: "horario",   icon: "clock",     label: t("biz_cfg_step_schedule"),  title: t("biz_cfg_schedule_title"),  subtitle: t("biz_cfg_schedule_subtitle"),  color: PURPLE },
    { key: "servicios", icon: "list",      label: t("biz_cfg_step_services"),  title: t("biz_cfg_services_title"),  subtitle: t("biz_cfg_services_subtitle"),  color: BLUE   },
    { key: "espacios",  icon: "layers",    label: t("biz_cfg_step_staff"),     title: t("biz_cfg_staff_title"),     subtitle: t("biz_cfg_staff_subtitle"),     color: GREEN  },
    { key: "reservas",  icon: "shield",    label: t("biz_cfg_step_bookings"),  title: t("biz_cfg_bookings_title"),  subtitle: t("biz_cfg_bookings_subtitle"),  color: GOLD   },
    { key: "plano",     icon: "map",       label: t("biz_cfg_step_plan"),      title: t("biz_cfg_plan_title"),      subtitle: t("biz_cfg_plan_subtitle"),      color: PURPLE },
    { key: "publicar",  icon: "share-2",   label: t("biz_cfg_step_publish"),   title: t("biz_cfg_publish_title"),   subtitle: t("biz_cfg_publish_subtitle"),   color: GOLD   },
  ];
}

function buildPaymentOptsCfg(t: (k: any) => string) {
  return [
    { label: t("biz_free_booking"), sub: t("biz_no_prepay"),       icon: "gift"        },
    { label: t("biz_prepay"),       sub: t("biz_prepay_required"), icon: "credit-card" },
  ] as const;
}

function buildCancelOptsCfg(t: (k: any) => string) {
  return [
    { label: t("biz_flexible"),        sub: t("biz_flexible_24h"),            icon: "refresh-cw" },
    { label: t("biz_strict"),          sub: t("biz_strict_48h"),              icon: "shield"      },
    { label: t("biz_no_cancellation"), sub: t("biz_no_cancellation_allowed"), icon: "x-circle"    },
  ] as const;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EmpresaConfigScreenProps {
  onBack:              () => void;
  onOpenVerificacion?: () => void;
  onFinalizarConfig?:  () => void;
  initialStep?:        number;
  onOpenCompanies?:    () => void;
  contextNavigation?:  React.ReactNode;
  keyboardManagedByParent?: boolean;
  startAtSteps?:       boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

type StepSaveRef = React.MutableRefObject<(() => Promise<void>) | null>;

/** Keep the newest edit while AsyncStorage acknowledges older queued writes. */
function useConfigArrayDraft<D, S>(saved: S[], hydrate: (saved: S[]) => D[], serialize: (draft: D[]) => S[],
  persist: (saved: S[]) => void | Promise<void>) {
  const [draft, setDraft] = useState(() => hydrate(saved));
  const latest = useRef(draft);
  const observed = useRef(JSON.stringify(saved));
  const saving = useRef(false);
  const saveSequence = useRef(0);
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const adapters = useRef({ hydrate, serialize, persist });
  adapters.current = { hydrate, serialize, persist };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const setValue = useCallback((value: D[] | ((previous: D[]) => D[])) => {
    const next = typeof value === "function" ? value(latest.current) : value;
    const before = JSON.stringify(adapters.current.serialize(latest.current));
    latest.current = next;
    if (mounted.current) setDraft(next);
    const payload = adapters.current.serialize(next), signature = JSON.stringify(payload);
    if (signature !== before) {
      saving.current = true;
      const sequence = ++saveSequence.current;
      try { pendingSave.current = Promise.resolve(adapters.current.persist(payload)); }
      catch (error) { pendingSave.current = Promise.reject(error); }
      // Only completion of the latest write can acknowledge the draft, even if values repeat.
      // Keep the original promise so Next/Save cannot claim success after a failed write.
      void pendingSave.current.then(
        () => { if (sequence === saveSequence.current) saving.current = false; },
        error => Alert.alert("Configuración", error instanceof Error ? error.message : String(error)),
      );
    }
    return pendingSave.current;
  }, []);
  useEffect(() => {
    const signature = JSON.stringify(saved);
    if (signature === observed.current) return;
    observed.current = signature;
    // Queued acknowledgements must not replace a newer edit. A matching saved value
    // also keeps empty draft rows and their input IDs after the write has completed.
    if (saving.current || signature === JSON.stringify(adapters.current.serialize(latest.current))) return;
    latest.current = adapters.current.hydrate(saved);
    setDraft(latest.current);
  }, [saved]);
  const flush = useCallback(() => pendingSave.current, []);
  const getDraft = useCallback(() => latest.current, []);
  return { draft, setValue, flush, getDraft };
}

/** Flush focused fields before Next and on closure, without writing during hydration. */
function useStepSave(saveRef: StepSaveRef | undefined, flush: () => Promise<void>) {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    const save = () => latest.current();
    if (saveRef) saveRef.current = save;
    return () => {
      if (saveRef?.current === save) saveRef.current = null;
      void save().catch(() => {}); // The field writer reports persistence errors.
    };
  }, [saveRef]);
}

export function EmpresaConfigScreen({ onBack, onOpenVerificacion, onFinalizarConfig, initialStep = 0, goPrevRef, onOpenCompanies, contextNavigation, keyboardManagedByParent = false, startAtSteps = false }: EmpresaConfigScreenProps & { goPrevRef?: React.MutableRefObject<(() => void) | null> }) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const STEPS = buildStepsCfg(t);
  const { config, updateConfig, resetToSubActivity, demo } = useBusinessConfig();
  const { catalog, locationReturn, consumeLocationReturn } = useOwnerBusinessDemo();
  // Only a return from this owner's native GPS prompt skips the normal activity selector.
  const resumeLocation = useRef(demo && locationReturn?.userId === demo.getSnapshot().ownerUserId ? locationReturn : undefined).current;

  // ── Fase previa de selección de actividad ────────────────────────────────────
  // El acceso normal arranca en "activity" para que el usuario elija (o confirme) su
  // sector y actividad antes de acceder a los 8 pasos.  Si sectorId/subId ya
  // existen de una sesión anterior aparecen pre-seleccionados, pero el flujo
  // solo recupera una ruta previa tras el permiso GPS del mismo propietario.
  const [phase, setPhase] = useState<"activity" | "steps">(() => resumeLocation?.phase ?? (startAtSteps && config.sectorId && config.subId ? "steps" : "activity"));
  const [localSector, setLocalSector] = useState<Sector | null>(null);
  const [localSubId, setLocalSubId] = useState(config.subId ?? null);
  const stepSaveRef = useRef<(() => Promise<void>) | null>(null);

  const [currentStep,    setCurrentStep]    = useState(() => resumeLocation?.step ?? Math.min(Math.max(initialStep, 0), STEPS.length - 1));
  const [planoEditorOpen, setPlanoEditorOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const compactFooter = Boolean(demo) && Platform.OS === "ios" && (currentStep === 0 || currentStep === 1);
  useEffect(() => { if (resumeLocation) consumeLocationReturn(resumeLocation.token); }, [resumeLocation, consumeLocationReturn]);
  // Paso Ubicación — protección: el botón Siguiente solo se activa cuando
  // el usuario ha visto la sección CONTACTO o ha rellenado al menos un campo.
  const [contactSectionSeen, setContactSectionSeen] = useState(false);
  const scrollRef   = useRef<ScrollView>(null);
  const scrollContentRef = useRef<View>(null);
  const slideAnim   = useRef(new Animated.Value(0)).current;
  const headerAnim  = useRef(new Animated.Value(1)).current;
  const activeNewInput = useRef<TextInput | null>(null);
  const revealProfessional = useCallback((input: TextInput) => {
    activeNewInput.current = input;
    const content = scrollContentRef.current;
    if (content) input.measureLayout(content, (_x, y) => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    }, () => {});
  }, []);
  useEffect(() => { activeNewInput.current = null; }, [currentStep]);
  const companyTransitionBusy = useRef(false);
  const [openingCompanies, setOpeningCompanies] = useState(false);
  const openCompanies = async () => {
    if (!onOpenCompanies || companyTransitionBusy.current) return;
    companyTransitionBusy.current = true; setOpeningCompanies(true);
    try {
      await stepSaveRef.current?.(); // Commit a focused name/service before unmounting.
      await demo?.load(); // Drain the current company's queued scalar edits as well.
      Keyboard.dismiss(); onOpenCompanies();
    } catch (error) {
      Alert.alert(lang === "en" ? "Could not save" : "No se pudo guardar", error instanceof Error ? error.message : String(error));
    } finally { companyTransitionBusy.current = false; setOpeningCompanies(false); }
  };
  const registeredCompanies = catalog?.getCompanies().filter(company => !company.archived && !company.placeholder) ?? [];
  const selectedPosition = registeredCompanies.findIndex(company => company.id === catalog?.getSelectedId());
  const switchCompanyFromHeader = async (direction: -1 | 1) => {
    if (!demo || !catalog || companyTransitionBusy.current) return;
    const target = adjacentDemoCompanyId(catalog.getCompanies(), catalog.getSelectedId(), direction);
    if (!target) return;
    companyTransitionBusy.current = true; setOpeningCompanies(true);
    try {
      await stepSaveRef.current?.();
      await demo.load();
      Keyboard.dismiss();
      await catalog.select(target); // EmpresaPanel's existing company key hydrates/remounts the selected wizard.
    } catch (error) {
      Alert.alert(lang === "en" ? "Could not change business" : "No se pudo cambiar de negocio", error instanceof Error ? error.message : String(error));
    } finally { companyTransitionBusy.current = false; setOpeningCompanies(false); }
  };
  const companyGesture = useRef({ canSwipe: false, switchCompany: switchCompanyFromHeader });
  companyGesture.current = { canSwipe: !!demo && registeredCompanies.length > 1 && !openingCompanies, switchCompany: switchCompanyFromHeader };
  const companyHeaderPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => companyGesture.current.canSwipe && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) >= 48 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5)
        void companyGesture.current.switchCompany(gesture.dx < 0 ? 1 : -1);
    },
    onPanResponderTerminationRequest: () => true,
  })).current;
  const companyPosition = selectedPosition >= 0 ? <Text testID="config-company-position" style={c.headerSub}>
    {selectedPosition + 1} / {registeredCompanies.length}{registeredCompanies.length > 1 ? (lang === "en" ? " · swipe to change" : " · desliza para cambiar") : ""}
  </Text> : null;
  const companyButton = onOpenCompanies ? <TouchableOpacity testID="config-company-list" accessibilityRole="button"
    disabled={openingCompanies} onPress={() => void openCompanies()} style={[{ paddingHorizontal: 18, paddingVertical: 10 }, contextNavigation ? { flex: 1, minWidth: 0 } : undefined]}>
    <Text style={{ color: BLUE, fontWeight: "700" }}>{lang === "en" ? "My businesses" : "Mis negocios"} ▾</Text>
  </TouchableOpacity> : null;
  const companyNavigation = contextNavigation ? (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {companyButton}
      {contextNavigation}
    </View>
  ) : companyButton;

  const currentSector = SECTORS.find(s => s.id === config.sectorId) ?? null;
  const currentSub    = currentSector?.subs.find(s => s.id === config.subId) ?? null;
  const step   = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  const animateToStep = (next: number) => {
    Haptics.selectionAsync().catch(() => {});
    // Al cambiar de paso, reiniciar la guardia de sección contacto
    if (next !== 1) setContactSectionSeen(false);
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: 1, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start(() => {
      setCurrentStep(next);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 40);
    });
  };

  // Paso Ubicación (1) — el botón Siguiente se activa cuando:
  //   a) el usuario tiene al menos un campo de contacto relleno, o
  //   b) ha desplazado la pantalla lo suficiente para ver CONTACTO (~80 px)
  const hasContact = !!(config.phone?.trim() || config.whatsapp?.trim());
  const canProceed = currentStep !== 1 || hasContact || contactSectionSeen;

  const advanceBusy = useRef(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const advanceStep = async (allowUnnamed = false) => {
    if (advanceBusy.current) return;
    advanceBusy.current = true; setIsAdvancing(true);
    try {
      await stepSaveRef.current?.();
      const savedConfig = demo?.getSnapshot().config ?? config;
      if (currentStep === 4 && !allowUnnamed && PEOPLE_SECTORS.has(SUB_TO_SECTOR[savedConfig.subId ?? ""] ?? "")) {
        const totalSlots = savedConfig.plantillaItems.reduce((sum, item) => sum + item.count, 0);
        const namedSlots = savedConfig.plantillaItems.reduce((sum, item) => sum + (item.staffNames?.filter(name => name.trim()).length ?? 0), 0);
        if (namedSlots < totalSlots) {
          Alert.alert(t("biz_unnamed_slots_title"), t("biz_unnamed_slots_msg"), [
            { text: t("biz_add_names"), style: "cancel" },
            { text: t("biz_continue_anyway"), onPress: () => advanceStep(true) },
          ]);
          return;
        }
      }
      if (currentStep === 1) {
        const country = resolveBusinessPhoneCountry(config.countryCode);
        const validContacts = validateBusinessPhone(config.phone ?? "", country, "landline").valid
          && validateBusinessPhone(config.mobile ?? "", country, "mobile").valid
          && validateBusinessPhone(config.whatsapp ?? "", country, "whatsapp").valid;
        if (!validContacts) throw new Error(lang === "en" ? "Check the contact numbers and their country/calling code." : "Revisa los números de contacto y su país/prefijo.");
      }
      if (demo) {
        // Serialized after pending field edits: never announce completion before the data reaches disk.
        await demo.transformConfig(current => {
          const done = new Set(Array.isArray(current.completedSteps) ? current.completedSteps : []);
          done.add(currentStep);
          const next = { ...current, completedSteps: [...done] };
          const progress = getBusinessDemoSetupState(next, demo.getSnapshot().plan);
          if (!progress.steps[currentStep] || (isLast && !progress.ready)) {
            const missing = isLast ? progress.nextStep : currentStep;
            throw new Error(lang === "en" ? "Complete the required data in step " + (missing + 1) + " before continuing."
              : "Completa los datos necesarios del paso " + (missing + 1) + " antes de continuar.");
          }
          return next;
        });
      } else {
        const alreadyDone = Array.isArray(config.completedSteps) ? config.completedSteps : [];
        if (!alreadyDone.includes(currentStep)) updateConfig({ completedSteps: [...alreadyDone, currentStep] });
      }
      if (isLast) { onFinalizarConfig ? onFinalizarConfig() : onBack(); } else { animateToStep(currentStep + 1); }
    } catch (error) {
      Alert.alert(lang === "en" ? "Configuration incomplete" : "Configuración incompleta",
        error instanceof Error ? error.message : (lang === "en" ? "Could not save the configuration." : "No se pudo guardar la configuración."));
    } finally { advanceBusy.current = false; setIsAdvancing(false); }
  };

  const goNext = () => { void advanceStep(); };

  // ── goPrev unificado — gestiona todos los niveles de la ruta real ─────────
  // Activity / sector vista       → onBack() (suite home)
  // Activity / subsector vista    → volver a sectores
  // Steps / paso 0                → volver a activity (selección de actividad)
  // Steps / paso N>0              → paso N-1
  const goPrev = () => {
    if (phase === "activity") {
      if (localSector !== null) {
        setLocalSector(null);
        setLocalSubId(config.subId ?? null);
      } else {
        onBack();
      }
    } else {
      if (currentStep === 0) { setPhase("activity"); }
      else { animateToStep(currentStep - 1); }
    }
  };

  // Registrar goPrev en el ref externo (EmpresaPanel FAB) — se mantiene al día
  const goPrevLatest = useRef(goPrev);
  goPrevLatest.current = goPrev;
  useEffect(() => {
    if (goPrevRef) {
      goPrevRef.current = () => goPrevLatest.current();
      return () => { if (goPrevRef) goPrevRef.current = null; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cabecera adaptativa — colapsa al abrir teclado ───────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      Animated.timing(headerAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    });
    const onDidShow = Keyboard.addListener("keyboardDidShow", () => {
      if (activeNewInput.current?.isFocused()) revealProfessional(activeNewInput.current);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      Animated.timing(headerAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    });
    return () => { onShow.remove(); onHide.remove(); onDidShow.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fase previa: selección de sector y actividad ────────────────────────────
  if (phase === "activity") {
    const canContinue = !!(config.sectorId && config.subId);
    const activeSector = localSector;
    const activeSub = activeSector?.subs.find(s => s.id === config.subId) ?? null;

    return (
      <View style={c.root}>
        {companyNavigation}
        {/* Header — sin flecha top-left; navegación via FAB flotante */}
        <View testID="config-company-swipe-header" style={c.header} {...companyHeaderPan.panHandlers}>
          <View style={{ width: 36 }} />
          <View style={c.headerCenter}>
            <Text testID="config-business-name" style={c.headerTitle}>{config.businessName?.trim() || t("biz_my_business")}</Text>
            {companyPosition}
            {activeSector && (
              <Text style={[c.headerSub, { color: activeSector.color }]}>
                {activeSector.emoji} {activeSector.label}{activeSub ? ` · ${activeSub.name}` : ""}
              </Text>
            )}
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Pantalla original de selección de sector/actividad — sin cambios */}
        <ScrollView
          style={{ flex: 1, backgroundColor: BG }}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Step0Actividad
            sector={localSector}
            setSector={setLocalSector}
            subId={localSubId}
            setSubId={(id) => {
              // Sector browsing/back is a visual draft; only a confirmed activity writes configuration.
              setLocalSubId(id);
              if (id && localSector) resetToSubActivity(localSector.id, id);
            }}
            onSubConfirmed={() => { setCurrentStep(Math.min(Math.max(initialStep, 0), STEPS.length - 1)); setPhase("steps"); }}
          />
        </ScrollView>

        {/* Footer — solo Cancelar; Continuar es automático al tocar la actividad */}
        <View style={[c.footer, { paddingBottom: insets.bottom + 12, justifyContent: "flex-start" }]}>
          <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={c.backFooterBtn}>
            <Text style={c.backFooterTxt}>{t("biz_cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={c.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top}
      enabled={!keyboardManagedByParent}
    >
      {companyNavigation}

      {/* ── Animated step area — header + steps bar scroll with content ── */}
      <Animated.View style={[c.contentWrap, {
        opacity:   slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) }],
      }]}>
        <ScrollView
          ref={scrollRef}
          onLayout={compactFooter ? () => { if (activeNewInput.current?.isFocused()) revealProfessional(activeNewInput.current); } : undefined}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={60}
          onScroll={(e) => {
            if (currentStep === 1 && !contactSectionSeen) {
              if (e.nativeEvent.contentOffset.y >= 80) {
                setContactSectionSeen(true);
              }
            }
          }}
        >
          <View ref={scrollContentRef} collapsable={false} testID="config-scroll-content">
          {/* Header — colapsa con teclado y al hacer scroll */}
          <Animated.View style={{
            opacity:   headerAnim,
            maxHeight: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }),
            overflow:  "hidden",
          }}>
            <View testID="config-company-swipe-header" style={c.header} {...companyHeaderPan.panHandlers}>
              <View style={{ width: 36 }} />
              <View style={c.headerCenter}>
                <Text testID="config-business-name" style={c.headerTitle}>{config.businessName?.trim() || t("biz_my_business")}</Text>
            {companyPosition}
                {currentSector && (
                  <Text style={[c.headerSub, { color: currentSector.color }]}>
                    {currentSector.emoji} {getSectorLabel(currentSector, lang)}{currentSub ? ` · ${getSubName(currentSub, lang)}` : ""}
                  </Text>
                )}
              </View>
              <View style={{ width: 36 }} />
            </View>
          </Animated.View>

          {/* Step progress pills — desplazables */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={c.stepsBar}>
            {STEPS.map((s, i) => {
              const isDone   = demo ? getBusinessDemoSetupState(config, demo.getSnapshot().plan).steps[i] : (config.completedSteps ?? []).includes(i);
              const isActive = i === currentStep;
              const dotColor = isDone ? GREEN : (isActive ? s.color : "rgba(0,0,0,0.10)");
              return (
                <TouchableOpacity
                  key={s.key}
                  activeOpacity={0.7}
                  onPress={() => animateToStep(i)}
                  style={[c.stepPill, s.key === "espacios" && { width: 138 }]}
                >
                  <View style={[c.stepDot, { backgroundColor: dotColor }]}>
                    {isDone
                      ? <Feather name="check" size={9} color="#fff" />
                      : <Text style={c.stepDotNum}>{i + 1}</Text>
                    }
                  </View>
                  <Text
                    style={[c.stepPillLabel, { color: isDone ? GREEN : (isActive ? s.color : DIM) }]}
                    numberOfLines={2}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Step header card — desplazable */}
          <View style={[c.stepHeader, { borderLeftColor: step.color }]}>
            <View style={[c.stepIconCircle, { backgroundColor: step.color + "18" }]}>
              <Feather name={step.icon} size={24} color={step.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={c.stepTitle}>{step.title}</Text>
            </View>
          </View>

          {/* Step content */}
          <View style={c.content}>
            {currentStep === 0 && <StepNombre onFocusField={compactFooter ? revealProfessional : undefined} />}
            {currentStep === 1 && <StepUbicacion onFocusField={compactFooter ? revealProfessional : undefined} />}
            {currentStep === 2 && <StepHorario currentSector={currentSector} />}
            {currentStep === 3 && <StepServicios currentSector={currentSector} saveRef={stepSaveRef} />}
            {currentStep === 4 && <StepEspacios currentSector={currentSector} saveRef={stepSaveRef} onRevealProfessional={revealProfessional} />}
            {currentStep === 5 && <StepReservas />}
            {currentStep === 6 && <StepPlano currentSector={currentSector} onOpenEditor={() => setPlanoEditorOpen(true)} />}
            {currentStep === 7 && (
              <StepPublicar
                onOpenVerificacion={onOpenVerificacion}
                onGoToStep={animateToStep}
                onGoToActivity={() => setPhase("activity")}
              />
            )}
          </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* ── Footer navigation — solo avance; retroceso via FAB flotante ── */}
      <View style={[c.footer, { paddingBottom: insets.bottom + 12, justifyContent: "flex-end" }, compactFooter && { paddingTop: 4, paddingBottom: keyboardVisible ? 4 : insets.bottom + 4 }]}>
        <TouchableOpacity
          activeOpacity={canProceed ? 0.88 : 1}
          onPress={canProceed && !isAdvancing ? goNext : undefined}
          disabled={isAdvancing}
          style={[c.nextBtn, compactFooter && c.nextBtnCompact, {
            backgroundColor: canProceed ? GREEN : "rgba(0,0,0,0.10)",
            borderWidth: canProceed ? 0 : 1,
            borderColor: "rgba(0,0,0,0.10)",
          }]}
        >
          <Text style={[c.nextBtnTxt, compactFooter && c.nextBtnTxtCompact, { color: canProceed ? "#fff" : "rgba(0,0,0,0.30)" }]}>
            {isLast ? t("biz_finish_config") : t("biz_next")}
          </Text>
          <Feather
            name={isLast ? "check-circle" : "arrow-right"}
            size={compactFooter ? 16 : 17}
            color={canProceed ? "#fff" : "rgba(0,0,0,0.25)"}
          />
        </TouchableOpacity>
      </View>

      {/* ── PlanoEmpresaScreen — modal overlay for step 7 ── */}
      <Modal
        visible={planoEditorOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPlanoEditorOpen(false)}
      >
        <PlanoEmpresaScreen
          businessId={demo?.businessId ?? "my_business"}
          hideFAB={Boolean(demo)}
          showBackButton={true}
          businessName={config.businessName?.trim() || t("biz_my_business")}
          templateId={config.subId ?? undefined}
          onClose={() => setPlanoEditorOpen(false)}
          onNext={() => { setPlanoEditorOpen(false); setTimeout(() => advanceStep(), 120); }}
        />
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 1 — NOMBRE
// ═══════════════════════════════════════════════════════════════════════════════

function StepNombre({ onFocusField }: { onFocusField?: (input: TextInput) => void }) {
  const nameInput = useRef<TextInput>(null);
  const { t } = useLanguage();
  const { config, updateConfig } = useBusinessConfig();
  return (
    <View>
      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{t("biz_visible_name_go")}</Text>
        <TextInput
          ref={nameInput}
          onFocus={() => { if (nameInput.current) onFocusField?.(nameInput.current); }}
          style={c.nameInput}
          value={config.businessName ?? ""}
          onChangeText={v => updateConfig({ businessName: v })}
          placeholder={t("biz_name_placeholder")}
          placeholderTextColor={DIM}
          returnKeyType="done"
          autoFocus
          maxLength={60}
        />
        {(config.businessName?.length ?? 0) > 0 && (
          <Text style={c.charCount}>{config.businessName!.length}/60</Text>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 2 — UBICACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

function StepUbicacion({ onFocusField }: { onFocusField?: (input: TextInput) => void }) {
  const addressInput = useRef<TextInput>(null);
  const contactInputs = useRef<Partial<Record<"phone" | "mobile" | "whatsapp", TextInput | null>>>({});
  const { t, lang } = useLanguage();
  const { saveDeviceCoordinates, beginLocationReturn, consumeLocationReturn, finishLocationReturn } = useOwnerBusinessDemo();
  const { config, updateConfig, demo } = useBusinessConfig();
  const [gpsBusy, setGpsBusy] = useState(false);
  const gpsInFlight = useRef(false);
  const stepMounted = useRef(true);
  useEffect(() => { stepMounted.current = true; return () => { stepMounted.current = false; }; }, []);
  const [fallbackCountry, setFallbackCountry] = useState<BusinessPhoneCountry>(() => {
    const deviceLocale = NativeModules.SettingsManager?.settings?.AppleLocale
      ?? NativeModules.I18nManager?.localeIdentifier ?? Intl.DateTimeFormat().resolvedOptions().locale;
    return resolveBusinessPhoneCountry(config.countryCode, deviceLocale);
  });
  const country = isPhoneCountry(config.countryCode) ? config.countryCode : fallbackCountry;
  const selectedCountry = PHONE_COUNTRIES.find(item => item.code === country)!;
  useEffect(() => {
    if (config.countryCode) return;
    let active = true;
    AsyncStorage.getItem(MARKET_STORAGE_KEY).then(market => {
      if (!active || !market || !Object.prototype.hasOwnProperty.call(COUNTRY_CONFIGS, market)) return;
      const regionalCountry = COUNTRY_CONFIGS[market as Market].countryCode;
      if (isPhoneCountry(regionalCountry)) setFallbackCountry(regionalCountry);
    }).catch(() => {});
    return () => { active = false; };
  }, [config.countryCode]);
  const persist = async (patch: Partial<typeof config>) => {
    if (demo) await demo.updateConfig(patch);
    else updateConfig(patch);
  };
  const handleGPS = async () => {
    if (gpsInFlight.current) return;
    gpsInFlight.current = true; setGpsBusy(true);
    let returnToken: number | undefined;
    const addressBeforeLookup = demo?.getSnapshot().config.address ?? config.address;
    try {
      if (demo) returnToken = beginLocationReturn(demo.getSnapshot().ownerUserId);
      const result = await readBusinessDeviceLocation(Location, {
        // Use Expo's native reverse geocoder in DEMO too; no new API or business write.
        allowAddressLookup: true,
        onCoordinates: coordinates => demo
          ? saveDeviceCoordinates(coordinates, demo.getSnapshot().ownerUserId, country, returnToken)
          : persist({ coordinates, countryCode: country }),
      });
      if (!demo && !stepMounted.current) return;
      if (result.status === "address") {
        // The permission prompt may have remounted this step. Save to the captured,
        // owner-guarded DEMO company even then, without overwriting a manual edit.
        const currentAddress = demo?.getSnapshot().config.address ?? config.address;
        if (currentAddress === addressBeforeLookup) await persist({ address: result.address });
      }
      if (!stepMounted.current) return;
      if (result.status === "denied") {
        Alert.alert(lang === "en" ? "Location permission denied" : "Permiso de ubicación denegado",
          lang === "en" ? "You can enter the business address manually." : "Puedes introducir la dirección del negocio manualmente.");
      } else if (result.status === "coordinates") {
        Alert.alert(lang === "en" ? "Coordinates saved" : "Coordenadas guardadas",
          lang === "en" ? "Address lookup is unavailable here. Enter the address manually; the coordinates remain saved."
            : "No se ha encontrado una dirección precisa. Introduce o confirma la dirección manualmente; las coordenadas quedan guardadas.");
      }
    } catch {
      if (!stepMounted.current) return;
      Alert.alert(lang === "en" ? "Location unavailable" : "Ubicación no disponible",
        lang === "en" ? "Could not obtain or save the device location. Enter the address manually."
          : "No se pudo obtener o guardar la ubicación del dispositivo. Introduce la dirección manualmente.");
    } finally {
      if (returnToken !== undefined) {
        if (stepMounted.current) consumeLocationReturn(returnToken);
        finishLocationReturn(returnToken);
      }
      gpsInFlight.current = false;
      if (stepMounted.current) setGpsBusy(false);
    }
  };
  const selectCountry = () => Alert.alert(lang === "en" ? "Country and calling code" : "País y prefijo telefónico", undefined,
    [...PHONE_COUNTRIES.map(item => ({ text: item.flag + " " + item.countryName + " " + item.prefix, onPress: () => {
      setFallbackCountry(item.code);
      updateConfig({ countryCode: item.code,
        phoneE164: validateBusinessPhone(config.phone ?? "", item.code, "landline").international,
        mobileE164: validateBusinessPhone(config.mobile ?? "", item.code, "mobile").international,
        whatsappE164: validateBusinessPhone(config.whatsapp ?? "", item.code).international });
    } })), { text: t("biz_cancel"), style: "cancel" as const }]);
  const contacts: Array<{ field: "phone" | "mobile" | "whatsapp"; normalized: "phoneE164" | "mobileE164" | "whatsappE164"; kind: BusinessPhoneKind; label: string; icon: "phone" | "smartphone" | "message-circle"; color: string }> = [
    { field: "phone", normalized: "phoneE164", kind: "landline", label: t("biz_landline"), icon: "phone", color: BLUE },
    { field: "mobile", normalized: "mobileE164", kind: "mobile", label: lang === "en" ? "Mobile" : "Móvil", icon: "smartphone", color: BLUE },
    { field: "whatsapp", normalized: "whatsappE164", kind: "whatsapp", label: t("biz_whatsapp_business"), icon: "message-circle", color: "#25D366" },
  ];
  return (
    <View>
      <View style={c.sectionCard}>
        <TextInput ref={addressInput} onFocus={() => { if (addressInput.current) onFocusField?.(addressInput.current); }}
          style={c.nameInput} value={config.address ?? ""} onChangeText={address => updateConfig({ address })}
          placeholder={t("biz_address_placeholder")} placeholderTextColor={DIM} returnKeyType="done" autoFocus maxLength={120} />
        {config.coordinates && <Text style={{ color: GRAY, fontSize: 12, marginTop: 8 }}>
          {config.coordinates.latitude.toFixed(5)}, {config.coordinates.longitude.toFixed(5)}
        </Text>}
        {config.coordinates && !config.address?.trim() && <Text style={{ color: GRAY, fontSize: 12, marginTop: 8 }}>
          {lang === "en" ? "Enter or confirm the business address manually." : "Introduce o confirma la dirección del negocio manualmente."}
        </Text>}
      </View>
      <TouchableOpacity activeOpacity={0.85} disabled={gpsBusy} onPress={handleGPS} style={[c.gpsBtn, gpsBusy && { opacity: 0.5 }]}>
        <Feather name="navigation" size={15} color={GREEN} /><Text style={c.gpsBtnTxt}>{t("biz_use_current_location")}</Text>
      </TouchableOpacity>
      <Text style={[c.sectionLabel, { marginBottom: 8 }]}>{t("biz_contact")}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === "en" ? "Choose phone country and calling code" : "Elegir país y prefijo telefónico"}
        onPress={selectCountry} style={{ alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, marginBottom: 12 }}>
        <Text style={{ color: TEXT, fontSize: 13 }}>{selectedCountry.flag} {selectedCountry.countryName} {selectedCountry.prefix} ▾</Text>
      </TouchableOpacity>
      {contacts.map(contact => {
        const value = config[contact.field] ?? "";
        const checked = validateBusinessPhone(value, country, contact.kind);
        return (
          <View key={contact.field} style={c.sectionCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Feather name={contact.icon} size={18} color={contact.color} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={c.sectionLabel}>{contact.label}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: GRAY, fontSize: 14 }}>{selectedCountry.prefix}</Text>
                  <TextInput ref={input => { contactInputs.current[contact.field] = input; }}
                    onFocus={() => { const input = contactInputs.current[contact.field]; if (input) onFocusField?.(input); }}
                    style={[c.nameInput, { flex: 1, minWidth: 0, marginTop: 2 }]} value={businessPhoneInput(value, country)}
                    accessibilityLabel={contact.label} placeholder={lang === "en" ? "National number" : "Número nacional"} placeholderTextColor={DIM}
                    keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" returnKeyType="done" maxLength={64}
                    onChangeText={input => {
                      const national = businessPhoneInput(input, country), result = validateBusinessPhone(input, country, contact.kind);
                      updateConfig({ [contact.field]: national, [contact.normalized]: result.international, countryCode: country });
                    }} />
                </View>
                {!checked.valid && <Text accessibilityRole="alert" style={{ color: RED, fontSize: 12, marginTop: 5 }}>
                  {businessPhoneError(value, country, contact.kind, lang)}
                </Text>}
              </View>
            </View>
          </View>
        );
      })}
      <Text style={{ color: GRAY, fontSize: 11, lineHeight: 16, marginBottom: 12 }}>
        {lang === "en" ? "A valid number format does not confirm WhatsApp availability." : "Un formato válido no confirma que el número tenga WhatsApp."}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 3 — HORARIOS (day-by-day, copy to other days)
// ═══════════════════════════════════════════════════════════════════════════════

const SCHED_DAYS_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const SCHED_DAYS_FULL  = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function buildDaysShortT(t: (k: any) => string): string[] {
  return [t("biz_day_mon_short"), t("biz_day_tue_short"), t("biz_day_wed_short"), t("biz_day_thu_short"), t("biz_day_fri_short"), t("biz_day_sat_short"), t("biz_day_sun_short")];
}

function buildDefaultSchedules(openFrom: string, openTo: string): Record<number, DaySchedule> {
  const result: Record<number, DaySchedule> = {};
  for (let i = 0; i < 7; i++) {
    result[i] = {
      shift1: { from: openFrom, to: openTo, active: true },
      shift2: { from: "16:00", to: "20:00", active: false },
    };
  }
  return result;
}

function buildDefaultStaffSchedules(cfg: { daySchedules: Record<string, DaySchedule>; openFrom: string; openTo: string }): Record<string, DaySchedule> {
  const result: Record<string, DaySchedule> = {};
  for (let i = 0; i < 7; i++) {
    const raw = (cfg.daySchedules as any)?.[String(i)];
    if (raw && "shift1" in raw) { result[String(i)] = raw as DaySchedule; continue; }
    result[String(i)] = {
      shift1: { from: cfg.openFrom ?? "09:00", to: cfg.openTo ?? "20:00", active: true },
      shift2: { from: "16:00", to: "20:00", active: false },
    };
  }
  return result;
}

function StepHorario({ currentSector }: { currentSector: Sector | null }) {
  const { t } = useLanguage();
  const SCHED_DAYS_FULL_T  = [t("biz_day_mon_full"), t("biz_day_tue_full"), t("biz_day_wed_full"), t("biz_day_thu_full"), t("biz_day_fri_full"), t("biz_day_sat_full"), t("biz_day_sun_full")];
  const SCHED_DAYS_SHORT_T = buildDaysShortT(t);
  const { config, updateConfig } = useBusinessConfig();
  const color = currentSector?.color ?? PURPLE;
  const [selectedDay, setSelectedDay] = useState(0);

  const [daySchedules, setDaySchedules] = useState<Record<number, DaySchedule>>(() => {
    const stored  = config.daySchedules ?? {};
    const defaults = buildDefaultSchedules(config.openFrom, config.openTo);
    const result: Record<number, DaySchedule> = {};
    for (let i = 0; i < 7; i++) {
      const raw = (stored as Record<string, any>)[String(i)];
      if (!raw) { result[i] = defaults[i]; continue; }
      if ("shift1" in raw) { result[i] = raw as DaySchedule; continue; }
      result[i] = {
        shift1: { from: raw.from ?? config.openFrom, to: raw.to ?? config.openTo, active: true },
        shift2: { from: "16:00", to: "20:00", active: false },
      };
    }
    return result;
  });

  const isActive = (day: number) => config.activeDays.includes(day);

  const saveDaySchedules = (ds: Record<number, DaySchedule>, activeDays: number[]) => {
    const rec: Record<string, DaySchedule> = {};
    let minFrom = "23:59";
    let maxTo   = "00:00";
    for (const day of activeDays) {
      const s = ds[day];
      if (!s) continue;
      if (s.shift1.active) {
        if (s.shift1.from < minFrom) minFrom = s.shift1.from;
        if (s.shift1.to   > maxTo)   maxTo   = s.shift1.to;
      }
      if (s.shift2.active) {
        if (s.shift2.from < minFrom) minFrom = s.shift2.from;
        if (s.shift2.to   > maxTo)   maxTo   = s.shift2.to;
      }
    }
    if (minFrom === "23:59") minFrom = "09:00";
    if (maxTo   === "00:00") maxTo   = "20:00";
    for (let i = 0; i < 7; i++) rec[String(i)] = ds[i];
    updateConfig({ daySchedules: rec, openFrom: minFrom, openTo: maxTo });
  };

  const toggleDay = (day: number) => {
    Haptics.selectionAsync().catch(() => {});
    const next = isActive(day)
      ? config.activeDays.filter(d => d !== day)
      : [...config.activeDays, day];
    updateConfig({ activeDays: next });
    saveDaySchedules(daySchedules, next);
  };

  const patchShift = (day: number, shift: "shift1" | "shift2", patch: Partial<DayShift>) => {
    const s = daySchedules[day];
    const upd = { ...daySchedules, [day]: { ...s, [shift]: { ...s[shift], ...patch } } };
    setDaySchedules(upd);
    saveDaySchedules(upd, config.activeDays);
  };

  const copyTo = (days: number[]) => {
    const src = daySchedules[selectedDay];
    if (!src) return;
    const upd = { ...daySchedules };
    for (const d of days) { if (d !== selectedDay) upd[d] = { ...src }; }
    setDaySchedules(upd);
    const newActive = [...new Set([...config.activeDays, ...days])];
    updateConfig({ activeDays: newActive });
    saveDaySchedules(upd, newActive);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleCopy = () => {
    if (!isActive(selectedDay)) return;
    const src = daySchedules[selectedDay];
    const t1s = `${src.shift1.from}–${src.shift1.to}`;
    const t2s = src.shift2.active ? ` · ${src.shift2.from}–${src.shift2.to}` : "";
    Alert.alert(
      t("biz_copy_schedule"),
      `${t("biz_copy_prefix")} ${SCHED_DAYS_FULL_T[selectedDay]} (${t1s}${t2s}) ${t("biz_copy_to_suffix")}`,
      [
        { text: t("biz_weekdays_mon_fri"), onPress: () => copyTo([0, 1, 2, 3, 4]) },
        { text: t("biz_all_days"),         onPress: () => copyTo([0, 1, 2, 3, 4, 5, 6]) },
        { text: t("biz_cancel"), style: "cancel" },
      ]
    );
  };

  const sel       = daySchedules[selectedDay];
  const selActive = isActive(selectedDay);

  return (
    <View>
      <View style={c.sectionCard}>
        {/* Day pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {SCHED_DAYS_SHORT.map((d, idx) => {
              const active = isActive(idx);
              const isSel  = selectedDay === idx;
              return (
                <TouchableOpacity
                  key={d}
                  activeOpacity={0.75}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedDay(idx); }}
                  style={[c.dayPill2, isSel && { backgroundColor: color, borderColor: color }]}
                >
                  <Text style={[c.dayPillTxt2, isSel && { color: "#fff", fontWeight: "700" }]}>{d}</Text>
                  <View style={[c.dayDot, active ? c.dayDotOn : c.dayDotOff]} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Selected day title */}
        <Text style={{ fontSize: 18, fontWeight: "700", color: TEXT, marginBottom: 14 }}>
          {SCHED_DAYS_FULL_T[selectedDay]}
        </Text>

        {/* Open / closed toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: BORDER, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: TEXT }}>
              {selActive ? t("biz_open") : t("biz_closed")}
            </Text>
            <Text style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              {selActive ? t("biz_day_accepts_bookings") : t("biz_day_no_bookings")}
            </Text>
          </View>
          <Switch
            value={selActive}
            onValueChange={() => toggleDay(selectedDay)}
            trackColor={{ false: "#E5E7EB", true: color }}
            thumbColor={Platform.OS === "android" ? (selActive ? "#fff" : "#f4f3f4") : undefined}
            ios_backgroundColor="#E5E7EB"
          />
        </View>

        {/* Shift pickers */}
        {selActive && sel && (
          <>
            {/* Turno 1 */}
            <View style={{ marginTop: 4 }}>
              <Text style={c.shiftLabel}>{t("biz_shift_1")}</Text>
              <View style={[c.timeRow, { paddingTop: 6 }]}>
                <View style={{ flex: 1 }}>
                  <GoTimeField
                    label={t("biz_opening")}
                    value={sel.shift1.from}
                    onConfirm={v => patchShift(selectedDay, "shift1", { from: v })}
                    minuteStep={30}
                    accentColor={color}
                  />
                </View>
                <View style={{ alignItems: "center", paddingTop: 20 }}>
                  <Feather name="arrow-right" size={18} color={DIM} />
                </View>
                <View style={{ flex: 1 }}>
                  <GoTimeField
                    label={t("biz_closing")}
                    value={sel.shift1.to}
                    onConfirm={v => patchShift(selectedDay, "shift1", { to: v })}
                    minuteStep={30}
                    accentColor={color}
                  />
                </View>
              </View>
            </View>

            {/* Turno 2 */}
            {sel.shift2.active ? (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <Text style={[c.shiftLabel, { flex: 1 }]}>{t("biz_shift_2")}</Text>
                  <TouchableOpacity
                    onPress={() => patchShift(selectedDay, "shift2", { active: false })}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, color: RED, fontWeight: "600" }}>{t("biz_remove")}</Text>
                  </TouchableOpacity>
                </View>
                <View style={c.timeRow}>
                  <View style={{ flex: 1 }}>
                    <GoTimeField
                      label={t("biz_opening")}
                      value={sel.shift2.from}
                      onConfirm={v => patchShift(selectedDay, "shift2", { from: v })}
                      minuteStep={30}
                      accentColor={color}
                    />
                  </View>
                  <View style={{ alignItems: "center", paddingTop: 20 }}>
                    <Feather name="arrow-right" size={18} color={DIM} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <GoTimeField
                      label={t("biz_closing")}
                      value={sel.shift2.to}
                      onConfirm={v => patchShift(selectedDay, "shift2", { to: v })}
                      minuteStep={30}
                      accentColor={color}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => patchShift(selectedDay, "shift2", { active: true })}
                activeOpacity={0.75}
                style={c.addShiftBtn}
              >
                <Feather name="plus-circle" size={14} color={color} />
                <Text style={[c.addShiftTxt, { color }]}>{t("biz_add_second_shift")}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={handleCopy} activeOpacity={0.75} style={c.copyBtn}>
              <Feather name="copy" size={14} color={color} />
              <Text style={[c.copyBtnTxt, { color }]}>{t("biz_copy_schedule_to_others")}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Weekly summary */}
        <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER, gap: 8 }}>
          {SCHED_DAYS_SHORT.map((d, idx) => {
            const open  = isActive(idx);
            const times = daySchedules[idx];
            let summary = t("biz_closed");
            if (open && times) {
              const parts: string[] = [];
              if (times.shift1.active) parts.push(`${times.shift1.from}–${times.shift1.to}`);
              if (times.shift2.active) parts.push(`${times.shift2.from}–${times.shift2.to}`);
              summary = parts.join(" · ") || t("biz_open");
            }
            return (
              <View key={d} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: open ? TEXT : DIM, width: 30 }}>{d}</Text>
                <Text style={{ fontSize: 13, color: open ? GRAY : "#FCA5A5" }}>{summary}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 4 — ESPACIOS / PROFESIONALES (helpers)
// ═══════════════════════════════════════════════════════════════════════════════

function ProfessionalScheduleSection({
  staffName,
  staffId,
  businessId,
  color,
}: {
  staffName: string;
  staffId?: string;
  businessId: string;
  color: string;
}) {
  const { t } = useLanguage();
  const SCHED_DAYS_FULL_T  = [t("biz_day_mon_full"), t("biz_day_tue_full"), t("biz_day_wed_full"), t("biz_day_thu_full"), t("biz_day_fri_full"), t("biz_day_sat_full"), t("biz_day_sun_full")];
  const SCHED_DAYS_SHORT_T = buildDaysShortT(t);
  const { config, updateConfig } = useBusinessConfig();
  const [expanded,    setExpanded]    = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  const stableId = staffId ?? `${businessId}_staff_${staffName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;

  const schedCfg: StaffScheduleConfig = (config.staffSchedules ?? {})[stableId] ?? {
    useCompanySchedule: true,
    daySchedules: {},
  };

  const isCompany = schedCfg.useCompanySchedule;

  // ── Estado local para los turnos — mismo patrón que StepHorario ──────────────
  // Leer el switch directamente del contexto causaba lag visible porque React
  // batching retrasaba el re-render. Estado local hace la UI inmediatamente reactiva.
  const [localDs, setLocalDs] = useState<Record<string, DaySchedule>>(() => {
    // Inicializar con datos guardados del profesional si existen
    const savedCfg = (config.staffSchedules ?? {})[stableId];
    if (savedCfg && !savedCfg.useCompanySchedule && Object.keys(savedCfg.daySchedules ?? {}).length > 0) {
      const result: Record<string, DaySchedule> = {};
      for (let i = 0; i < 7; i++) {
        const saved = (savedCfg.daySchedules as any)?.[String(i)];
        if (saved && "shift1" in saved) { result[String(i)] = saved; continue; }
        const company = (config.daySchedules as any)?.[String(i)];
        result[String(i)] = (company && "shift1" in company) ? company : {
          shift1: { from: config.openFrom ?? "09:00", to: config.openTo ?? "20:00", active: true },
          shift2: { from: "16:00", to: "20:00", active: false },
        };
      }
      return result;
    }
    return buildDefaultStaffSchedules(config as any);
  });

  const getDs = (day: number): DaySchedule =>
    localDs[String(day)] ?? {
      shift1: { from: config.openFrom ?? "09:00", to: config.openTo ?? "20:00", active: true },
      shift2: { from: "16:00", to: "20:00", active: false },
    };

  const saveDs = (ds: Record<string, DaySchedule>) => {
    const next: StaffScheduleConfig = { useCompanySchedule: false, daySchedules: ds };
    updateConfig({ staffSchedules: { ...(config.staffSchedules ?? {}), [stableId]: next } });
  };

  const setMode = (useCompany: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (!useCompany) {
      const built = buildDefaultStaffSchedules(config as any);
      setLocalDs(built);
      const next: StaffScheduleConfig = { useCompanySchedule: false, daySchedules: built };
      updateConfig({ staffSchedules: { ...(config.staffSchedules ?? {}), [stableId]: next } });
    } else {
      const next: StaffScheduleConfig = { useCompanySchedule: true, daySchedules: {} };
      updateConfig({ staffSchedules: { ...(config.staffSchedules ?? {}), [stableId]: next } });
    }
  };

  const isDayActive = (day: number) => {
    const ds = getDs(day);
    return ds.shift1.active || ds.shift2.active;
  };

  const toggleDayActive = (day: number) => {
    Haptics.selectionAsync().catch(() => {});
    const ds     = getDs(day);
    const active = ds.shift1.active || ds.shift2.active;
    const nextDs: DaySchedule = active
      ? { shift1: { ...ds.shift1, active: false }, shift2: { ...ds.shift2, active: false } }
      : { shift1: { ...ds.shift1, active: true  }, shift2: ds.shift2 };
    const next = { ...localDs, [String(day)]: nextDs };
    setLocalDs(next);
    saveDs(next);
  };

  const patchDayShift = (day: number, shift: "shift1" | "shift2", patch: Partial<DayShift>) => {
    const ds = getDs(day);
    const nextDs: DaySchedule = { ...ds, [shift]: { ...ds[shift], ...patch } };
    const next = { ...localDs, [String(day)]: nextDs };
    setLocalDs(next);
    saveDs(next);
  };

  const copyToStaffDays = (days: number[]) => {
    const src = getDs(selectedDay);
    const next = { ...localDs };
    for (const d of days) { if (d !== selectedDay) next[String(d)] = { ...src }; }
    setLocalDs(next);
    saveDs(next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleCopyStaff = () => {
    if (!isDayActive(selectedDay)) return;
    const src = getDs(selectedDay);
    const t1 = `${src.shift1.from}–${src.shift1.to}`;
    const t2 = src.shift2.active ? ` · ${src.shift2.from}–${src.shift2.to}` : "";
    Alert.alert(
      t("biz_copy_schedule"),
      `${t("biz_copy_prefix")} ${SCHED_DAYS_FULL_T[selectedDay]} (${t1}${t2}) ${t("biz_copy_to_suffix")}`,
      [
        { text: t("biz_weekdays_mon_fri"), onPress: () => copyToStaffDays([0, 1, 2, 3, 4]) },
        { text: t("biz_all_days"),         onPress: () => copyToStaffDays([0, 1, 2, 3, 4, 5, 6]) },
        { text: t("biz_cancel"), style: "cancel" },
      ]
    );
  };

  const sel = getDs(selectedDay);

  return (
    <View style={[c.proSchedWrapper, { borderColor: color + "25" }]}>
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
        style={c.proSchedHeader}
      >
        <Feather name="clock" size={12} color={color} />
        <Text style={[c.proSchedHeaderTxt, { color }]}>
          {t("biz_schedule_colon")} {isCompany ? t("biz_company_schedule") : t("biz_custom_schedule")}
        </Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color={color} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingHorizontal: 4, paddingBottom: 12, gap: 8 }}>
          {/* Mode toggle */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
            {([t("biz_company_schedule"), t("biz_custom_schedule")] as const).map((label, idx) => {
              const sel2 = idx === 0 ? isCompany : !isCompany;
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => setMode(idx === 0)}
                  activeOpacity={0.8}
                  style={[c.proSchedModeChip, sel2 && { borderColor: color, backgroundColor: color + "12" }]}
                >
                  <Text style={[c.proSchedModeChipTxt, sel2 && { color, fontWeight: "700" }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!isCompany && (
            <>
              {/* Day pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {SCHED_DAYS_SHORT.map((d, idx) => {
                    const active = isDayActive(idx);
                    const isSel  = selectedDay === idx;
                    return (
                      <TouchableOpacity
                        key={d}
                        activeOpacity={0.75}
                        onPress={() => setSelectedDay(idx)}
                        style={[
                          c.proSchedDayPill,
                          isSel && { backgroundColor: color, borderColor: color },
                          !active && !isSel && { opacity: 0.35 },
                        ]}
                      >
                        <Text style={[c.proSchedDayTxt, isSel && { color: "#fff", fontWeight: "700" }]}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Day active toggle */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: TEXT }}>
                  {SCHED_DAYS_FULL_T[selectedDay]}: {isDayActive(selectedDay) ? t("biz_active") : t("biz_free")}
                </Text>
                <Switch
                  value={isDayActive(selectedDay)}
                  onValueChange={() => toggleDayActive(selectedDay)}
                  trackColor={{ false: "#E5E7EB", true: color }}
                  thumbColor={Platform.OS === "android" ? "#fff" : undefined}
                  ios_backgroundColor="#E5E7EB"
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>

              {/* Shift pickers */}
              {isDayActive(selectedDay) && (
                <>
                  <View style={[c.timeRow, { paddingTop: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <GoTimeField label={t("biz_shift_1_start")} value={sel.shift1.from}
                        onConfirm={v => patchDayShift(selectedDay, "shift1", { from: v })} minuteStep={30} accentColor={color} />
                    </View>
                    <View style={{ alignItems: "center", paddingTop: 20 }}>
                      <Feather name="arrow-right" size={14} color={DIM} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <GoTimeField label={t("biz_shift_1_end")} value={sel.shift1.to}
                        onConfirm={v => patchDayShift(selectedDay, "shift1", { to: v })} minuteStep={30} accentColor={color} />
                    </View>
                  </View>

                  {sel.shift2.active ? (
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                        <Text style={[c.shiftLabel, { flex: 1, fontSize: 11 }]}>{t("biz_shift_2")}</Text>
                        <TouchableOpacity onPress={() => patchDayShift(selectedDay, "shift2", { active: false })} hitSlop={8}>
                          <Text style={{ fontSize: 11, color: RED, fontWeight: "600" }}>{t("biz_remove")}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={c.timeRow}>
                        <View style={{ flex: 1 }}>
                          <GoTimeField label={t("biz_shift_2_start")} value={sel.shift2.from}
                            onConfirm={v => patchDayShift(selectedDay, "shift2", { from: v })} minuteStep={30} accentColor={color} />
                        </View>
                        <View style={{ alignItems: "center", paddingTop: 20 }}>
                          <Feather name="arrow-right" size={14} color={DIM} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <GoTimeField label={t("biz_shift_2_end")} value={sel.shift2.to}
                            onConfirm={v => patchDayShift(selectedDay, "shift2", { to: v })} minuteStep={30} accentColor={color} />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => patchDayShift(selectedDay, "shift2", { active: true })}
                      activeOpacity={0.75}
                      style={c.addShiftBtn}
                    >
                      <Feather name="plus-circle" size={11} color={color} />
                      <Text style={[c.addShiftTxt, { color, fontSize: 11 }]}>{t("biz_add_2nd_shift")}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Copiar horario a otros días */}
                  <TouchableOpacity
                    onPress={handleCopyStaff}
                    activeOpacity={0.75}
                    style={c.copyBtn}
                  >
                    <Feather name="copy" size={14} color={color} />
                    <Text style={[c.copyBtnTxt, { color }]}>{t("biz_copy_schedule_to_others")}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function StepEspacios({ currentSector, saveRef, onRevealProfessional }: {
  currentSector: Sector | null; saveRef?: StepSaveRef; onRevealProfessional?: (input: TextInput) => void;
}) {
  const { t, lang } = useLanguage();
  const { config, updateConfig, demo } = useBusinessConfig();
  const [addingNew,    setAddingNew]    = useState(false);
  const [newLabel,     setNewLabel]     = useState("");
  const [newEmoji,     setNewEmoji]     = useState("🪑");

  // Sustitución inline: qué slot se está sustituyendo y nombre temporal
  const [substituting, setSubstituting] = useState<{
    itemId: string;
    slotIdx: number;
    tempName: string;
  } | null>(null);

  // Picker de emoji por slot individual
  const [staffEmojiPicker, setStaffEmojiPicker] = useState<{
    itemId: string;
    slotIdx: number;
  } | null>(null);

  // Draft names: while the user is typing, we only update this local map.
  // The real patchStaffName is only called on blur / submit to avoid creating
  // partial-name professionals on every keystroke.
  const staffDraftKey = (item: PlantillaItem, index: number) => item.staffIds?.[index] ?? item.id + "_" + index;
  const [draftNames, setDraftNamesLocal] = useState<Record<string, string>>({});
  const draftNamesRef = useRef(draftNames);
  const professionalInputs = useRef(new Map<string, TextInput>());
  const pendingReveal = useRef<string | null>(null);
  const lastCreatedProfessional = useRef<string | null>(null);
  const addingProfessionalRef = useRef(false);
  const [addingProfessional, setAddingProfessional] = useState(false);
  const focusProfessional = (key: string) => {
    const input = professionalInputs.current.get(key);
    if (!input) return false;
    input.focus(); onRevealProfessional?.(input); return true;
  };
  const setDraftNames = useCallback((value: Record<string, string> | ((previous: Record<string, string>) => Record<string, string>)) => {
    draftNamesRef.current = typeof value === "function" ? value(draftNamesRef.current) : value;
    setDraftNamesLocal(draftNamesRef.current);
  }, []);

  const saveItems = useCallback((plantillaItems: PlantillaItem[]) => demo
    ? demo.updateConfig({ plantillaItems }) : updateConfig({ plantillaItems }), [demo, updateConfig]);
  const withIds = useCallback((value: PlantillaItem[]) => demo ? ensureBusinessDemoStaffIds(value, demo.businessId) : value, [demo]);
  const { draft: items, setValue: setDraftItems, flush: flushItems, getDraft: getItems } = useConfigArrayDraft(
    config.plantillaItems, withIds, value => value, saveItems);
  const setItems = useCallback((value: PlantillaItem[] | ((previous: PlantillaItem[]) => PlantillaItem[])) =>
    setDraftItems(previous => withIds(typeof value === "function" ? value(previous) : value)), [setDraftItems, withIds]);
  const flushNames = useCallback(() => {
    const drafts = draftNamesRef.current;
    if (!Object.keys(drafts).length) return flushItems();
    return setItems(getItems().map(item => {
      const names = [...(item.staffNames ?? Array.from({ length: item.count }, () => ""))];
      for (let index = 0; index < item.count; index++) {
        const name = drafts[staffDraftKey(item, index)];
        if (name !== undefined) names[index] = name.trim().length >= 3 ? name.trim() : "";
      }
      return { ...item, staffNames: names };
    }));
  }, [flushItems, getItems, setItems]);
  useStepSave(saveRef, flushNames);

  const color    = currentSector?.color ?? BLUE;
  const addLabel = getAddLabel(config.subId);
  const sectorId = SUB_TO_SECTOR[config.subId ?? ""] ?? "";
  const isPeople = PEOPLE_SECTORS.has(sectorId);

  // Services defined in the previous step
  const availableServices = (config.services ?? []).filter(s => s.name.trim());

  const removeItem = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.filter(it => it.id !== id));
  };

  // Elimina un slot individual (una persona) dentro de un ítem
  const removeSlot = (itemId: string, slotIdx: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setItems(prev => prev.flatMap(it => {
      if (it.id !== itemId) return [it];
      const newCount      = it.count - 1;
      if (newCount <= 0) {
        // For people sectors, keep the container so "Add professional" stays visible.
        if (isPeople) return [{ ...it, count: 0, staffNames: [], staffServices: [], staffEmojis: [], ...(demo ? { staffIds: [] } : {}) }];
        return [];
      }
      const staffNames    = [...(it.staffNames ?? [])];
      staffNames.splice(slotIdx, 1);
      const staffServices = [...(it.staffServices ?? [])];
      staffServices.splice(slotIdx, 1);
      const staffEmojis   = [...(it.staffEmojis ?? [])];
      staffEmojis.splice(slotIdx, 1);
      const staffIds = it.staffIds ? [...it.staffIds] : undefined;
      staffIds?.splice(slotIdx, 1);
      return [{ ...it, count: newCount, staffNames, staffServices, staffEmojis, ...(staffIds ? { staffIds } : {}) }];
    }));
  };

  // One insertion at a time. A second tap on an unfinished new card reveals it instead.
  const addSlot = async (itemId?: string) => {
    if (addingProfessionalRef.current) return;
    if (lastCreatedProfessional.current) {
      const key = lastCreatedProfessional.current;
      const item = getItems().find(value => Array.from({ length: value.count }, (_, i) => staffDraftKey(value, i)).includes(key));
      const index = item ? Array.from({ length: item.count }, (_, i) => staffDraftKey(item, i)).indexOf(key) : -1;
      const name = draftNamesRef.current[key] ?? item?.staffNames?.[index] ?? "";
      if (item && name.trim().length < 3) { focusProfessional(key); return; }
    }
    addingProfessionalRef.current = true; setAddingProfessional(true);
    Haptics.selectionAsync().catch(() => {});
    const defaultEmoji = getDefaultStaffEmoji(config.subId);
    try {
      const write = setItems(prev => itemId ? prev.map(it => it.id !== itemId ? it : {
        ...it, count: it.count + 1,
        staffNames: [...(it.staffNames ?? []), ""],
        staffServices: [...(it.staffServices ?? []), []],
        staffEmojis: [...(it.staffEmojis ?? []), defaultEmoji],
      }) : [...prev, {
        id: "pi_" + Date.now(), emoji: defaultEmoji, label: "", count: 1,
        staffNames: [""], staffServices: [[]], staffEmojis: [defaultEmoji],
      }]);
      const item = itemId ? getItems().find(value => value.id === itemId) : getItems().at(-1);
      if (item) pendingReveal.current = lastCreatedProfessional.current = staffDraftKey(item, item.count - 1);
      await write;
    } catch { /* The existing draft writer reports the failure and keeps the editable card. */ }
    finally { addingProfessionalRef.current = false; setAddingProfessional(false); }
  };

  // Actualiza el emoji individual de un slot
  const patchStaffEmoji = (itemId: string, slotIdx: number, emoji: string) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const staffEmojis = [...(it.staffEmojis ?? Array.from({ length: it.count }, () => getDefaultStaffEmoji(config.subId)))];
      staffEmojis[slotIdx] = emoji;
      return { ...it, staffEmojis };
    }));
  };

  // Confirma la sustitución: solo cambia el nombre, todo lo demás se mantiene
  const commitSubstitution = () => {
    if (!substituting) return;
    const { itemId, slotIdx, tempName } = substituting;
    // Aplicar mismo guard que patchStaffName: no persistir si < 3 chars
    const committed = tempName.trim().length >= 3 ? tempName.trim() : "";
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const names = [...(it.staffNames ?? Array.from({ length: it.count }, () => ""))];
      names[slotIdx] = committed;
      return { ...it, staffNames: names };
    }));
    setSubstituting(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const patchCount = (id: string, delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const newCount   = Math.max(1, it.count + delta);
      const staffNames = delta > 0
        ? [...(it.staffNames ?? []), ...Array.from({ length: newCount - (it.staffNames?.length ?? 0) }, () => "")]
        : (it.staffNames ?? []).slice(0, newCount);
      const staffServices = delta > 0
        ? [...(it.staffServices ?? []), ...Array.from({ length: newCount - (it.staffServices?.length ?? 0) }, () => [] as string[])]
        : (it.staffServices ?? []).slice(0, newCount);
      return { ...it, count: newCount, staffNames, staffServices, ...(it.staffIds ? { staffIds: it.staffIds.slice(0, newCount) } : {}) };
    }));
  };

  const patchLabel = (id: string, label: string) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, label } : it));

  const patchStaffName = (id: string, index: number, name: string, staffId?: string) => {
    // Solo persistir el nombre si tiene >= 3 chars tras trim.
    // Si el usuario borra todo o deja <= 2 chars, se guarda cadena vacía
    // (slot vacío, se puede re-editar). Esto evita que parciales de tipado
    // como "I" o "Is" se almacenen como profesionales reales.
    const committed = name.trim().length >= 3 ? name.trim() : "";
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const targetIndex = staffId && it.staffIds ? it.staffIds.indexOf(staffId) : index;
      if (targetIndex < 0) return it;
      const names = [...(it.staffNames ?? Array.from({ length: it.count }, () => ""))];
      names[targetIndex] = committed;
      return { ...it, staffNames: names };
    }));
  };

  const toggleStaffService = (id: string, slotIdx: number, serviceName: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const allSlots: string[][] = it.staffServices
        ? it.staffServices.map(s => [...s])
        : Array.from({ length: it.count }, () => []);
      while (allSlots.length < it.count) allSlots.push([]);
      const slot = allSlots[slotIdx] ?? [];
      allSlots[slotIdx] = slot.includes(serviceName)
        ? slot.filter(s => s !== serviceName)
        : [...slot, serviceName];
      return { ...it, staffServices: allSlots };
    }));
  };

  const cycleEmoji = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const idx = EMOJI_PALETTE.indexOf(it.emoji);
      return { ...it, emoji: EMOJI_PALETTE[(idx + 1) % EMOJI_PALETTE.length] };
    }));
  };

  const commitNew = () => {
    if (!newLabel.trim()) return;
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => [
      ...prev,
      {
        id:           `pi_${Date.now()}`,
        emoji:        newEmoji,
        label:        newLabel.trim(),
        count:        1,
        staffNames:   [""],
        staffServices: [[]],
      },
    ]);
    setNewLabel("");
    setNewEmoji("🪑");
    setAddingNew(false);
  };

  return (
    <View>
      {currentSector && (
        <View style={[c.sectionCard, { borderLeftWidth: 3, borderLeftColor: color }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 20 }}>{currentSector.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[c.sectionLabel, { color }]}>
                {(() => { const sub = currentSector.subs.find(s => s.id === config.subId); return sub ? getSubName(sub, lang) : getSectorLabel(currentSector, lang); })()}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{isPeople ? t("biz_professionals") : t("biz_spaces_zones")}</Text>

        {items.length === 0 && !addingNew && (
          <View style={c.emptyRow}>
            <Feather name="inbox" size={18} color={DIM} />
            <Text style={c.emptyTxt}>
              {isPeople
                ? t("biz_no_professionals_hint")
                : t("biz_no_spaces_hint")}
            </Text>
          </View>
        )}

        {items.map(item => (
          <View key={item.id}>
            {/* ── Item header row ── */}
            <View style={[c.itemRow, { borderColor: color + "25", backgroundColor: color + "04" }]}>
              <TouchableOpacity onPress={() => cycleEmoji(item.id)} hitSlop={8} activeOpacity={0.6}>
                <Text style={{ fontSize: 20, minWidth: 28, textAlign: "center" }}>{item.emoji}</Text>
              </TouchableOpacity>
              <TextInput
                style={[c.itemInput, { flex: 1 }]}
                value={item.label}
                onChangeText={v => patchLabel(item.id, v)}
                placeholder={t("biz_space_name_placeholder")}
                placeholderTextColor={DIM}
                returnKeyType="done"
                multiline
              />
              {/* Sectores de espacios: contador con + y -. Personas: solo la ❌ del ítem. */}
              {!isPeople && (
                <View style={c.counter}>
                  <TouchableOpacity
                    onPress={() => patchCount(item.id, -1)}
                    hitSlop={8}
                    activeOpacity={0.7}
                    style={[c.counterBtn, item.count <= 1 && { opacity: 0.3 }]}
                    disabled={item.count <= 1}
                  >
                    <Feather name="minus" size={12} color={BLUE} />
                  </TouchableOpacity>
                  <Text style={c.counterNum}>{item.count}</Text>
                  <TouchableOpacity onPress={() => patchCount(item.id, 1)} hitSlop={8} activeOpacity={0.7} style={c.counterBtn}>
                    <Feather name="plus" size={12} color={BLUE} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={10} activeOpacity={0.7} style={c.deleteBtn}>
                <Feather name="x" size={15} color={DIM} />
              </TouchableOpacity>
            </View>

            {/* ── Slots individuales de profesionales (isPeople only) ── */}
            {isPeople && Array.from({ length: item.count }, (_, i) => {
              const nameVal      = item.staffNames?.[i] ?? "";
              const isEmpty      = !nameVal.trim();
              const slotServices = item.staffServices?.[i] ?? [];
              const isSub        = substituting?.itemId === item.id && substituting.slotIdx === i;

              const askRemoveOrSubstitute = () => {
                const displayName = nameVal.trim() || (lang === "en" ? `Professional ${i + 1}` : `Profesional ${i + 1}`);
                Haptics.selectionAsync().catch(() => {});
                Alert.alert(
                  lang === "en" ? `What to do with "${displayName}"?` : `¿Qué hacer con "${displayName}"?`,
                  t("biz_slot_action_title"),
                  [
                    { text: t("biz_cancel"), style: "cancel" },
                    {
                      text: t("biz_replace_person"),
                      onPress: () => setSubstituting({ itemId: item.id, slotIdx: i, tempName: "" }),
                    },
                    {
                      text: t("biz_delete_slot"),
                      style: "destructive",
                      onPress: () => {
                        Alert.alert(
                          lang === "en" ? `Delete "${displayName}"` : `Eliminar "${displayName}"`,
                          t("biz_delete_slot_confirm"),
                          [
                            { text: t("biz_cancel"), style: "cancel" },
                            { text: t("biz_delete_slot"), style: "destructive", onPress: () => removeSlot(item.id, i) },
                          ]
                        );
                      },
                    },
                  ]
                );
              };

              return (
                <View
                  key={item.staffIds?.[i] ?? `${item.id}_slot_${i}`}
                  style={[
                    c.staffSlot,
                    isSub
                      ? { borderColor: BLUE + "70", backgroundColor: BLUE + "05" }
                      : isEmpty
                        ? { borderColor: GOLD + "70", backgroundColor: GOLD + "06" }
                        : { borderColor: color + "30", backgroundColor: color + "04" },
                  ]}
                >
                  {/* ── Modo sustitución: reemplazar nombre manteniendo todo lo demás ── */}
                  {isSub ? (
                    <View style={{ gap: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[c.staffNameLabel, { color: BLUE }]}>
                            {lang === "en" ? `Substitute ${nameVal.trim() || `Professional ${i + 1}`}` : `Sustituir a ${nameVal.trim() || `Profesional ${i + 1}`}`}
                          </Text>
                          <TextInput
                            style={[c.staffNameInput, { borderColor: BLUE + "60", backgroundColor: BLUE + "06" }]}
                            value={substituting!.tempName}
                            onChangeText={v => setSubstituting(s => s ? { ...s, tempName: v } : s)}
                            placeholder={t("biz_new_professional_ph")}
                            placeholderTextColor={BLUE + "88"}
                            returnKeyType="done"
                            onSubmitEditing={commitSubstitution}
                            autoFocus
                            autoCorrect={false}
                          />
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: DIM, paddingLeft: 30 }}>
                        {t("biz_keep_specialties_hint")}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 10, paddingLeft: 30 }}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={commitSubstitution}
                          style={[c.subConfirmBtn, { backgroundColor: BLUE }]}
                        >
                          <Feather name="check" size={13} color="#fff" />
                          <Text style={c.subConfirmTxt}>{t("biz_confirm_substitution")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setSubstituting(null)}
                          style={c.subCancelBtn}
                        >
                          <Text style={c.subCancelTxt}>{t("biz_cancel")}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      {/* ── Nombre del profesional + ❌ ── */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setStaffEmojiPicker({ itemId: item.id, slotIdx: i });
                          }}
                          style={{
                            width: 36, height: 36, borderRadius: 10,
                            borderWidth: 1.5, borderColor: color + "40",
                            backgroundColor: color + "08",
                            alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Text style={{ fontSize: 20 }}>
                            {(item.staffEmojis?.[i]) || getDefaultStaffEmoji(config.subId)}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          ref={input => {
                            const key = staffDraftKey(item, i);
                            if (input) professionalInputs.current.set(key, input); else professionalInputs.current.delete(key);
                          }}
                          testID={"professional-name-" + staffDraftKey(item, i)}
                          accessibilityLabel={t("biz_professional_name_ph")}
                          onLayout={() => {
                            const key = staffDraftKey(item, i);
                            if (pendingReveal.current === key && focusProfessional(key)) pendingReveal.current = null;
                          }}
                          style={[
                            c.staffNameBig,
                            isEmpty
                              ? { borderColor: GOLD + "60", backgroundColor: GOLD + "08", color: GOLD }
                              : { borderColor: "transparent", backgroundColor: "transparent" },
                          ]}
                          value={draftNames[staffDraftKey(item, i)] ?? nameVal}
                          onChangeText={v => setDraftNames(prev => ({ ...prev, [staffDraftKey(item, i)]: v }))}
                          onBlur={() => {
                            const draft = draftNamesRef.current[staffDraftKey(item, i)];
                            if (draft !== undefined) {
                              patchStaffName(item.id, i, draft, item.staffIds?.[i]);
                              setDraftNames(prev => { const n = { ...prev }; delete n[staffDraftKey(item, i)]; return n; });
                            }
                          }}
                          onSubmitEditing={() => {
                            const draft = draftNamesRef.current[staffDraftKey(item, i)];
                            if (draft !== undefined) {
                              patchStaffName(item.id, i, draft, item.staffIds?.[i]);
                              setDraftNames(prev => { const n = { ...prev }; delete n[staffDraftKey(item, i)]; return n; });
                            }
                          }}
                          placeholder={t("biz_professional_name_ph")}
                          placeholderTextColor={DIM}
                          returnKeyType="done"
                          autoCorrect={false}
                        />
                        <TouchableOpacity
                          onPress={askRemoveOrSubstitute}
                          hitSlop={10}
                          activeOpacity={0.7}
                          style={c.slotDeleteBtn}
                        >
                          <Feather name="x" size={14} color={DIM} />
                        </TouchableOpacity>
                      </View>

                      {/* ── Especialidades ── */}
                      {availableServices.length > 0 && (
                        <View style={{ paddingLeft: 32 }}>
                          <Text style={c.staffSvcLabel}>{t("biz_specialties")}</Text>
                          <View style={c.staffSvcList}>
                            {availableServices.map(svc => {
                              const checked = slotServices.includes(svc.name);
                              return (
                                <TouchableOpacity
                                  key={svc.name}
                                  activeOpacity={0.75}
                                  onPress={() => toggleStaffService(item.id, i, svc.name)}
                                  style={[c.staffSvcChip, checked && { borderColor: color, backgroundColor: color + "10" }]}
                                >
                                  <View style={[c.staffSvcCheck, checked && { backgroundColor: color, borderColor: color }]}>
                                    {checked && <Feather name="check" size={9} color="#fff" />}
                                  </View>
                                  <Text style={[c.staffSvcName, checked && { color, fontWeight: "700" }]} numberOfLines={1}>
                                    {trSector(svc.name, lang)}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {/* ── Horario personalizado del profesional ── */}
                      {!isEmpty && config.businessId && (
                        <View style={{ marginTop: 8 }}>
                          <ProfessionalScheduleSection
                            staffName={nameVal.trim()}
                            staffId={demo ? item.staffIds?.[i] : undefined}
                            businessId={config.businessId}
                            color={color}
                          />
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {isPeople && !addingNew && (
          <TouchableOpacity testID="add-professional" accessibilityRole="button"
            activeOpacity={0.8} disabled={addingProfessional}
            onPress={() => void addSlot(items.at(-1)?.id)}
            style={[c.addSlotBtn, { borderColor: color + "40", marginTop: 8, opacity: addingProfessional ? 0.5 : 1 }]}>
            <Feather name="user-plus" size={13} color={color} />
            <Text style={[c.addSlotTxt, { color }]}>{t("biz_add_professional")}</Text>
          </TouchableOpacity>
        )}

        {/* Para sectores de espacios: formulario para añadir un nuevo tipo de espacio */}
        {!isPeople && (addingNew ? (
          <View style={[c.itemRow, { flexDirection: "column", alignItems: "stretch", borderColor: BLUE + "40", backgroundColor: BLUE + "04", gap: 10 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {EMOJI_PALETTE.map(em => (
                  <TouchableOpacity
                    key={em}
                    activeOpacity={0.7}
                    onPress={() => setNewEmoji(em)}
                    style={[c.emojiChip, newEmoji === em && { borderColor: BLUE, backgroundColor: BLUE + "12" }]}
                  >
                    <Text style={{ fontSize: 18 }}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              style={c.itemInput}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder={t("biz_space_name_placeholder")}
              placeholderTextColor={DIM}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={commitNew}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity activeOpacity={0.8} onPress={commitNew} style={c.addBtn}>
                <Feather name="check" size={14} color={BLUE} />
                <Text style={c.addBtnTxt}>{t("biz_add")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { setAddingNew(false); setNewLabel(""); setNewEmoji("🪑"); }}
                style={{ paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center" }}
              >
                <Text style={{ fontSize: 13, color: DIM, fontWeight: "600" }}>{t("biz_cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setAddingNew(true); }}
            style={c.addBtn}
          >
            <Feather name="plus" size={14} color={BLUE} />
            <Text style={c.addBtnTxt}>{addLabel}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Picker de emoji por profesional ── */}
      <Modal
        visible={!!staffEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setStaffEmojiPicker(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}
          activeOpacity={1}
          onPress={() => setStaffEmojiPicker(null)}
        />
        <View style={{
          backgroundColor: "#fff",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingTop: 14, paddingBottom: 32, paddingHorizontal: 16,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#111", letterSpacing: 0.3 }}>
              {t("biz_staff_icon")}
            </Text>
            <TouchableOpacity onPress={() => setStaffEmojiPicker(null)} hitSlop={10}>
              <Feather name="x" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>
            {t("biz_staff_icon_hint")}
          </Text>
          <ScrollView horizontal={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {getStaffEmojiPalette(config.subId).map(em => {
                const isSelected = staffEmojiPicker
                  ? (items.find(it => it.id === staffEmojiPicker.itemId)?.staffEmojis?.[staffEmojiPicker.slotIdx] ?? getDefaultStaffEmoji(config.subId)) === em
                  : false;
                return (
                  <TouchableOpacity
                    key={em}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!staffEmojiPicker) return;
                      Haptics.selectionAsync().catch(() => {});
                      patchStaffEmoji(staffEmojiPicker.itemId, staffEmojiPicker.slotIdx, em);
                      setStaffEmojiPicker(null);
                    }}
                    style={[
                      c.emojiChip,
                      { width: 44, height: 44, borderRadius: 12 },
                      isSelected && { borderColor: color, backgroundColor: color + "15" },
                    ]}
                  >
                    <Text style={{ fontSize: 22 }}>{em}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 4 — SERVICIOS
// ═══════════════════════════════════════════════════════════════════════════════

function StepServicios({ currentSector, saveRef }: { currentSector: Sector | null; saveRef?: StepSaveRef }) {
  const { config, updateConfig, demo } = useBusinessConfig();
  const { t, lang } = useLanguage();
  const color = currentSector?.color ?? BLUE;

  type LocalSvc = SavedService & { id: string };
  const serializeServices = (svcs: LocalSvc[]) => svcs.filter(service => service.name.trim())
    .map(({ name, duration, price, capacity }) => ({ name, duration, price, capacity }));
  const saveServices = useCallback((services: SavedService[]) => demo
    ? demo.updateConfig({ services }) : updateConfig({ services }), [demo, updateConfig]);
  const { draft: localSvcs, setValue: setLocalSvcs, flush } = useConfigArrayDraft<LocalSvc, SavedService>(
    config.services, services => services.length > 0
      ? services.map((service, index) => ({ ...service, id: `svc_${index}_${service.name}`, capacity: service.capacity ?? 1 }))
      : [{ id: "svc_0", name: "", duration: 30, price: 0, capacity: 1 }], serializeServices, saveServices);
  useStepSave(saveRef, flush);

  // ── OCR import state ────────────────────────────────────────────────────────
  const [ocrVisible,   setOcrVisible]   = useState(false);
  const [ocrSourceUri, setOcrSourceUri] = useState<string | null>(null);
  const [ocrIsPdf,     setOcrIsPdf]     = useState(false);
  const [ocrIsUrl,     setOcrIsUrl]     = useState(false);

  const patchSvc = (id: string, patch: Partial<SavedService>) =>
    setLocalSvcs(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const removeSvc = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setLocalSvcs(prev => prev.filter(s => s.id !== id));
  };
  const addSvc = () => {
    Haptics.selectionAsync().catch(() => {});
    setLocalSvcs(prev => [...prev, { id: `svc_${Date.now()}`, name: "", duration: 30, price: 0, capacity: 1 }]);
  };

  // ── OCR: launch image picker ────────────────────────────────────────────────
  const launchImagePicker = async (useCamera: boolean) => {
    if (demo) { blockDemoExternal(lang); return; }
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Necesitamos acceso a la cámara para fotografiar tu tarifa.");
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Necesitamos acceso a la galería para seleccionar tu tarifa.");
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.85,
            allowsEditing: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.85,
            allowsEditing: false,
          });

      if (!result.canceled && result.assets[0]) {
        setOcrSourceUri(result.assets[0].uri);
        setOcrIsPdf(false);
        setOcrVisible(true);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir la cámara. Inténtalo de nuevo.");
    }
  };

  const handleImageImport = () => {
    if (demo) { blockDemoExternal(lang); return; }
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      "Importar tarifa",
      "¿Cómo quieres obtener la imagen de tu tarifa?",
      [
        { text: "📷  Cámara",  onPress: () => launchImagePicker(true)  },
        { text: "🖼️  Galería", onPress: () => launchImagePicker(false) },
        { text: t("biz_cancel"), style: "cancel" },
      ]
    );
  };

  // ── OCR: launch PDF picker ──────────────────────────────────────────────────
  const handlePdfImport = async () => {
    if (demo) { blockDemoExternal(lang); return; }
    Haptics.selectionAsync().catch(() => {});
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setOcrIsUrl(false);
        setOcrSourceUri(result.assets[0].uri);
        setOcrIsPdf(true);
        setOcrVisible(true);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir el selector de archivos.");
    }
  };

  // ── OCR: launch URL import ──────────────────────────────────────────────────
  const handleUrlImport = () => {
    if (demo) { blockDemoExternal(lang); return; }
    Haptics.selectionAsync().catch(() => {});
    setOcrSourceUri(null);
    setOcrIsPdf(false);
    setOcrIsUrl(true);
    setOcrVisible(true);
  };

  // ── OCR: import confirmed services ──────────────────────────────────────────
  const handleOcrImport = (newServices: SavedService[]) => {
    const existing = localSvcs.filter(s => s.name.trim());
    const merged: LocalSvc[] = [
      ...existing,
      ...newServices.map((s, i) => ({
        ...s,
        id:       `ocr_${Date.now()}_${i}`,
        capacity: s.capacity ?? 1,
      })),
    ];
    setLocalSvcs(merged);
    setOcrIsUrl(false);
    setOcrVisible(false);
  };

  return (
    <View>
      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{t("biz_services_offered")}</Text>

        {localSvcs.map((svc, idx) => (
          <View key={svc.id} style={c.svcRow}>
            <TextInput
              style={c.svcNameInput}
              value={trSector(svc.name, lang)}
              onChangeText={v => patchSvc(svc.id, { name: v })}
              onBlur={() => { void flush().catch(() => {}); }}
              placeholder={idx === 0 ? t("biz_service_placeholder_first") : t("biz_service_placeholder")}
              placeholderTextColor={DIM}
              returnKeyType="done"
            />
            <View style={c.svcMeta}>
              <View style={c.numBox}>
                <TextInput
                  style={c.numInput}
                  value={String(svc.duration)}
                  onChangeText={v => patchSvc(svc.id, { duration: parseInt(v) || 0 })}
                  onBlur={() => { void flush().catch(() => {}); }}
                  selectTextOnFocus
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <Text style={c.numUnit}>min</Text>
              </View>
              <View style={c.numBox}>
                <TextInput
                  style={c.numInput}
                  value={svc.price ? String(svc.price) : ""}
                  onChangeText={v => patchSvc(svc.id, { price: parseFloat(v) || 0 })}
                  onBlur={() => { void flush().catch(() => {}); }}
                  selectTextOnFocus
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="0"
                  placeholderTextColor={DIM}
                />
                <Text style={c.numUnit}>€</Text>
              </View>
              <View style={c.numBox}>
                <TextInput
                  style={c.numInput}
                  value={String(svc.capacity ?? 1)}
                  onChangeText={v => patchSvc(svc.id, { capacity: parseInt(v) || 1 })}
                  onBlur={() => { void flush().catch(() => {}); }}
                  selectTextOnFocus
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <Text style={c.numUnit}>cap</Text>
              </View>
              {localSvcs.length > 1 && (
                <TouchableOpacity onPress={() => removeSvc(svc.id)} hitSlop={8} activeOpacity={0.7}>
                  <Feather name="x" size={16} color={DIM} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={addSvc} activeOpacity={0.8} style={c.addBtn}>
          <Feather name="plus" size={14} color={BLUE} />
          <Text style={c.addBtnTxt}>{t("biz_add_service_btn")}</Text>
        </TouchableOpacity>
      </View>

      {/* ── OCR Import section ───────────────────────────────────────────────── */}
      <View style={c.importCard}>
        {/* Divider */}
        <View style={c.importDividerRow}>
          <View style={c.importDividerLine} />
          <Text style={c.importDividerTxt}>{t("biz_import_from_price_list")}</Text>
          <View style={c.importDividerLine} />
        </View>

        {/* Import buttons */}
        <View style={c.importBtnsRow}>
          {/* Image */}
          <TouchableOpacity
            onPress={handleImageImport}
            activeOpacity={0.8}
            style={c.importBtn}
          >
            <View style={[c.importBtnIconWrap, { backgroundColor: BLUE + "12" }]}>
              <Feather name="camera" size={20} color={BLUE} />
            </View>
            <Text style={c.importBtnLabel}>{t("biz_import_image_label")}</Text>
            <Text style={c.importBtnSub}>{t("biz_import_image_sub")}</Text>
          </TouchableOpacity>

          <View style={c.importBtnSep} />

          {/* PDF */}
          <TouchableOpacity
            onPress={handlePdfImport}
            activeOpacity={0.8}
            style={c.importBtn}
          >
            <View style={[c.importBtnIconWrap, { backgroundColor: PURPLE + "12" }]}>
              <Feather name="file-text" size={20} color={PURPLE} />
            </View>
            <Text style={c.importBtnLabel}>{t("biz_import_pdf_label")}</Text>
            <Text style={c.importBtnSub}>{t("biz_import_pdf_sub")}</Text>
          </TouchableOpacity>
        </View>

        {/* URL import — ancho completo */}
        <TouchableOpacity
          onPress={handleUrlImport}
          activeOpacity={0.8}
          style={c.importUrlBtn}
        >
          <View style={[c.importBtnIconWrap, { backgroundColor: GREEN + "12", width: 36, height: 36, borderRadius: 10 }]}>
            <Feather name="globe" size={17} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={c.importBtnLabel}>{t("biz_import_link_label")}</Text>
            <Text style={c.importBtnSub}>{t("biz_import_link_sub")}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={GREEN} />
        </TouchableOpacity>

        {/* Helper text */}
        <View style={c.importHelperRow}>
          <Feather name="zap" size={11} color={GOLD} />
          <Text style={c.importHelperTxt}>
            GO detectará nombres, precios y duraciones automáticamente. Podrás revisar y corregir antes de guardar.
          </Text>
        </View>
      </View>

      {/* OCR Review Sheet */}
      {!demo && <GoOcrImportSheet
        visible={ocrVisible}
        sourceUri={ocrSourceUri}
        isPdf={ocrIsPdf}
        isUrl={ocrIsUrl}
        onClose={() => { setOcrVisible(false); setOcrIsUrl(false); }}
        onImport={handleOcrImport}
      />}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 5 — RESERVAS
// ═══════════════════════════════════════════════════════════════════════════════

function StepReservas() {
  const { t } = useLanguage();
  const { config, updateConfig } = useBusinessConfig();
  const PAYMENT_OPTS = buildPaymentOptsCfg(t);
  const CANCEL_OPTS  = buildCancelOptsCfg(t);
  const sinPago = config.paymentPolicy === 0;

  return (
    <View>
      <PolicySection
        title={t("biz_booking_type")}
        opts={PAYMENT_OPTS}
        value={config.paymentPolicy}
        onChange={v => updateConfig({ paymentPolicy: v })}
        color={GOLD}
      />

      {sinPago ? (
        <View style={[c.sectionCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
          <View style={[c.policyIcon, { backgroundColor: GREEN + "15" }]}>
            <Feather name="check-circle" size={18} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[c.policyLabel, { color: GREEN }]}>{t("biz_free_cancellation")}</Text>
            <Text style={c.policySub}>{t("biz_no_prepay_no_refund")}</Text>
          </View>
        </View>
      ) : (
        <PolicySection
          title={t("biz_cancellations")}
          opts={CANCEL_OPTS}
          value={config.cancelPolicy}
          onChange={v => updateConfig({ cancelPolicy: v })}
          color={GREEN}
        />
      )}

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 7 — PLANO (abre módulo real PlanoEmpresaScreen)
// ═══════════════════════════════════════════════════════════════════════════════

function StepPlano({
  currentSector,
  onOpenEditor,
}: {
  currentSector: Sector | null;
  onOpenEditor:  () => void;
}) {
  const { t } = useLanguage();
  const color = currentSector?.color ?? PURPLE;

  return (
    <View style={{ paddingTop: 4 }}>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onOpenEditor(); }}
        style={[c.bigBtn, { backgroundColor: color }]}
      >
        <Feather name="map" size={20} color="#fff" />
        <Text style={c.bigBtnTxt}>{t("biz_layout_btn")}</Text>
      </TouchableOpacity>

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 7 — PUBLICAR
// ═══════════════════════════════════════════════════════════════════════════════

function StepPublicar({
  onOpenVerificacion,
  onGoToStep,
  onGoToActivity,
}: {
  onOpenVerificacion?: () => void;
  onGoToStep?:         (step: number) => void;
  onGoToActivity?:     () => void;
}) {
  const { config, demo } = useBusinessConfig();
  const { t, lang } = useLanguage();
  const [copied, setCopied] = useState(false);

  const currentSector = SECTORS.find(s => s.id === config.sectorId);
  const currentSub    = currentSector?.subs.find(s => s.id === config.subId);

  const handleShare = async () => {
    if (demo) { blockDemoExternal(lang); return; }
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({ message: `Reserva en mi negocio a través de GO:\n${MOCK_LINK}`, url: MOCK_LINK, title: "Reservar en GO" });
    } catch {}
  };
  const handleCopy = async () => {
    if (demo) { blockDemoExternal(lang); return; }
    try {
      await Clipboard.setStringAsync(MOCK_LINK);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  // step: número del paso al que navega al pulsar (-1 = actividad, null = no navega)
  const summaryItems: {
    icon:    keyof typeof Feather.glyphMap;
    label:   string;
    value:   string;
    ok:      boolean;
    step:    number | "activity" | null;
  }[] = [
    {
      icon:  "briefcase",
      label: t("biz_cfg_step_name"),
      value: config.businessName?.trim() || t("no_name"),
      ok:    !!(config.businessName?.trim()),
      step:  0,
    },
    {
      icon:  "tag",
      label: t("biz_step_actividad_label"),
      value: currentSector
        ? `${currentSector.emoji} ${getSectorLabel(currentSector, lang)}${currentSub ? ` · ${getSubName(currentSub, lang)}` : ""}`
        : t("biz_no_sector"),
      ok:    !!config.sectorId,
      step:  "activity",
    },
    {
      icon:  "clock",
      label: t("biz_cfg_step_schedule"),
      value: `${config.activeDays.length} ${config.activeDays.length !== 1 ? t("biz_days") : t("biz_day")} · ${config.openFrom}–${config.openTo}`,
      ok:    config.activeDays.length > 0,
      step:  2,
    },
    {
      icon:  "list",
      label: t("biz_cfg_step_services"),
      value: config.services.length > 0
        ? config.services.slice(0, 3).map(s => trSector(s.name, lang)).join(", ") + (config.services.length > 3 ? ` +${config.services.length - 3}` : "")
        : t("biz_no_services"),
      ok:    config.services.length > 0,
      step:  3,
    },
    {
      icon:  "layers",
      label: t("biz_cfg_step_staff"),
      value: (() => {
        const n = config.plantillaItems.reduce((s, it) => s + it.count, 0);
        return config.plantillaItems.length > 0
          ? `${n} ${n !== 1 ? t("biz_stations") : t("biz_station")}`
          : t("biz_no_spaces");
      })(),
      ok:    config.plantillaItems.length > 0,
      step:  4,
    },
    ...(PEOPLE_SECTORS.has(SUB_TO_SECTOR[config.subId ?? ""] ?? "") ? [{
      icon:  "users" as const,
      label: t("biz_staff_label"),
      value: (() => {
        const names = config.plantillaItems.flatMap(it => it.staffNames?.filter(n => n.trim()) ?? []);
        if (names.length > 0) {
          return names.length <= 3
            ? names.join(", ")
            : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
        }
        const total = config.plantillaItems.reduce((s, it) => s + it.count, 0);
        return total > 0 ? `${total} ${total !== 1 ? t("biz_professionals_pl") : t("biz_professional")}` : t("biz_no_professionals");
      })(),
      ok:    config.plantillaItems.flatMap(it => it.staffNames?.filter(n => n.trim()) ?? []).length > 0,
      step:  4 as number | "activity" | null,
    }] : []),
    {
      icon:  "shield",
      label: t("biz_cfg_step_bookings"),
      value: ([t("biz_free_booking"), t("biz_prepay")] as const)[config.paymentPolicy ?? 0] ?? t("biz_not_configured"),
      ok:    true,
      step:  5,
    },
    {
      icon:  "map",
      label: t("biz_cfg_step_plan"),
      value: t("biz_view_edit_layout"),
      ok:    true,
      step:  6,
    },
  ];

  const handleSummaryTap = (step: number | "activity" | null) => {
    Haptics.selectionAsync().catch(() => {});
    if (step === "activity") { onGoToActivity?.(); }
    else if (typeof step === "number") { onGoToStep?.(step); }
  };

  return (
    <View>
      {/* Summary — cada fila es navegable */}
      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{t("biz_summary_review_title")}</Text>
        <Text style={{ fontSize: 11, color: DIM, marginBottom: 12 }}>
          {t("biz_summary_review_hint")}
        </Text>
        {summaryItems.map(item => (
          <TouchableOpacity
            key={item.label}
            activeOpacity={item.step !== null ? 0.75 : 1}
            onPress={() => handleSummaryTap(item.step)}
            style={[
              c.summaryRow,
              { borderColor: item.ok ? GREEN + "30" : RED + "25", backgroundColor: item.ok ? GREEN + "04" : RED + "04" },
            ]}
          >
            <View style={[c.policyIcon, { backgroundColor: (item.ok ? GREEN : RED) + "14", width: 36, height: 36, borderRadius: 10 }]}>
              <Feather name={item.icon} size={15} color={item.ok ? GREEN : RED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[c.sectionLabel, { color: GRAY, marginBottom: 1 }]}>{item.label}</Text>
              <Text style={[c.policyLabel, { fontSize: 13 }]} numberOfLines={1}>{item.value}</Text>
            </View>
            {item.step !== null
              ? <Feather name="chevron-right" size={16} color={item.ok ? GREEN + "99" : RED + "99"} />
              : <Feather name={item.ok ? "check-circle" : "alert-circle"} size={18} color={item.ok ? GREEN : RED} />
            }
          </TouchableOpacity>
        ))}
      </View>

      {/* QR GO */}
      <View style={[c.sectionCard, { alignItems: "center", paddingVertical: 24 }]}>
        <View style={c.qrWrapper}>
          <QRCode value={demo ? `GO DEMO local · ${config.businessName || "Mi negocio"}` : MOCK_LINK} size={150} backgroundColor="#FFFFFF" color="#111827" />
        </View>
        <Text style={c.qrLink}>{demo ? (lang === "en" ? "Local test · no public booking link" : "Prueba local · sin enlace público de reservas") : MOCK_LINK}</Text>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={handleShare} style={[c.bigBtn, { backgroundColor: GOLD }]}>
        <Feather name="share-2" size={18} color="#fff" />
        <Text style={c.bigBtnTxt}>{t("biz_share_whatsapp")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleCopy}
        style={[c.bigBtn, { backgroundColor: copied ? GREEN : CARD, borderWidth: 1, borderColor: copied ? GREEN : BORDER }]}
      >
        <Feather name={copied ? "check" : "copy"} size={18} color={copied ? "#fff" : BLUE} />
        <Text style={[c.bigBtnTxt, { color: copied ? "#fff" : BLUE }]}>
          {copied ? t("biz_link_copied") : t("biz_copy_link")}
        </Text>
      </TouchableOpacity>

      {!demo && onOpenVerificacion && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpenVerificacion(); }}
          style={[c.sectionCard, { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }]}
        >
          <View style={[c.policyIcon, { backgroundColor: GOLD + "18" }]}>
            <Feather name="alert-circle" size={18} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[c.policyLabel, { color: GOLD }]}>{t("biz_verify_business_btn")}</Text>
            <Text style={c.policySub}>{t("biz_verify_business_hint")}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={GOLD + "99"} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Shared: PolicySection ────────────────────────────────────────────────────

function PolicySection({
  title, opts, value, onChange, color,
}: {
  title:  string;
  opts:   readonly { label: string; sub: string; icon: keyof typeof Feather.glyphMap }[];
  value:  number;
  onChange: (i: number) => void;
  color:  string;
}) {
  return (
    <View style={c.sectionCard}>
      <Text style={c.sectionLabel}>{title}</Text>
      <View style={{ gap: 8 }}>
        {opts.map((o, i) => {
          const active = value === i;
          return (
            <TouchableOpacity
              key={o.label}
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(i); }}
              style={[c.policyCard, active && { borderColor: color, backgroundColor: color + "08" }]}
            >
              <View style={[c.policyIcon, { backgroundColor: color + (active ? "20" : "10") }]}>
                <Feather name={o.icon} size={18} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[c.policyLabel, active && { color, fontWeight: "700" }]}>{o.label}</Text>
                <Text style={c.policySub}>{o.sub}</Text>
              </View>
              {active && <Feather name="check-circle" size={18} color={color} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get("window");

const c = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },

  header:       {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  backBtn:      { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle:  { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT },
  headerSub:    { fontSize: 11, fontWeight: "600", marginTop: 1 },

  stepsBar:     {
    flexDirection: "row",
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  stepPill:     { width: 92, minHeight: 58, alignItems: "center", gap: 5, paddingHorizontal: 4 },
  stepDot:      { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepDotNum:   { fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#fff" },
  stepPillLabel:{ fontSize: 10, lineHeight: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.2, textAlign: "center" },

  contentWrap:  { flex: 1 },
  stepHeader:   {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    padding: 14,
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 4,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  stepIconCircle:{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepTitle:    { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT, marginBottom: 2 },
  stepSubtitle: { fontSize: 12, color: GRAY, lineHeight: 16 },

  content:      { paddingHorizontal: 16, paddingTop: 12 },

  sectionCard:  {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: GRAY, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  sectionSub:   { fontSize: 12, color: DIM, lineHeight: 16, marginBottom: 8 },

  nameInput:    {
    backgroundColor: "#F3F4F6", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: TEXT, fontWeight: "500",
    marginTop: 4,
  },
  charCount:    { fontSize: 11, color: DIM, textAlign: "right", marginTop: 4 },

  // GPS button (Ubicación)
  gpsBtn:       {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: GREEN + "40",
    backgroundColor: GREEN + "0A", marginBottom: 12,
  },
  gpsBtnTxt:    { fontSize: 14, fontWeight: "600", color: GREEN },

  // Day picker pills (Horario)
  dayPill2:     {
    alignItems: "center", paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: "#F3F4F6",
    borderWidth: 1, borderColor: BORDER, gap: 4,
  },
  dayPillTxt2:  { color: GRAY, fontSize: 13, fontWeight: "500" },
  dayDot:       { width: 6, height: 6, borderRadius: 3 },
  dayDotOn:     { backgroundColor: "#22C55E" },
  dayDotOff:    { backgroundColor: "#D1D5DB" },

  // Copy schedule button
  copyBtn:      {
    flexDirection: "row", alignItems: "center", gap: 7,
    marginTop: 14, alignSelf: "flex-start",
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
    borderColor: PURPLE + "40", backgroundColor: PURPLE + "08",
  },
  copyBtnTxt:   { fontSize: 13, fontWeight: "500" },

  // Shift labels and add-shift button
  shiftLabel:   { fontSize: 12, fontWeight: "700", color: DIM, marginBottom: 2, letterSpacing: 0.5, textTransform: "uppercase" },
  addShiftBtn:  {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, alignSelf: "flex-start",
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 9, borderWidth: 1,
    borderColor: PURPLE + "35", backgroundColor: PURPLE + "07",
  },
  addShiftTxt:  { fontSize: 13, fontWeight: "500" },

  // Professional per-staff schedule section
  proSchedWrapper:    {
    borderWidth: 1, borderRadius: 10,
    overflow: "hidden",
  },
  proSchedHeader:     {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 7, paddingHorizontal: 10,
    backgroundColor: "transparent",
  },
  proSchedHeaderTxt:  { fontSize: 12, fontWeight: "600", flex: 1 },
  proSchedModeChip:   {
    flex: 1,
    paddingVertical: 5, paddingHorizontal: 8,
    borderRadius: 8, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
  },
  proSchedModeChipTxt: { fontSize: 12, color: GRAY },
  proSchedDayPill:    {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1.5,
    borderColor: BORDER, backgroundColor: CARD,
    alignItems: "center", justifyContent: "center",
  },
  proSchedDayTxt:     { fontSize: 12, fontWeight: "600", color: GRAY },

  chipRow:      { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  timeRow:      { flexDirection: "row", gap: 6, marginTop: 4 },

  itemRow:      {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },
  itemInput:    { fontSize: 14, color: TEXT, fontWeight: "500", paddingVertical: 2 },
  counter:      { flexDirection: "row", alignItems: "center", gap: 4 },
  counterBtn:   { width: 26, height: 26, borderRadius: 8, backgroundColor: BLUE + "12", alignItems: "center", justifyContent: "center" },
  counterNum:   { fontSize: 13, fontWeight: "700", color: TEXT, minWidth: 18, textAlign: "center" },
  deleteBtn:    { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  emojiChip:    { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER, alignItems: "center", justifyContent: "center" },

  addBtn:       { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4, alignSelf: "flex-start" },
  addBtnTxt:    { fontSize: 13, fontWeight: "700", color: BLUE },
  emptyRow:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  emptyTxt:     { fontSize: 13, color: DIM, flex: 1 },

  countBadge:   {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  countBadgeTxt:{ fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "800" },

  staffSlot:    {
    marginTop: 6, marginBottom: 4,
    borderRadius: 14, borderWidth: 1.5,
    padding: 12, gap: 10,
  },

  slotDeleteBtn:{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },

  subConfirmBtn:{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10 },
  subConfirmTxt:{ fontSize: 13, fontWeight: "700", color: "#fff" },
  subCancelBtn: { paddingVertical: 9, paddingHorizontal: 12, justifyContent: "center" },
  subCancelTxt: { fontSize: 13, fontWeight: "600", color: DIM },

  addSlotBtn:   {
    flexDirection: "row", alignItems: "center", gap: 7,
    marginTop: 6, marginBottom: 10,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1.5,
    alignSelf: "flex-start",
  },
  addSlotTxt:   { fontSize: 13, fontWeight: "700" },
  staffNameBig: {
    flex: 1, fontSize: 13, fontWeight: "700", color: "#111",
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
  },
  staffNameLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", color: GRAY,
    letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 4,
  },
  staffNameInput: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontWeight: "600", color: TEXT,
  },
  staffSvcLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", color: DIM,
    letterSpacing: 0.7, textTransform: "uppercase",
    marginBottom: 6, marginTop: 2,
  },
  staffSvcList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  staffSvcChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 5, paddingHorizontal: 9,
    borderRadius: 20, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: "#F3F4F6",
  },
  staffSvcCheck:{
    width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: DIM,
    alignItems: "center", justifyContent: "center", backgroundColor: "transparent",
  },
  staffSvcName: { fontSize: 12, fontWeight: "600", color: GRAY, maxWidth: 120 },

  svcRow:       { marginBottom: 10 },
  svcNameInput: {
    backgroundColor: "#F3F4F6", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: TEXT, fontWeight: "500", marginBottom: 6,
  },
  svcMeta:      { flexDirection: "row", alignItems: "center", gap: 6 },
  numBox:       {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#F3F4F6", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 8,
  },
  numInput:     { flex: 1, fontSize: 13, fontWeight: "600", color: TEXT, textAlign: "center" },
  numUnit:      { fontSize: 11, color: DIM, fontWeight: "600" },

  policyCard:   { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, padding: 12 },
  policyIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  policyLabel:  { fontSize: 14, fontWeight: "600", color: TEXT },
  policySub:    { fontSize: 12, color: DIM, marginTop: 1 },

  summaryRow:   {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },

  qrWrapper:    { padding: 16, backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  qrLink:       { fontSize: 12, color: DIM, fontWeight: "500", textAlign: "center", marginBottom: 8 },

  bigBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, paddingHorizontal: 24, borderRadius: 16, marginBottom: 10 },
  bigBtnTxt:    { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#fff" },

  infoRow:      { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4, marginBottom: 12 },
  infoTxt:      { fontSize: 11, color: DIM, flex: 1, lineHeight: 16 },

  // ── OCR Import card (Paso 5) ──────────────────────────────────────────────
  importCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  importDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  importDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BORDER,
  },
  importDividerTxt: {
    fontSize: 11,
    color: DIM,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  importBtnsRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    marginBottom: 12,
  },
  importBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 6,
    backgroundColor: "#FAFAFA",
  },
  importBtnSep: {
    width: 1,
    backgroundColor: BORDER,
  },
  importBtnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  importBtnLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    textAlign: "center",
  },
  importBtnSub: {
    fontSize: 11,
    color: DIM,
    textAlign: "center",
    lineHeight: 15,
  },
  importUrlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GREEN + "30",
    backgroundColor: GREEN + "06",
    marginBottom: 12,
  },
  importHelperRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
  },
  importHelperTxt: {
    fontSize: 11,
    color: DIM,
    flex: 1,
    lineHeight: 16,
  },

  footer:       {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER,
  },
  backFooterBtn:{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10 },
  backFooterTxt:{ fontSize: 14, fontWeight: "600", color: GRAY },
  nextBtn:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 14 },
  nextBtnCompact: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 20 },
  nextBtnTxtCompact: { fontSize: 14 },
  nextBtnTxt:   { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#fff" },
});
