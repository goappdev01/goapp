/**
 * GoOcrImportSheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal unificado para importar servicios desde imagen, PDF o enlace web.
 *
 * Fases:
 *   url_input  → (solo isUrl=true) El usuario pega/escribe la URL
 *   processing → Animación de escaneo mientras se analiza la fuente
 *   review     → Lista editable con checkboxes para confirmar la importación
 *   error      → Mensaje de error + botón reintentar
 *
 * TODO OCR real (V2):
 *   · Imagen/PDF: enviar imageBase64 + mimeType al endpoint y procesar con OpenAI Vision
 *   · URL: hacer scraping real de la página y extraer servicios con LLM
 *   En ambos casos el servidor ya tiene la firma correcta — sólo hay que
 *   reemplazar el bloque mock en artifacts/api-server/src/routes/ocr.ts
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SavedService } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";

// ── Tokens ────────────────────────────────────────────────────────────────────

const BG     = "#F5F3EF";
const CARD   = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.07)";
const TEXT   = "#111827";
const GRAY   = "#6B7280";
const DIM    = "#9CA3AF";
const BLUE   = "#4A80BD";
const PURPLE = "#7C69BE";
const GREEN  = "#22C55E";
const TEAL   = "#3D9A84";
const RED    = "#EF4444";

// ── API base ──────────────────────────────────────────────────────────────────

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase = "url_input" | "processing" | "review" | "error";

type ExtractedSvc = SavedService & {
  id:          string;
  selected:    boolean;
  description: string;
};

export type GoOcrImportSheetProps = {
  visible:   boolean;
  sourceUri: string | null;
  isPdf:     boolean;
  isUrl?:    boolean;
  onClose:   () => void;
  onImport:  (services: SavedService[]) => void;
};

// ── Hint texts ────────────────────────────────────────────────────────────────

const IMG_HINTS    = ["Analizando imagen…",   "Detectando servicios…", "Extrayendo precios…",    "Casi listo…"];
const PDF_HINTS    = ["Leyendo documento…",   "Detectando servicios…", "Extrayendo tarifas…",    "Casi listo…"];
const URL_HINTS    = ["Leyendo la página…",   "Detectando servicios…", "Extrayendo precios…",    "Casi listo…"];
const IMG_HINTS_EN = ["Analysing image…",     "Detecting services…",   "Extracting prices…",     "Almost done…"];
const PDF_HINTS_EN = ["Reading document…",    "Detecting services…",   "Extracting rates…",      "Almost done…"];
const URL_HINTS_EN = ["Reading the page…",    "Detecting services…",   "Extracting prices…",     "Almost done…"];

// ── URL example hints ─────────────────────────────────────────────────────────

const URL_EXAMPLES = [
  "tu-restaurante.com/carta",
  "mi-clinica.es/servicios",
  "peluqueria.com/tarifas",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function GoOcrImportSheet({
  visible,
  sourceUri,
  isPdf,
  isUrl = false,
  onClose,
  onImport,
}: GoOcrImportSheetProps) {
  const insets              = useSafeAreaInsets();
  const { height: SCREEN_H } = Dimensions.get("window");
  const { lang } = useLanguage();

  const [phase,    setPhase]    = useState<Phase>("processing");
  const [svcs,     setSvcs]     = useState<ExtractedSvc[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [hintIdx,  setHintIdx]  = useState(0);
  const [url,      setUrl]      = useState("");

  // Keep latest values for async callbacks
  const isPdfRef  = useRef(isPdf);
  const isUrlRef  = useRef(isUrl);
  const urlRef    = useRef(url);
  isPdfRef.current  = isPdf;
  isUrlRef.current  = isUrl;
  urlRef.current    = url;

  // Animations
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const scanAnim  = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // ── Visibility ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      if (isUrl) {
        setPhase("url_input");
        setUrl("");
      } else {
        setPhase("processing");
        setSvcs([]);
        setErrorMsg("");
        setHintIdx(0);
        doExtract();
      }
      Animated.timing(slideAnim, {
        toValue: 0, duration: 340,
        useNativeDriver: true, easing: Easing.out(Easing.cubic),
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H, duration: 240,
        useNativeDriver: true, easing: Easing.in(Easing.cubic),
      }).start();
    }
  }, [visible]);

  // ── Scan animation ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "processing") return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();

    const hints = lang === "en"
      ? (isUrlRef.current ? URL_HINTS_EN : isPdfRef.current ? PDF_HINTS_EN : IMG_HINTS_EN)
      : (isUrlRef.current ? URL_HINTS    : isPdfRef.current ? PDF_HINTS    : IMG_HINTS);
    const hintInt = setInterval(() => setHintIdx(i => (i + 1) % hints.length), 1600);

    return () => { loop.stop(); clearInterval(hintInt); };
  }, [phase]);

  // ── Fade in review ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === "review") {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.ease) }).start();
    }
  }, [phase]);

  // ── API call ──────────────────────────────────────────────────────────────

  const doExtract = async (extractUrl?: string) => {
    setPhase("processing");
    setSvcs([]);
    setErrorMsg("");
    setHintIdx(0);

    try {
      // TODO V2: Cuando OCR real esté disponible:
      //   · Imagen/PDF → también enviar imageBase64 + mimeType en el body
      //   · URL → el servidor hará scraping real de la página
      const body = extractUrl
        ? { source: "url",   url: extractUrl }
        : { source: isPdfRef.current ? "pdf" : "image" };

      const response = await fetch(`${API_BASE}/ocr/extract-services`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error ?? "Error de extracción");

      const extracted: ExtractedSvc[] = (data.services as any[]).map((sv, i) => ({
        id:          `ex_${Date.now()}_${i}`,
        name:        String(sv.name        ?? ""),
        price:       Number(sv.price       ?? 0),
        duration:    Number(sv.duration    ?? 30),
        capacity:    Number(sv.capacity    ?? 1),
        description: String(sv.description ?? ""),
        selected:    true,
      }));

      setSvcs(extracted);
      setPhase("review");
    } catch (err: any) {
      setErrorMsg(
        err?.message
          ? `${err.message}. Comprueba tu conexión o inténtalo de nuevo.`
          : "No se pudo extraer la información. Inténtalo de nuevo."
      );
      setPhase("error");
    }
  };

  // ── URL handlers ──────────────────────────────────────────────────────────

  const handleAnalyzeUrl = () => {
    const trimmed = urlRef.current.trim();
    if (!trimmed) return;

    const withProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

    try { new URL(withProtocol); } catch {
      Alert.alert(
        lang === "en" ? "Invalid URL" : "URL inválida",
        lang === "en"
          ? "Please enter a valid link.\nExample: https://my-business.com/services"
          : "Por favor, introduce un enlace válido.\nEjemplo: https://mi-negocio.com/servicios"
      );
      return;
    }

    Keyboard.dismiss();
    Haptics.selectionAsync().catch(() => {});
    doExtract(withProtocol);
  };

  // ── Service actions ───────────────────────────────────────────────────────

  const toggleSvc = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSvcs(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };
  const patchSvc = (id: string, patch: Partial<ExtractedSvc>) =>
    setSvcs(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSvc = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSvcs(prev => prev.filter(s => s.id !== id));
  };

  const allSelected    = svcs.length > 0 && svcs.every(s => s.selected);
  const selectedCount  = svcs.filter(s => s.selected).length;

  const toggleAll = () => {
    Haptics.selectionAsync().catch(() => {});
    setSvcs(prev => prev.map(s => ({ ...s, selected: !allSelected })));
  };

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const toImport: SavedService[] = svcs
      .filter(s => s.selected && s.name.trim())
      .map(({ name, price, duration, capacity }) => ({ name, duration: duration || 30, price, capacity: capacity || 1 }));
    onImport(toImport);
  };

  // ── Header metadata ───────────────────────────────────────────────────────

  const sourceIcon: any  = isUrl ? "globe"     : isPdf ? "file-text" : "camera";
  const sourceColor      = isUrl ? TEAL         : isPdf ? PURPLE      : BLUE;
  const sourceLabelShort = isUrl
    ? (lang === "en" ? "Web link"   : "Enlace web")
    : isPdf
      ? (lang === "en" ? "From PDF"    : "Desde PDF")
      : (lang === "en" ? "From image"  : "Desde imagen");
  const headerTitle =
    phase === "url_input"  ? (lang === "en" ? "Import from link"   : "Importar desde enlace") :
    phase === "processing" ? (lang === "en" ? "Importing rate card" : "Importando tarifa")     :
    phase === "review"     ? (lang === "en" ? "Review and confirm"  : "Revisar y confirmar")   :
                             (lang === "en" ? "Import error"        : "Error de importación");

  // ── Render: URL input ─────────────────────────────────────────────────────

  const renderUrlInput = () => (
    <ScrollView
      style={s.urlScroll}
      contentContainerStyle={s.urlScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Illustration */}
      <View style={s.urlIllus}>
        <View style={s.urlGlobeRing}>
          <Feather name="globe" size={38} color={TEAL} />
        </View>
      </View>

      <Text style={s.urlTitle}>{lang === "en" ? "Paste your rate card link" : "Pega el enlace de tu tarifa"}</Text>
      <Text style={s.urlSubtitle}>
        {lang === "en"
          ? "Online menu, digital catalogue, services page, price list or booking page."
          : "Carta online, menú digital, web de servicios, catálogo de precios o página de reservas."}
      </Text>

      {/* URL input field */}
      <View style={s.urlFieldRow}>
        <Feather name="link-2" size={16} color={DIM} />
        <TextInput
          style={s.urlField}
          value={url}
          onChangeText={v => { setUrl(v); urlRef.current = v; }}
          placeholder="https://mi-negocio.com/servicios"
          placeholderTextColor={DIM}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleAnalyzeUrl}
          autoFocus={false}
        />
        {url.length > 0 && (
          <TouchableOpacity
            onPress={() => { setUrl(""); urlRef.current = ""; }}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Feather name="x" size={15} color={DIM} />
          </TouchableOpacity>
        )}
      </View>

      {/* Example chips */}
      <Text style={s.urlExamplesLabel}>{lang === "en" ? "Examples" : "Ejemplos"}</Text>
      <View style={s.urlExamplesRow}>
        {URL_EXAMPLES.map(ex => (
          <TouchableOpacity
            key={ex}
            onPress={() => { const v = `https://${ex}`; setUrl(v); urlRef.current = v; }}
            style={s.urlExampleChip}
            activeOpacity={0.7}
          >
            <Feather name="corner-right-down" size={10} color={TEAL} />
            <Text style={s.urlExampleTxt}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Analyze button */}
      <TouchableOpacity
        onPress={handleAnalyzeUrl}
        disabled={!url.trim()}
        activeOpacity={0.85}
        style={[s.analyzeBtn, !url.trim() && s.analyzeBtnDisabled]}
      >
        <Feather name="search" size={15} color="#fff" />
        <Text style={s.analyzeBtnTxt}>{lang === "en" ? "Analyse link" : "Analizar enlace"}</Text>
      </TouchableOpacity>

      {/* Disclaimer */}
      <View style={s.urlDisclaimer}>
        <Feather name="shield" size={12} color={DIM} />
        <Text style={s.urlDisclaimerTxt}>
          {lang === "en"
            ? "GO will read the page and try to detect services automatically. You can always review and correct before saving."
            : "GO leerá la página e intentará detectar servicios automáticamente. Siempre podrás revisar y corregir antes de guardar."}
        </Text>
      </View>
    </ScrollView>
  );

  // ── Render: Processing ────────────────────────────────────────────────────

  const DOC_H  = 130;
  const beamTY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, DOC_H - 3] });
  const hints = lang === "en"
    ? (isUrl ? URL_HINTS_EN : isPdf ? PDF_HINTS_EN : IMG_HINTS_EN)
    : (isUrl ? URL_HINTS    : isPdf ? PDF_HINTS    : IMG_HINTS);
  const processingTitle = lang === "en"
    ? (isUrl ? "Analysing link"   : isPdf ? "Reading PDF"   : "Analysing image")
    : (isUrl ? "Analizando enlace" : isPdf ? "Leyendo PDF"  : "Analizando imagen");

  const renderProcessing = () => (
    <View style={s.processingWrap}>
      <View style={s.docOuter}>
        <View style={[s.docIllus, { height: DOC_H }]}>
          {[0, 1, 2, 3, 4].map(i => (
            <View key={i} style={[s.docLine, { width: `${65 + (i % 2) * 20}%` as any, opacity: 0.22 }]} />
          ))}
          <Animated.View style={[s.scanBeam, { transform: [{ translateY: beamTY }] }]} />
        </View>
        <View style={s.docFold} />
      </View>

      <Text style={s.processingTitle}>{processingTitle}</Text>
      <Text style={s.processingHint}>{hints[hintIdx % hints.length]}</Text>
      <Text style={s.processingNote}>
        {lang === "en"
          ? "GO will automatically detect names, prices and durations."
          : "GO detectará nombres, precios y duraciones automáticamente."}
      </Text>
    </View>
  );

  // ── Render: Review ────────────────────────────────────────────────────────

  const renderReview = () => (
    <Animated.View style={[s.reviewWrap, { opacity: fadeAnim }]}>
      <View style={s.reviewSubHeader}>
        <View style={s.detectedBadge}>
          <Feather name="check-circle" size={13} color={GREEN} />
          <Text style={s.detectedBadgeTxt}>
            {lang === "en"
              ? `${svcs.length} service${svcs.length !== 1 ? "s" : ""} detected`
              : `${svcs.length} servicio${svcs.length !== 1 ? "s" : ""} detectado${svcs.length !== 1 ? "s" : ""}`}
          </Text>
        </View>
        <TouchableOpacity onPress={toggleAll} hitSlop={8}>
          <Text style={s.toggleAllTxt}>{allSelected ? (lang === "en" ? "Deselect all" : "Deseleccionar todo") : (lang === "en" ? "Select all" : "Seleccionar todo")}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.reviewScroll}
        contentContainerStyle={s.reviewScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {svcs.map(svc => (
          <View key={svc.id} style={[s.svcCard, !svc.selected && s.svcCardDimmed]}>
            <TouchableOpacity onPress={() => toggleSvc(svc.id)} hitSlop={8} activeOpacity={0.7} style={s.checkboxWrap}>
              <View style={[s.checkbox, svc.selected && s.checkboxActive]}>
                {svc.selected && <Feather name="check" size={11} color="#fff" />}
              </View>
            </TouchableOpacity>

            <View style={s.svcFields}>
              <TextInput
                style={[s.svcNameInput, !svc.selected && { color: DIM }]}
                value={svc.name}
                onChangeText={v => patchSvc(svc.id, { name: v })}
                placeholder={lang === "en" ? "Service name" : "Nombre del servicio"}
                placeholderTextColor={DIM}
                returnKeyType="done"
                editable={svc.selected}
              />
              <View style={s.svcMetaRow}>
                <View style={s.metaChip}>
                  <TextInput
                    style={s.metaInput}
                    value={svc.price > 0 ? String(svc.price) : ""}
                    onChangeText={v => patchSvc(svc.id, { price: parseFloat(v) || 0 })}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={DIM}
                    editable={svc.selected}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <Text style={s.metaUnit}>€</Text>
                </View>
                <View style={s.metaChip}>
                  <TextInput
                    style={s.metaInput}
                    value={String(svc.duration)}
                    onChangeText={v => patchSvc(svc.id, { duration: parseInt(v) || 0 })}
                    keyboardType="numeric"
                    editable={svc.selected}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <Text style={s.metaUnit}>min</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity onPress={() => removeSvc(svc.id)} hitSlop={10} activeOpacity={0.7} style={s.svcDeleteBtn}>
              <Feather name="x" size={15} color={DIM} />
            </TouchableOpacity>
          </View>
        ))}

        {svcs.length === 0 && (
          <View style={s.emptyState}>
            <Feather name="inbox" size={32} color={DIM} />
            <Text style={s.emptyStateTxt}>{lang === "en" ? "All services removed" : "Todos los servicios eliminados"}</Text>
          </View>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity onPress={onClose} style={s.cancelBtn} activeOpacity={0.7}>
          <Text style={s.cancelBtnTxt}>{lang === "en" ? "Cancel" : "Cancelar"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={selectedCount === 0}
          activeOpacity={0.85}
          style={[s.confirmBtn, selectedCount === 0 && s.confirmBtnDisabled]}
        >
          <Feather name="download" size={14} color="#fff" />
          <Text style={s.confirmBtnTxt}>
            {lang === "en"
              ? `Add ${selectedCount} service${selectedCount !== 1 ? "s" : ""}`
              : `Añadir ${selectedCount} servicio${selectedCount !== 1 ? "s" : ""}`}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  // ── Render: Error ─────────────────────────────────────────────────────────

  const renderError = () => (
    <View style={s.errorWrap}>
      <View style={s.errorIconWrap}>
        <Feather name="alert-circle" size={38} color={RED} />
      </View>
      <Text style={s.errorTitle}>{lang === "en" ? "Could not read the source" : "No se pudo leer la fuente"}</Text>
      <Text style={s.errorMsg}>{errorMsg}</Text>
      {isUrl && (
        <TouchableOpacity
          onPress={() => setPhase("url_input")}
          style={[s.retryBtn, { marginBottom: 8 }]}
          activeOpacity={0.8}
        >
          <Feather name="edit-2" size={14} color={TEAL} />
          <Text style={[s.retryBtnTxt, { color: TEAL }]}>{lang === "en" ? "Change link" : "Cambiar enlace"}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => isUrl ? doExtract(urlRef.current) : doExtract()}
        style={s.retryBtn}
        activeOpacity={0.8}
      >
        <Feather name="refresh-cw" size={14} color={BLUE} />
        <Text style={s.retryBtnTxt}>{lang === "en" ? "Try again" : "Intentar de nuevo"}</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Animated.View
          style={[
            s.sheet,
            { paddingTop: Math.max(insets.top + 12, 28), transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={[s.sourceIcon, { backgroundColor: sourceColor + "18" }]}>
                <Feather name={sourceIcon} size={15} color={sourceColor} />
              </View>
              <View>
                <Text style={s.headerTitle}>{headerTitle}</Text>
                <Text style={s.headerSub}>{sourceLabelShort}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn} activeOpacity={0.7}>
              <Feather name="x" size={22} color={GRAY} />
            </TouchableOpacity>
          </View>

          <View style={s.divider} />

          {/* Body */}
          <View style={s.body}>
            {phase === "url_input"  && renderUrlInput()}
            {phase === "processing" && renderProcessing()}
            {phase === "review"     && renderReview()}
            {phase === "error"      && renderError()}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "95%",
    minHeight: "60%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
    overflow: "hidden",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  headerSub:   { fontSize: 11, color: DIM, marginTop: 1 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  divider: { height: 1, backgroundColor: BORDER },
  body:    { flex: 1 },

  // ── URL Input ─────────────────────────────────────────────────────────────
  urlScroll:        { flex: 1 },
  urlScrollContent: { padding: 20, paddingBottom: 32 },
  urlIllus: {
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  urlGlobeRing: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: TEAL + "12",
    borderWidth: 1.5,
    borderColor: TEAL + "25",
    alignItems: "center",
    justifyContent: "center",
  },
  urlTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    marginBottom: 8,
  },
  urlSubtitle: {
    fontSize: 13,
    color: GRAY,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },
  urlFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    gap: 10,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  urlField: {
    flex: 1,
    fontSize: 14,
    color: TEXT,
    fontWeight: "500",
    paddingVertical: 0,
  },
  urlExamplesLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: DIM,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  urlExamplesRow: {
    flexDirection: "column",
    gap: 6,
    marginBottom: 20,
  },
  urlExampleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: TEAL + "0C",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TEAL + "20",
  },
  urlExampleTxt: {
    fontSize: 12,
    color: TEAL,
    fontWeight: "600",
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: TEAL,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  analyzeBtnDisabled: {
    backgroundColor: DIM,
  },
  analyzeBtnTxt: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  urlDisclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  urlDisclaimerTxt: {
    fontSize: 11,
    color: DIM,
    flex: 1,
    lineHeight: 16,
  },

  // ── Processing ────────────────────────────────────────────────────────────
  processingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 16,
  },
  docOuter: { position: "relative", marginBottom: 8 },
  docIllus: {
    width: 110,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 8,
    alignItems: "flex-start",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  docLine:          { height: 6, backgroundColor: DIM, borderRadius: 3 },
  scanBeam:         { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: BLUE, opacity: 0.75 },
  docFold: {
    position: "absolute", top: 0, right: 0, width: 20, height: 20,
    backgroundColor: BG, borderBottomLeftRadius: 6,
    borderColor: BORDER, borderBottomWidth: 1, borderLeftWidth: 1,
  },
  processingTitle:  { fontSize: 18, fontWeight: "800", color: TEXT, textAlign: "center" },
  processingHint:   { fontSize: 14, color: BLUE, fontWeight: "600", textAlign: "center" },
  processingNote:   { fontSize: 13, color: DIM, textAlign: "center", lineHeight: 19, maxWidth: 260 },

  // ── Review ────────────────────────────────────────────────────────────────
  reviewWrap: { flex: 1 },
  reviewSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  detectedBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: GREEN + "12",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  detectedBadgeTxt: { fontSize: 12, fontWeight: "700", color: GREEN },
  toggleAllTxt:     { fontSize: 12, fontWeight: "600", color: BLUE },
  reviewScroll:        { flex: 1 },
  reviewScrollContent: { padding: 12, gap: 8 },
  svcCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  svcCardDimmed: { opacity: 0.45 },
  checkboxWrap:  { padding: 2 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: "#F3F4F6",
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive:  { backgroundColor: BLUE, borderColor: BLUE },
  svcFields:       { flex: 1, gap: 6 },
  svcNameInput:    { fontSize: 14, fontWeight: "600", color: TEXT, paddingVertical: 0 },
  svcMetaRow:      { flexDirection: "row", gap: 6 },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#F3F4F6", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  metaInput:  { fontSize: 12, fontWeight: "600", color: TEXT, minWidth: 28, textAlign: "center", paddingVertical: 0 },
  metaUnit:   { fontSize: 11, fontWeight: "600", color: DIM },
  svcDeleteBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyState:    { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyStateTxt: { fontSize: 13, color: DIM },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 16, backgroundColor: CARD,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  cancelBtn:     { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: BORDER },
  cancelBtnTxt:  { fontSize: 14, fontWeight: "600", color: GRAY },
  confirmBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: BLUE, paddingVertical: 13, borderRadius: 14,
  },
  confirmBtnDisabled: { backgroundColor: DIM },
  confirmBtnTxt:      { fontSize: 14, fontWeight: "800", color: "#fff" },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorWrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, paddingVertical: 24, gap: 14,
  },
  errorIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: RED + "12",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: "800", color: TEXT, textAlign: "center" },
  errorMsg:   { fontSize: 13, color: GRAY, textAlign: "center", lineHeight: 19, maxWidth: 270 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingVertical: 11, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1.5,
    borderColor: BLUE + "40", backgroundColor: BLUE + "08",
    marginTop: 4,
  },
  retryBtnTxt: { fontSize: 14, fontWeight: "700", color: BLUE },
});
