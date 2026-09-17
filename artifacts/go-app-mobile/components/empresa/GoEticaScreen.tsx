/**
 * GoEticaScreen — Módulo Ético TESO 11/99
 * Admin GO → Ética → Módulos éticos
 *
 * V1: colores por fila, sin 81 tonalidades distintas.
 * No toca Marketplace, Reservas, Landing ni GO central.
 */
import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Paleta Admin GO ────────────────────────────────────────────────────────
const BG   = "#0D0E11";
const CARD = "#1A1B1F";
const BORD = "rgba(255,255,255,0.08)";
const TEXT = "#FFFFFF";
const DIM  = "rgba(255,255,255,0.28)";
const GRAY = "rgba(255,255,255,0.50)";

// ─── Paleta TESO 11/99 ───────────────────────────────────────────────────────
// Un solo color por fila (V1)
const TESO_ROW_COLORS: Record<number, { bg: string; fg: string; label: string; label_en: string; desc: string; desc_en: string }> = {
  1: { bg: "#FFFFFF",  fg: "#0a0a0a", label: "Blanco",         label_en: "White",      desc: "Bien común y principios universales",  desc_en: "Common good and universal principles"  },
  2: { bg: "#F5F0DC",  fg: "#5a4a2a", label: "Crema",          label_en: "Cream",      desc: "Personas y relaciones humanas",        desc_en: "People and human relationships"        },
  3: { bg: "#E879A0",  fg: "#fff",    label: "Magenta",        label_en: "Magenta",    desc: "Equidad, inclusión y derechos",        desc_en: "Equity, inclusion and rights"          },
  4: { bg: "#C8A037",  fg: "#fff",    label: "Amarillo oscuro",label_en: "Dark Yellow",desc: "Transparencia y responsabilidad",      desc_en: "Transparency and accountability"       },
  5: { bg: "#3D9A84",  fg: "#fff",    label: "Verde",          label_en: "Green",      desc: "Sostenibilidad y medioambiente",       desc_en: "Sustainability and environment"        },
  6: { bg: "#2D4E7A",  fg: "#fff",    label: "Azul oscuro",    label_en: "Dark Blue",  desc: "Tecnología y datos",                  desc_en: "Technology and data"                   },
  7: { bg: "#6B4226",  fg: "#fff",    label: "Marrón oscuro",  label_en: "Dark Brown", desc: "Economía y recursos",                  desc_en: "Economy and resources"                 },
  8: { bg: "#7A7A8A",  fg: "#fff",    label: "Gris",           label_en: "Grey",       desc: "Riesgos y consecuencias",             desc_en: "Risks and consequences"               },
  9: { bg: "#0D0E11",  fg: "#fff",    label: "Negro",          label_en: "Black",      desc: "Impacto crítico y daño",              desc_en: "Critical impact and harm"             },
};

/** Devuelve fila TESO para un número 11-99 */
function tesoRow(n: number) {
  return Math.floor(n / 10);
}
function tesoColor(n: number) {
  return TESO_ROW_COLORS[tesoRow(n)] ?? TESO_ROW_COLORS[5];
}

/** Devuelve peso ponderado según número */
function tesoWeight(n: number) {
  if (n <= 29) return 1;
  if (n <= 49) return 2;
  if (n <= 69) return 3;
  return 4;
}

// ─── Preguntas 11/99 (Spanish) ───────────────────────────────────────────────
const QUESTIONS: Record<number, string> = {
  11: "¿El módulo tiene un propósito claro y definido?",
  12: "¿El objetivo principal beneficia al usuario final?",
  13: "¿Está alineado con los valores de TESO?",
  14: "¿Existe documentación mínima antes de construir?",
  15: "¿El equipo conoce el alcance del módulo?",
  16: "¿Hay un responsable asignado para este módulo?",
  17: "¿El módulo tiene un nombre apropiado y claro?",
  18: "¿Existe un calendario de revisión definido?",
  19: "¿Se ha comunicado al equipo la existencia del módulo?",
  21: "¿El módulo mejora algún proceso existente?",
  22: "¿Reduce fricción o esfuerzo para el usuario?",
  23: "¿Está integrado de forma coherente con los demás módulos?",
  24: "¿Los datos que maneja son proporcionales al objetivo?",
  25: "¿La interfaz es comprensible sin formación previa?",
  26: "¿Puede operar sin conexión en casos básicos?",
  27: "¿Se han considerado los casos extremos de uso?",
  28: "¿El módulo tiene un mecanismo de feedback del usuario?",
  29: "¿Existe un criterio de éxito medible?",
  31: "¿El módulo recoge datos personales del usuario?",
  32: "¿Se informa al usuario qué datos se recogen y por qué?",
  33: "¿El usuario puede revocar su consentimiento?",
  34: "¿Los datos se almacenan de forma segura?",
  35: "¿El módulo puede usarse de forma anónima?",
  36: "¿Se minimizan los datos recogidos al mínimo necesario?",
  37: "¿Se aplica cifrado en tránsito y en reposo?",
  38: "¿Existe política de retención y borrado de datos?",
  39: "¿El módulo cumple con la regulación de privacidad aplicable?",
  41: "¿Puede este módulo ser usado para excluir personas?",
  42: "¿Hay riesgo de sesgo en los algoritmos utilizados?",
  43: "¿El módulo trata de forma igual a todos los perfiles de usuario?",
  44: "¿Hay grupos vulnerables que puedan verse afectados negativamente?",
  45: "¿El acceso al módulo es equitativo (precio, idioma, dispositivo)?",
  46: "¿Se han considerado barreras de accesibilidad?",
  47: "¿El módulo puede reforzar estereotipos o discriminación?",
  48: "¿Existe un proceso para reportar trato injusto?",
  49: "¿Se ha validado la equidad con personas externas al equipo?",
  51: "¿El módulo puede generar dependencia en el usuario?",
  52: "¿El diseño incentiva comportamientos perjudiciales?",
  53: "¿Existen patrones oscuros (dark patterns) en la interfaz?",
  54: "¿El módulo presiona al usuario a actuar contra su interés?",
  55: "¿Hay métricas que incentivan el engagement sobre el bienestar?",
  56: "¿El módulo puede usarse para manipular decisiones del usuario?",
  57: "¿Existe un límite ético en la personalización del contenido?",
  58: "¿Se ha evaluado el impacto psicológico del módulo?",
  59: "¿El equipo ha revisado posibles usos indebidos del módulo?",
  61: "¿El módulo puede afectar el empleo o sustento de personas?",
  62: "¿Automatiza tareas que antes requerían trabajo humano?",
  63: "¿Hay un plan para mitigar impactos laborales negativos?",
  64: "¿El módulo puede concentrar poder de mercado de forma injusta?",
  65: "¿Afecta a la competencia de pequeños negocios?",
  66: "¿El modelo de negocio detrás del módulo es éticamente sostenible?",
  67: "¿El módulo tiene impacto ambiental (consumo energético, residuos)?",
  68: "¿Se ha calculado la huella de carbono del módulo?",
  69: "¿El módulo contribuye a una economía local o global más justa?",
  71: "¿El módulo puede ser usado para vigilancia o control de personas?",
  72: "¿Puede combinarse con otros datos para crear perfiles invasivos?",
  73: "¿Existe riesgo de que el Estado o terceros accedan a los datos?",
  74: "¿El módulo refuerza o debilita la autonomía del usuario?",
  75: "¿Puede ser weaponizado (usado como arma) contra grupos de personas?",
  76: "¿Hay riesgo de abuso de poder interno usando este módulo?",
  77: "¿El módulo puede ser usado para desinformación o propaganda?",
  78: "¿Existe trazabilidad de quién accede y modifica qué datos?",
  79: "¿El módulo puede ser desactivado de forma segura si es necesario?",
  81: "¿El módulo tiene un impacto crítico si falla o es hackeado?",
  82: "¿Existe un plan de contingencia ante fallos graves?",
  83: "¿El módulo puede provocar daños físicos si falla (e.g. logística)?",
  84: "¿Hay dependencias externas que introduzcan riesgo sistémico?",
  85: "¿El módulo ha pasado por auditoría de seguridad independiente?",
  86: "¿Se han contemplado ataques adversariales sobre el módulo de IA?",
  87: "¿El módulo puede tomar decisiones autónomas con consecuencias graves?",
  88: "¿Existe un mecanismo de supervisión humana efectivo?",
  89: "¿Se ha documentado el riesgo residual aceptado y por quién?",
  91: "¿El módulo puede causar daño irreversible a personas?",
  92: "¿Puede usarse para vulnerar derechos fundamentales?",
  93: "¿Podría este módulo ser considerado ilegal en alguna jurisdicción?",
  94: "¿El módulo puede amplificar injusticias sistémicas existentes?",
  95: "¿Existe riesgo de daño masivo si el módulo escala globalmente?",
  96: "¿El beneficio esperado justifica éticamente los riesgos identificados?",
  97: "¿El comité ético ha revisado y aprobado el módulo?",
  98: "¿Existe un plan de retirada si el módulo resulta dañino?",
  99: "¿Se ha considerado si este módulo debería existir en absoluto?",
};

// ─── Preguntas 11/99 (English) ───────────────────────────────────────────────
const QUESTIONS_EN: Record<number, string> = {
  11: "Does the module have a clear, defined purpose?",
  12: "Does the main objective benefit the end user?",
  13: "Is it aligned with TESO's values?",
  14: "Is there minimal documentation before building?",
  15: "Does the team know the module's scope?",
  16: "Is there an assigned owner for this module?",
  17: "Does the module have an appropriate, clear name?",
  18: "Is there a defined review calendar?",
  19: "Has the team been informed of the module's existence?",
  21: "Does the module improve an existing process?",
  22: "Does it reduce friction or effort for the user?",
  23: "Is it coherently integrated with the other modules?",
  24: "Is the data it handles proportionate to the objective?",
  25: "Is the interface understandable without prior training?",
  26: "Can it operate offline in basic cases?",
  27: "Have edge cases of use been considered?",
  28: "Does the module have a user feedback mechanism?",
  29: "Is there a measurable success criterion?",
  31: "Does the module collect personal data from the user?",
  32: "Is the user informed what data is collected and why?",
  33: "Can the user revoke their consent?",
  34: "Is the data stored securely?",
  35: "Can the module be used anonymously?",
  36: "Is the collected data minimised to what is strictly necessary?",
  37: "Is encryption applied in transit and at rest?",
  38: "Is there a data retention and deletion policy?",
  39: "Does the module comply with applicable privacy regulations?",
  41: "Can this module be used to exclude people?",
  42: "Is there a risk of bias in the algorithms used?",
  43: "Does the module treat all user profiles equally?",
  44: "Are there vulnerable groups who could be negatively affected?",
  45: "Is access to the module equitable (price, language, device)?",
  46: "Have accessibility barriers been considered?",
  47: "Can the module reinforce stereotypes or discrimination?",
  48: "Is there a process to report unfair treatment?",
  49: "Has equity been validated with people outside the team?",
  51: "Can the module create dependency in the user?",
  52: "Does the design incentivise harmful behaviour?",
  53: "Are there dark patterns in the interface?",
  54: "Does the module pressure the user to act against their interest?",
  55: "Are there metrics that incentivise engagement over wellbeing?",
  56: "Can the module be used to manipulate user decisions?",
  57: "Is there an ethical limit to content personalisation?",
  58: "Has the psychological impact of the module been evaluated?",
  59: "Has the team reviewed possible misuse of the module?",
  61: "Can the module affect people's employment or livelihood?",
  62: "Does it automate tasks that previously required human work?",
  63: "Is there a plan to mitigate negative labour impacts?",
  64: "Can the module concentrate market power unfairly?",
  65: "Does it affect the competitiveness of small businesses?",
  66: "Is the business model behind the module ethically sustainable?",
  67: "Does the module have an environmental impact (energy, waste)?",
  68: "Has the carbon footprint of the module been calculated?",
  69: "Does the module contribute to a fairer local or global economy?",
  71: "Can the module be used to surveil or control people?",
  72: "Can it be combined with other data to create invasive profiles?",
  73: "Is there a risk of the state or third parties accessing the data?",
  74: "Does the module reinforce or weaken user autonomy?",
  75: "Can it be weaponised against groups of people?",
  76: "Is there a risk of internal power abuse using this module?",
  77: "Can the module be used for disinformation or propaganda?",
  78: "Is there traceability of who accesses and modifies what data?",
  79: "Can the module be safely deactivated if necessary?",
  81: "Does the module have a critical impact if it fails or is hacked?",
  82: "Is there a contingency plan for serious failures?",
  83: "Can the module cause physical harm if it fails (e.g. logistics)?",
  84: "Are there external dependencies that introduce systemic risk?",
  85: "Has the module undergone an independent security audit?",
  86: "Have adversarial attacks on the AI module been considered?",
  87: "Can the module make autonomous decisions with serious consequences?",
  88: "Is there an effective human supervision mechanism?",
  89: "Has the accepted residual risk been documented and by whom?",
  91: "Can the module cause irreversible harm to people?",
  92: "Can it be used to violate fundamental rights?",
  93: "Could this module be considered illegal in some jurisdiction?",
  94: "Can the module amplify existing systemic injustices?",
  95: "Is there a risk of mass harm if the module scales globally?",
  96: "Does the expected benefit ethically justify the identified risks?",
  97: "Has the ethics committee reviewed and approved the module?",
  98: "Is there a withdrawal plan if the module proves harmful?",
  99: "Has it been considered whether this module should exist at all?",
};

// ─── Módulos éticos ──────────────────────────────────────────────────────────
const ETHICAL_MODULES = [
  { key: "humanity",      label: "GO Humanity",      icon: "heart"       as const, color: "#E879A0" },
  { key: "observatory",   label: "GO Observatory",   icon: "eye"         as const, color: "#4A80BD" },
  { key: "vulnerabilidad",label: "Vulnerabilidad",   icon: "shield"      as const, color: "#C8A037" },
  { key: "social",        label: "GO Social",        icon: "users"       as const, color: "#3D9A84" },
  { key: "comunicacion",  label: "GO Comunicación",  icon: "message-circle" as const, color: "#7C69BE" },
  { key: "empresa",       label: "GO Empresa",       icon: "briefcase"   as const, color: "#f97316" },
  { key: "servicios",     label: "GO Servicios",     icon: "tool"        as const, color: "#f59e0b" },
  { key: "prl",           label: "GO PRL",           icon: "alert-triangle" as const, color: "#ef4444" },
  { key: "industry",      label: "GO Industry",      icon: "cpu"         as const, color: "#8b5cf6" },
  { key: "logistica",     label: "GO Logística",     icon: "truck"       as const, color: "#06b6d4" },
  { key: "ia",            label: "GO IA",            icon: "zap"         as const, color: "#ec4899" },
  { key: "negocio",       label: "GO Negocio",       icon: "trending-up" as const, color: "#10b981" },
  { key: "reservas",      label: "GO Reservas",      icon: "calendar"    as const, color: "#4A80BD" },
  { key: "marketplace",   label: "GO Marketplace",   icon: "shopping-bag" as const, color: "#f97316" },
  { key: "chat",          label: "GO Chat",          icon: "message-square" as const, color: "#C8A037" },
];

// ─── Tipos ──────────────────────────────────────────────────────────────────
type TesoColorKey = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null;

interface AnswerData {
  text: string;
  colorRow: TesoColorKey; // null = sin asignar
}

interface ExpertEntry {
  id: string;
  experto: string;
  area: string;
  fecha: string;
  decision: string;
  comentario: string;
  proximaRevision: string;
}

interface HistorialEntry {
  id: string;
  fecha: string;
  pregunta: number;
  colorAnterior: TesoColorKey;
  colorNuevo: TesoColorKey;
  responsable: string;
  motivo: string;
  decision: string;
}

interface AccionEntry {
  id: string;
  tipo: string;
  descripcion: string;
  prioridad: "alta" | "media" | "baja";
}

interface ModuleData {
  answers: Record<number, AnswerData>;
  expertos: ExpertEntry[];
  historial: HistorialEntry[];
  acciones: AccionEntry[];
  estadoManual: number | null;
}

function makeDefaultModuleData(): ModuleData {
  const answers: Record<number, AnswerData> = {};
  for (let row = 1; row <= 9; row++) {
    for (let col = 1; col <= 9; col++) {
      const n = row * 10 + col;
      answers[n] = { text: "", colorRow: null };
    }
  }
  return {
    answers,
    expertos: [
      {
        id: "e1",
        experto: "Comité TESO",
        area: "Ética general",
        fecha: "2026-06-01",
        decision: "Pendiente de revisión completa",
        comentario: "Primera revisión formal pendiente",
        proximaRevision: "2026-09-01",
      },
    ],
    historial: [],
    acciones: [
      {
        id: "a1",
        tipo: "Revisar preguntas",
        descripcion: "Completar respuestas pendientes del cuadro 11/99",
        prioridad: "alta",
      },
      {
        id: "a2",
        tipo: "Pedir experto",
        descripcion: "Solicitar revisión externa del módulo",
        prioridad: "media",
      },
    ],
    estadoManual: null,
  };
}

// ─── Dimensiones ─────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get("window");
const GRID_PAD   = 16;
const CELL_SIZE  = Math.floor((SW - GRID_PAD * 2 - 8 * 2) / 9); // cuadrado perfecto

// ─── Componente principal ────────────────────────────────────────────────────
interface Props {
  dark?: boolean;
  /** Pre-selecciona un módulo por su clave, saltando la lista de selección. */
  initialModule?: string;
  /** Etiqueta de presentación cuando la clave no existe en ETHICAL_MODULES. */
  initialLabel?: string;
  /** Color de presentación cuando la clave no existe en ETHICAL_MODULES. */
  initialColor?: string;
}

export function GoEticaScreen({ initialModule, initialLabel, initialColor }: Props) {
  const { lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const [selectedModule, setSelectedModule] = useState<string | null>(initialModule ?? null);
  const [moduleData, setModuleData] = useState<Record<string, ModuleData>>({});
  const [activeTab, setActiveTab] = useState<
    "modelo" | "preguntas" | "respuestas" | "estado" | "comite" | "historial" | "acciones"
  >("modelo");
  const [tooltip, setTooltip] = useState<{ n: number; type: "q" | "a" } | null>(null);

  const ethicalModEntry = ETHICAL_MODULES.find(m => m.key === selectedModule);
  const currentModule = ethicalModEntry ?? (selectedModule
    ? { key: selectedModule, label: initialLabel ?? selectedModule, icon: "hexagon" as const, color: initialColor ?? "#3D9A84" }
    : undefined);
  const data: ModuleData = selectedModule
    ? (moduleData[selectedModule] ?? makeDefaultModuleData())
    : makeDefaultModuleData();

  const patchData = (patch: Partial<ModuleData>) => {
    if (!selectedModule) return;
    setModuleData(prev => ({
      ...prev,
      [selectedModule]: { ...(prev[selectedModule] ?? makeDefaultModuleData()), ...patch },
    }));
  };

  /** Calcula estado general ponderado */
  const calcEstado = (): number => {
    if (data.estadoManual !== null) return data.estadoManual;
    let totalWeight = 0;
    let totalValue  = 0;
    let answered    = 0;
    for (let row = 1; row <= 9; row++) {
      for (let col = 1; col <= 9; col++) {
        const n  = row * 10 + col;
        const an = data.answers[n];
        if (an?.colorRow !== null && an?.colorRow !== undefined) {
          const colorN = (an.colorRow - 1) * 10 + 5; // valor central de la fila
          const w      = tesoWeight(n);
          totalValue  += colorN * w;
          totalWeight += w;
          answered++;
        }
      }
    }
    if (answered === 0 || totalWeight === 0) return 33; // default crema/verde bajo
    const raw = totalValue / totalWeight;
    return Math.min(99, Math.max(11, Math.round(raw)));
  };

  /** ¿Hay alguna pregunta crítica (71-99) en negro (fila 9)? */
  const hasCriticalNegro = (): boolean => {
    for (let row = 7; row <= 9; row++) {
      for (let col = 1; col <= 9; col++) {
        const n = row * 10 + col;
        if (data.answers[n]?.colorRow === 9) return true;
      }
    }
    return false;
  };

  // ── Si no hay módulo seleccionado, mostrar lista ──
  if (!selectedModule) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: 16 + insets.top, paddingBottom: 120, gap: 6 }}
      >
        <Text style={s.sectionTitle}>
          {lang === 'en' ? "ETHICAL MODULES" : "MÓDULOS ÉTICOS"}
        </Text>
        {ETHICAL_MODULES.map(mod => (
          <TouchableOpacity
            key={mod.key}
            style={s.modCard}
            activeOpacity={0.78}
            onPress={() => {
              setSelectedModule(mod.key);
              setActiveTab("modelo");
              setTooltip(null);
            }}
          >
            <View style={[s.modIcon, { backgroundColor: `${mod.color}20` }]}>
              <Feather name={mod.icon} size={19} color={mod.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modLabel}>{mod.label}</Text>
              <Text style={s.modSub}>
                {lang === 'en' ? "Ethical review 11/99" : "Revisión ética 11/99"}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={DIM} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // ── Detalle de módulo ──
  const estado  = calcEstado();
  const eColor  = tesoColor(estado);
  const critical = hasCriticalNegro();

  const TABS: Array<{ key: typeof activeTab; label: string }> = [
    { key: "modelo",      label: lang === 'en' ? "Model"     : "Modelo"    },
    { key: "preguntas",   label: lang === 'en' ? "Questions" : "Preguntas" },
    { key: "respuestas",  label: lang === 'en' ? "Answers"   : "Respuestas"},
    { key: "estado",      label: lang === 'en' ? "Status"    : "Estado"    },
    { key: "comite",      label: lang === 'en' ? "Committee" : "Comité"    },
    { key: "historial",   label: lang === 'en' ? "History"   : "Historial" },
    { key: "acciones",    label: lang === 'en' ? "Actions"   : "Acciones"  },
  ];

  const statusDescription = (n: number): string => {
    if (lang === 'en') {
      if (n <= 29) return "Initial review — insufficient data";
      if (n <= 39) return "Low status — requires attention";
      if (n <= 49) return "Moderate status — under construction";
      if (n <= 59) return "Controlled action — acceptable progress";
      if (n <= 69) return "Positive — well oriented";
      if (n <= 79) return "Caution zone — review critical items";
      if (n <= 89) return "Serious status — intervention required";
      return "Critical status — consider pausing module";
    } else {
      if (n <= 29) return "Revisión inicial — sin datos suficientes";
      if (n <= 39) return "Estado bajo — requiere atención";
      if (n <= 49) return "Estado moderado — en construcción";
      if (n <= 59) return "Acción controlada — progreso aceptable";
      if (n <= 69) return "Positivo — bien orientado";
      if (n <= 79) return "Zona de precaución — revisar críticos";
      if (n <= 89) return "Estado grave — requiere intervención";
      return "Estado crítico — considerar pausar módulo";
    }
  };

  const actionTypes = lang === 'en'
    ? ["Review question", "Request expert", "Pause module", "Modify design", "Reduce scope", "Change priority", "Redirect"]
    : ["Revisar pregunta", "Pedir experto", "Pausar módulo", "Modificar diseño", "Reducir alcance", "Cambiar prioridad", "Reconducir"];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Sub-header módulo — mismo safe area que el resto del ecosistema GO */}
      <View style={[s.modHeader, { paddingTop: 12 + insets.top }]}>
        <View style={[s.modIcon, { backgroundColor: `${currentModule?.color ?? "#fff"}20`, width: 28, height: 28, borderRadius: 8 }]}>
          <Feather name={currentModule?.icon ?? "circle"} size={14} color={currentModule?.color ?? TEXT} />
        </View>
        <Text style={[s.modHeaderLabel, { color: currentModule?.color ?? TEXT }]}>
          {currentModule?.label}
        </Text>
        {critical && (
          <View style={s.alertPill}>
            <Text style={s.alertPillText}>
              {lang === 'en' ? "CRITICAL ALERT" : "ALERTA CRÍTICA"}
            </Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabBar}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
      >
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => { setActiveTab(t.key); setTooltip(null); }}
          >
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Contenido */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─ 1. MODELO MADRE ───────────────────────────────────────────── */}
        {activeTab === "modelo" && (
          <View style={s.section}>
            <SectionHeader
              title={lang === 'en' ? "MOTHER MODEL 11/99" : "MODELO MADRE 11/99"}
              subtitle={lang === 'en' ? "One colour per row — V1" : "Un color por fila — V1"}
            />
            <View style={[s.gridWrap, { alignSelf: "center" }]}>
              {[1,2,3,4,5,6,7,8,9].map(row => (
                <View key={row} style={s.gridRow}>
                  {[1,2,3,4,5,6,7,8,9].map(col => {
                    const n = row * 10 + col;
                    const c = TESO_ROW_COLORS[row];
                    return (
                      <View
                        key={col}
                        style={[s.cell, {
                          width: CELL_SIZE, height: CELL_SIZE,
                          backgroundColor: c.bg,
                          borderColor: row === 9 ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.10)",
                        }]}
                      >
                        <Text style={[s.cellText, { color: c.fg, fontSize: Math.max(7, CELL_SIZE * 0.28) }]}>
                          {n}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
            {/* Leyenda — una línea por color */}
            <View style={{ gap: 0, marginTop: 12 }}>
              {[1,2,3,4,5,6,7,8,9].map(row => {
                const c = TESO_ROW_COLORS[row];
                const label = lang === 'en' ? c.label_en : c.label;
                const desc  = lang === 'en' ? c.desc_en  : c.desc;
                return (
                  <View key={row} style={s.legendRow}>
                    <View style={[s.legendSwatch, { backgroundColor: c.bg, borderWidth: row === 1 ? 1 : 0, borderColor: "rgba(0,0,0,0.18)" }]} />
                    <Text style={s.legendRange} numberOfLines={1}>{row}1–{row}9</Text>
                    <Text style={s.legendLabel} numberOfLines={1}>{label}</Text>
                    <Text style={s.legendDesc} numberOfLines={1}>{desc}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ─ 2. PREGUNTAS ──────────────────────────────────────────────── */}
        {activeTab === "preguntas" && (
          <View style={s.section}>
            <SectionHeader
              title={lang === 'en' ? "QUESTIONS GRID 11/99" : "CUADRO PREGUNTAS 11/99"}
              subtitle={lang === 'en' ? "Hold to see the question" : "Mantén pulsado para ver la pregunta"}
            />
            <Grid81
              type="q"
              tooltip={tooltip}
              setTooltip={setTooltip}
              answers={data.answers}
              showValue={n => String(n)}
              cellColor={n => ({
                bg:   TESO_ROW_COLORS[tesoRow(n)].bg,
                fg:   TESO_ROW_COLORS[tesoRow(n)].fg,
              })}
              lang={lang}
            />
            {/* Listado */}
            <View style={{ marginTop: 12, gap: 6 }}>
              {Object.entries(lang === 'en' ? QUESTIONS_EN : QUESTIONS).map(([k, q]) => (
                <View key={k} style={s.qRow}>
                  <Text style={s.qNum}>{k}</Text>
                  <Text style={s.qText}>{q}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ─ 3. RESPUESTAS ─────────────────────────────────────────────── */}
        {activeTab === "respuestas" && (
          <View style={s.section}>
            <SectionHeader
              title={lang === 'en' ? "ANSWERS GRID 11/99" : "CUADRO RESPUESTAS 11/99"}
              subtitle={lang === 'en' ? "Tap a cell to view / edit the answer" : "Pulsa una casilla para ver / editar la respuesta"}
            />
            <Grid81
              type="a"
              tooltip={tooltip}
              setTooltip={setTooltip}
              answers={data.answers}
              showValue={n => String(n)}
              cellColor={n => {
                const row = data.answers[n]?.colorRow;
                if (!row) return { bg: CARD, fg: DIM };
                const c = TESO_ROW_COLORS[row];
                return { bg: c.bg, fg: c.fg };
              }}
              onCellPress={n => setTooltip(t => t?.n === n && t.type === "a" ? null : { n, type: "a" })}
              lang={lang}
            />
            {/* Detalle al pulsar */}
            {tooltip?.type === "a" && tooltip.n && (
              <AnswerEditor
                n={tooltip.n}
                answer={data.answers[tooltip.n]}
                lang={lang}
                onSave={(text, colorRow) => {
                  const newAnswers = { ...data.answers, [tooltip.n]: { text, colorRow } };
                  // historial
                  const prevColor = data.answers[tooltip.n]?.colorRow ?? null;
                  const newHist: HistorialEntry[] = prevColor !== colorRow
                    ? [
                        ...data.historial,
                        {
                          id: Date.now().toString(),
                          fecha: new Date().toLocaleDateString("es-ES"),
                          pregunta: tooltip.n,
                          colorAnterior: prevColor,
                          colorNuevo: colorRow,
                          responsable: "Sistema (autoeditado)",
                          motivo: "Actualización manual",
                          decision: "Pendiente de revisión",
                        },
                      ]
                    : data.historial;
                  patchData({ answers: newAnswers, historial: newHist });
                  setTooltip(null);
                }}
                onClose={() => setTooltip(null)}
              />
            )}
            {/* Listado respuestas */}
            <View style={{ marginTop: 12, gap: 6 }}>
              {Array.from({ length: 81 }, (_, i) => {
                const row = Math.floor(i / 9) + 1;
                const col = (i % 9) + 1;
                const n   = row * 10 + col;
                const an  = data.answers[n];
                if (!an?.text) return null;
                const c   = an.colorRow ? TESO_ROW_COLORS[an.colorRow] : null;
                return (
                  <View key={n} style={s.qRow}>
                    <View style={[s.answerNumBadge, { backgroundColor: c?.bg ?? CARD }]}>
                      <Text style={[s.qNum, { color: c?.fg ?? DIM }]}>{n}</Text>
                    </View>
                    <Text style={s.qText}>{an.text}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ─ 4. ESTADO GENERAL ─────────────────────────────────────────── */}
        {activeTab === "estado" && (
          <View style={s.section}>
            <SectionHeader
              title={lang === 'en' ? "OVERALL STATUS" : "ESTADO GENERAL"}
              subtitle={lang === 'en' ? "Weighted average of active answers" : "Media ponderada de respuestas activas"}
            />
            {critical && (
              <View style={s.criticalAlert}>
                <Feather name="alert-triangle" size={16} color="#ef4444" />
                <Text style={s.criticalText}>
                  {lang === 'en'
                    ? "Alert: there are critical questions (71–99) with Black status. The actual status may be more serious than the average."
                    : "Alerta: hay preguntas críticas (71–99) con estado Negro. El estado real puede ser más grave que la media."}
                </Text>
              </View>
            )}
            <View style={[s.estadoCard, { borderColor: eColor.bg }]}>
              <View style={[s.estadoNum, { backgroundColor: eColor.bg }]}>
                <Text style={[s.estadoNumText, { color: eColor.fg }]}>{estado}</Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={s.estadoColorLabel}>
                  {lang === 'en' ? eColor.label_en : eColor.label}
                </Text>
                <Text style={s.estadoSubtitle}>{statusDescription(estado)}</Text>
              </View>
            </View>
            {/* Ajuste manual — cuadrícula 3×3 */}
            <View style={s.manualCard}>
              <Text style={s.manualTitle}>
                {lang === 'en' ? "Authorised manual adjustment" : "Ajuste manual autorizado"}
              </Text>
              <Text style={s.manualSub}>
                {lang === 'en' ? "For committee use only" : "Solo para uso del comité"}
              </Text>
              <View style={s.manualGrid}>
                {[[1,2,3],[4,5,6],[7,8,9]].map((rowGroup, ri) => (
                  <View key={ri} style={s.manualGridRow}>
                    {rowGroup.map(row => {
                      const c      = TESO_ROW_COLORS[row];
                      const val    = row * 10 + 5;
                      const active = data.estadoManual === val;
                      return (
                        <TouchableOpacity
                          key={row}
                          style={[
                            s.manualCell,
                            { backgroundColor: c.bg },
                            active && s.manualCellActive,
                          ]}
                          onPress={() => patchData({ estadoManual: active ? null : val })}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.manualCellText, { color: c.fg }]}>{val}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
              {data.estadoManual !== null && (
                <TouchableOpacity
                  style={{ marginTop: 10, alignSelf: "flex-start" }}
                  onPress={() => patchData({ estadoManual: null })}
                >
                  <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600" }}>
                    {lang === 'en' ? "Remove manual adjustment" : "Eliminar ajuste manual"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ─ 5. COMITÉ ─────────────────────────────────────────────────── */}
        {activeTab === "comite" && (
          <View style={s.section}>
            <SectionHeader
              title={lang === 'en' ? "COMMITTEE / EXPERTS" : "COMITÉ / EXPERTOS"}
              subtitle={lang === 'en' ? "Experts review, answer and correct" : "Los expertos revisan, responden y corrigen"}
            />
            {data.expertos.map(exp => (
              <View key={exp.id} style={s.expertCard}>
                <View style={s.expertHeader}>
                  <Feather name="user" size={14} color={GRAY} />
                  <Text style={s.expertName}>{exp.experto}</Text>
                  <Text style={s.expertArea}>{exp.area}</Text>
                </View>
                <InfoRow label={lang === 'en' ? "Review date"    : "Fecha revisión"}   value={exp.fecha} />
                <InfoRow label={lang === 'en' ? "Decision"       : "Decisión"}         value={exp.decision} />
                <InfoRow label={lang === 'en' ? "Comment"        : "Comentario"}       value={exp.comentario} />
                <InfoRow label={lang === 'en' ? "Next review"    : "Próxima revisión"} value={exp.proximaRevision} />
              </View>
            ))}
          </View>
        )}

        {/* ─ 6. HISTORIAL ──────────────────────────────────────────────── */}
        {activeTab === "historial" && (
          <View style={s.section}>
            <SectionHeader
              title={lang === 'en' ? "REVIEW HISTORY" : "HISTORIAL DE REVISIÓN"}
              subtitle={lang === 'en' ? "Log of all changes" : "Registro de todos los cambios"}
            />
            {data.historial.length === 0 && (
              <Text style={s.emptyText}>
                {lang === 'en' ? "No changes recorded yet." : "Sin cambios registrados todavía."}
              </Text>
            )}
            {data.historial.map(h => (
              <View key={h.id} style={s.histCard}>
                <View style={s.histTop}>
                  <Text style={s.histFecha}>{h.fecha}</Text>
                  <Text style={s.histPregunta}>
                    {lang === 'en' ? "Question" : "Pregunta"} {h.pregunta}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4 }}>
                  {h.colorAnterior && (
                    <View style={[s.histSwatch, { backgroundColor: TESO_ROW_COLORS[h.colorAnterior]?.bg ?? CARD }]} />
                  )}
                  <Feather name="arrow-right" size={12} color={DIM} />
                  {h.colorNuevo && (
                    <View style={[s.histSwatch, { backgroundColor: TESO_ROW_COLORS[h.colorNuevo]?.bg ?? CARD }]} />
                  )}
                  <Text style={s.histLabel}>
                    {h.colorAnterior
                      ? (lang === 'en' ? TESO_ROW_COLORS[h.colorAnterior]?.label_en : TESO_ROW_COLORS[h.colorAnterior]?.label)
                      : (lang === 'en' ? "No colour" : "Sin color")}{" →"}{" "}
                    {h.colorNuevo
                      ? (lang === 'en' ? TESO_ROW_COLORS[h.colorNuevo]?.label_en : TESO_ROW_COLORS[h.colorNuevo]?.label)
                      : (lang === 'en' ? "No colour" : "Sin color")}
                  </Text>
                </View>
                <InfoRow label={lang === 'en' ? "Responsible" : "Responsable"} value={h.responsable} />
                <InfoRow label={lang === 'en' ? "Reason"      : "Motivo"}      value={h.motivo} />
                <InfoRow label={lang === 'en' ? "Decision"    : "Decisión"}    value={h.decision} />
              </View>
            ))}
          </View>
        )}

        {/* ─ 7. PRÓXIMAS ACCIONES ──────────────────────────────────────── */}
        {activeTab === "acciones" && (
          <View style={s.section}>
            <SectionHeader
              title={lang === 'en' ? "NEXT ACTIONS" : "PRÓXIMAS ACCIONES"}
              subtitle={lang === 'en' ? "If the module has critical status or doubts" : "Si el módulo tiene estado crítico o dudas"}
            />
            {data.acciones.map(ac => (
              <View key={ac.id} style={[s.accionCard, { borderLeftColor: ac.prioridad === "alta" ? "#ef4444" : ac.prioridad === "media" ? "#f59e0b" : "#3D9A84" }]}>
                <Text style={s.accionTipo}>{ac.tipo}</Text>
                <Text style={s.accionDesc}>{ac.descripcion}</Text>
                <View style={[s.accionPill, { backgroundColor: ac.prioridad === "alta" ? "rgba(239,68,68,0.15)" : ac.prioridad === "media" ? "rgba(245,158,11,0.15)" : "rgba(61,154,132,0.15)" }]}>
                  <Text style={[s.accionPillText, { color: ac.prioridad === "alta" ? "#ef4444" : ac.prioridad === "media" ? "#f59e0b" : "#3D9A84" }]}>
                    {ac.prioridad.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={s.sectionTitle}>
                {lang === 'en' ? "AVAILABLE ACTION TYPES" : "TIPOS DE ACCIÓN DISPONIBLES"}
              </Text>
              {actionTypes.map(tipo => (
                <TouchableOpacity key={tipo} style={s.accionAdd}>
                  <Feather name="plus-circle" size={14} color="#4A80BD" />
                  <Text style={s.accionAddText}>{tipo}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Grid 9x9 ────────────────────────────────────────────────────────────────
interface Grid81Props {
  type: "q" | "a";
  tooltip: { n: number; type: "q" | "a" } | null;
  setTooltip: (t: { n: number; type: "q" | "a" } | null) => void;
  answers: Record<number, AnswerData>;
  showValue: (n: number) => string;
  cellColor: (n: number) => { bg: string; fg: string };
  onCellPress?: (n: number) => void;
  lang: string;
}

function Grid81({ type, tooltip, setTooltip, answers, showValue, cellColor, onCellPress, lang }: Grid81Props) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = (n: number) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setTooltip({ n, type });
    }, 400);
  };

  const handlePressOut = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (type === "q") setTooltip(null);
  };

  const activeN = tooltip?.type === type ? tooltip.n : null;
  const questionsMap = lang === 'en' ? QUESTIONS_EN : QUESTIONS;

  return (
    <View style={{ alignSelf: "center" }}>
      {[1,2,3,4,5,6,7,8,9].map(row => (
        <View key={row} style={s.gridRow}>
          {[1,2,3,4,5,6,7,8,9].map(col => {
            const n   = row * 10 + col;
            const c   = cellColor(n);
            const act = activeN === n;
            return (
              <TouchableWithoutFeedback
                key={col}
                onPressIn={() => handlePressIn(n)}
                onPressOut={handlePressOut}
                onPress={() => onCellPress?.(n)}
              >
                <View
                  style={[s.cell, {
                    width: CELL_SIZE, height: CELL_SIZE,
                    backgroundColor: c.bg,
                    borderColor: act ? "#fff" : (c.bg === CARD ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)"),
                    borderWidth: act ? 2 : 1,
                    transform: [{ scale: act ? 1.05 : 1 }],
                  }]}
                >
                  <Text style={[s.cellText, { color: c.fg, fontSize: Math.max(7, CELL_SIZE * 0.28) }]}>
                    {showValue(n)}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
            );
          })}
        </View>
      ))}
      {/* Tooltip flotante */}
      {activeN !== null && (
        <View style={s.tooltip}>
          <Text style={s.tooltipNum}>{activeN}</Text>
          <Text style={s.tooltipText}>
            {type === "q"
              ? (questionsMap[activeN] ?? (lang === 'en' ? "Question not yet defined." : "Pregunta no definida aún."))
              : (answers[activeN]?.text || (lang === 'en' ? "No answer assigned." : "Sin respuesta asignada."))}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Editor de respuesta ─────────────────────────────────────────────────────
interface AnswerEditorProps {
  n: number;
  answer?: AnswerData;
  lang: string;
  onSave: (text: string, colorRow: TesoColorKey) => void;
  onClose: () => void;
}
function AnswerEditor({ n, answer, lang, onSave, onClose }: AnswerEditorProps) {
  const [text, setText]         = useState(answer?.text ?? "");
  const [colorRow, setColorRow] = useState<TesoColorKey>(answer?.colorRow ?? null);
  const questionsMap = lang === 'en' ? QUESTIONS_EN : QUESTIONS;
  return (
    <View style={s.editorCard}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Text style={s.editorTitle}>{lang === 'en' ? "Answer —" : "Respuesta —"} {n}</Text>
        <Text style={s.editorQ}>{questionsMap[n] ?? ""}</Text>
      </View>
      {/* Color TESO */}
      <Text style={s.editorLabel}>{lang === 'en' ? "TESO Colour" : "Color TESO"}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {[1,2,3,4,5,6,7,8,9].map(row => {
          const c = TESO_ROW_COLORS[row as keyof typeof TESO_ROW_COLORS];
          const active = colorRow === row;
          return (
            <TouchableOpacity
              key={row}
              style={[s.colorChip, { backgroundColor: c.bg, borderWidth: active ? 2 : 1, borderColor: active ? "#fff" : "rgba(255,255,255,0.2)" }]}
              onPress={() => setColorRow(active ? null : row as TesoColorKey)}
            >
              <Text style={[s.colorChipText, { color: c.fg }]}>
                {lang === 'en' ? c.label_en : c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Texto */}
      <Text style={s.editorLabel}>
        {lang === 'en' ? "Answer text" : "Texto de respuesta"}
      </Text>
      <View style={s.editorInput}>
        <Text
          style={{ color: text ? TEXT : DIM, fontSize: 13, lineHeight: 19 }}
          onPress={() => {}}
        >{text || (lang === 'en' ? "Write the answer here…" : "Escribe la respuesta aquí…")}</Text>
      </View>
      <View style={s.editorActions}>
        <TouchableOpacity style={s.editorCancel} onPress={onClose}>
          <Text style={s.editorCancelText}>{lang === 'en' ? "Cancel" : "Cancelar"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.editorSave} onPress={() => onSave(text, colorRow)}>
          <Text style={s.editorSaveText}>{lang === 'en' ? "Save" : "Guardar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Helpers pequeños ────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.secTitle}>{title}</Text>
      <Text style={s.secSub}>{subtitle}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}:</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  sectionTitle: { fontSize: 10, fontWeight: "700", color: DIM, letterSpacing: 0.8, paddingTop: 4, paddingBottom: 8 },
  section:      { gap: 0 },
  modCard:      { backgroundColor: CARD, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: BORD },
  modIcon:      { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  modLabel:     { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 2 },
  modSub:       { fontSize: 11, color: DIM, fontWeight: "500" },

  modHeader:      { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORD },
  modHeaderLabel: { fontSize: 15, fontWeight: "700", flex: 1 },
  alertPill:      { backgroundColor: "rgba(239,68,68,0.18)", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  alertPillText:  { fontSize: 9, fontWeight: "800", color: "#ef4444", letterSpacing: 0.5 },

  tabBar:     { backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORD, maxHeight: 44 },
  tab:        { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 0 },
  tabActive:  { borderBottomWidth: 2, borderBottomColor: "#4A80BD" },
  tabText:    { fontSize: 12, fontWeight: "600", color: DIM },
  tabTextActive: { color: "#4A80BD" },

  gridWrap: { gap: 0 },
  gridRow:  { flexDirection: "row" },
  cell:     {
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  cellText: { fontWeight: "700", letterSpacing: 0.1 },

  tooltip: {
    position: "absolute", bottom: -90, left: 0, right: 0,
    backgroundColor: "#1A1B1F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12, padding: 12, zIndex: 100,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 10, elevation: 10,
  },
  tooltipNum:  { fontSize: 11, fontWeight: "800", color: "#C8A037", marginBottom: 4 },
  tooltipText: { fontSize: 12, color: TEXT, lineHeight: 17 },

  legendRow:    { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  legendSwatch: { width: 18, height: 18, borderRadius: 4, flexShrink: 0 },
  legendRange:  { fontSize: 11, color: DIM, width: 42, flexShrink: 0 },
  legendLabel:  { fontSize: 12, color: TEXT, fontWeight: "700", width: 104, flexShrink: 0 },
  legendDesc:   { flex: 1, fontSize: 11, color: DIM, fontWeight: "400" },

  qRow:   { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: CARD, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: BORD },
  qNum:   { fontSize: 11, fontWeight: "800", color: "#C8A037", width: 28, paddingTop: 1 },
  qText:  { flex: 1, fontSize: 12, color: GRAY, lineHeight: 17 },

  answerNumBadge: { borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, alignItems: "center", justifyContent: "center", minWidth: 28 },

  estadoCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, flexDirection: "row", alignItems: "center", gap: 16, borderWidth: 2 },
  estadoNum:  { width: 72, height: 72, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  estadoNumText: { fontSize: 28, fontWeight: "900" },
  estadoColorLabel: { fontSize: 16, fontWeight: "700", color: TEXT },
  estadoSubtitle:   { fontSize: 12, color: GRAY, lineHeight: 17, maxWidth: "80%" },

  criticalAlert: { backgroundColor: "rgba(239,68,68,0.12)", borderRadius: 12, padding: 12, flexDirection: "row", gap: 8, alignItems: "flex-start", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", marginBottom: 12 },
  criticalText:  { flex: 1, fontSize: 12, color: "#ef4444", lineHeight: 17 },

  manualCard:     { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD, marginTop: 12 },
  manualTitle:    { fontSize: 13, fontWeight: "700", color: TEXT },
  manualSub:      { fontSize: 11, color: DIM, marginBottom: 10 },
  manualGrid:     { gap: 4 },
  manualGridRow:  { flexDirection: "row", gap: 4 },
  manualCell:     {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  manualCellActive: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  manualCellText: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },

  expertCard:   { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD, gap: 4, marginBottom: 8 },
  expertHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  expertName:   { fontSize: 14, fontWeight: "700", color: TEXT, flex: 1 },
  expertArea:   { fontSize: 11, color: DIM },

  infoRow:    { flexDirection: "row", gap: 6 },
  infoLabel:  { fontSize: 11, color: DIM, width: 100 },
  infoValue:  { flex: 1, fontSize: 11, color: GRAY, lineHeight: 16 },

  histCard:  { backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORD, gap: 4, marginBottom: 6 },
  histTop:   { flexDirection: "row", gap: 8, alignItems: "center" },
  histFecha: { fontSize: 11, color: DIM },
  histPregunta: { fontSize: 12, fontWeight: "700", color: "#C8A037" },
  histSwatch: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  histLabel:  { fontSize: 11, color: GRAY },

  accionCard:    { backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORD, borderLeftWidth: 3, gap: 4, marginBottom: 6 },
  accionTipo:    { fontSize: 12, fontWeight: "700", color: TEXT },
  accionDesc:    { fontSize: 12, color: GRAY, lineHeight: 17 },
  accionPill:    { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  accionPillText:{ fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },

  accionAdd:     { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORD },
  accionAddText: { fontSize: 13, color: "#4A80BD", fontWeight: "600" },

  emptyText: { color: DIM, fontSize: 13, textAlign: "center", marginTop: 20 },

  secTitle: { fontSize: 12, fontWeight: "800", color: TEXT, letterSpacing: 0.3 },
  secSub:   { fontSize: 11, color: DIM, marginTop: 2 },

  editorCard:    { backgroundColor: "#111318", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", marginTop: 10 },
  editorTitle:   { fontSize: 14, fontWeight: "800", color: "#C8A037", marginRight: 6 },
  editorQ:       { flex: 1, fontSize: 11, color: DIM, lineHeight: 15 },
  editorLabel:   { fontSize: 10, fontWeight: "700", color: DIM, letterSpacing: 0.5, marginBottom: 6 },
  colorChip:     { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  colorChipText: { fontSize: 10, fontWeight: "700" },
  editorInput:   { backgroundColor: CARD, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORD, minHeight: 60, marginBottom: 12 },
  editorActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  editorCancel:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: BORD },
  editorCancelText: { color: DIM, fontSize: 13, fontWeight: "600" },
  editorSave:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: "#4A80BD" },
  editorSaveText:{ color: "#fff", fontSize: 13, fontWeight: "700" },
});
