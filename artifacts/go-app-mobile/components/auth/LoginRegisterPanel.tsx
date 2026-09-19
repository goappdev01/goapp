import { notifySessionChanged } from "@/lib/sessionEvents";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { DraggableFAB } from "../DraggableFAB";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CuentaVerification,
  VerificationStatus,
  verificationColor,
} from "@/data/cuenta";

// ── Types & constants ──────────────────────────────────────────────────────────

export type AccountRole =
  | "usuario"
  | "empresa"
  | "admin"
  | "trabajador"
  | "proveedor"
  | "partner"
  | "franquicia";

// Public-facing account types (shown in onboarding).
// Internal roles (admin, trabajador, proveedor, partner, franquicia)
// are assigned programmatically and never shown in public selection.
const PUBLIC_ROLES: AccountRole[] = ["usuario", "empresa"];

// ── INTERNAL ADMIN FLAG ────────────────────────────────────────────────────────
// Set to true to reveal the hidden ADMIN button in account type selection.
// Keep false in production. Replace with real permission check when ready.
export const IS_INTERNAL_ADMIN = true;

const EMPRESA_ROLES: AccountRole[] = [
  "empresa", "admin", "trabajador", "proveedor", "partner", "franquicia",
];

export function isEmpresaRole(role: AccountRole | null): boolean {
  return role !== null && EMPRESA_ROLES.includes(role);
}

interface RoleOption {
  role: AccountRole;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  sublabel: string;
  description: string;
  color: string;
}

function getRoleOptions(t: (k: import("@/i18n/translations").TranslationKey) => string): RoleOption[] {
  return [
    {
      role: "usuario",
      icon: "user",
      label: t("role_usuario_label"),
      sublabel: t("role_usuario_sub"),
      description: t("role_usuario_desc"),
      color: "#4A80BD",
    },
    {
      role: "empresa",
      icon: "briefcase",
      label: t("role_empresa_label"),
      sublabel: t("role_empresa_sub"),
      description: t("role_empresa_desc"),
      color: "#3D9A84",
    },
  ];
}

export const ROLE_LABELS: Record<AccountRole, string> = {
  usuario: "Usuario", empresa: "Empresa", admin: "Admin",
  trabajador: "Trabajador", proveedor: "Proveedor",
  partner: "Partner", franquicia: "Franquicia",
};

export const ROLE_ICONS: Record<AccountRole, React.ComponentProps<typeof Feather>["name"]> = {
  usuario: "user", empresa: "briefcase", admin: "shield",
  trabajador: "user-check", proveedor: "truck",
  partner: "share-2", franquicia: "globe",
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  userAccountType: AccountRole | null;
  onSetAccountType: (role: AccountRole | null) => void;
  onOpenPerfil: () => void;
  onOpenEmpresa: () => void;
  // Verification (empresa accounts only)
  verification?: CuentaVerification;
  onOpenVerificacion?: () => void;
  // Internal admin entry point
  onOpenAdmin?: () => void;
}

const { width: SW } = Dimensions.get("window");

// ── Component ──────────────────────────────────────────────────────────────────

export function LoginRegisterPanel({
  visible,
  onClose,
  userAccountType,
  onSetAccountType,
  onOpenPerfil,
  onOpenEmpresa,
  verification,
  onOpenVerificacion,
  onOpenAdmin,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [authStep, setAuthStep] = useState<"role" | "credentials">("role");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<AccountRole>("usuario");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const ROLE_OPTIONS = getRoleOptions(t);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Long-press guard + edge glow — evita cierres accidentales con pequeños arrastres
  const longPressArmedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeChargeAnim    = useRef(new Animated.Value(0)).current;
  const edgeArmedAnim     = useRef(new Animated.Value(0)).current;

  const _resetEdge = () => {
    edgeChargeAnim.stopAnimation();
    Animated.timing(edgeChargeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    Animated.timing(edgeArmedAnim,  { toValue: 0, duration: 200, useNativeDriver: true }).start();
  };
  const _cancelLP = () => {
    longPressArmedRef.current = false;
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    _resetEdge();
  };

  const rightSwipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        if (e.nativeEvent.pageX >= SW * 0.75) {
          longPressArmedRef.current = false;
          if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
          edgeChargeAnim.stopAnimation();
          Animated.timing(edgeChargeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
          longPressTimerRef.current = setTimeout(() => {
            longPressArmedRef.current = true;
            longPressTimerRef.current = null;
            Animated.spring(edgeArmedAnim, { toValue: 1, useNativeDriver: true }).start();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }, 700);
        } else {
          _cancelLP();
        }
        return false;
      },
      onMoveShouldSetPanResponderCapture: (e, g) => {
        if (!longPressArmedRef.current) {
          if (Math.abs(g.dy) > 15 || Math.abs(g.dx) > 15) _cancelLP();
          return false;
        }
        if (Math.abs(g.dy) <= 20 || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
        return e.nativeEvent.pageX >= SW * 0.75;
      },
      onPanResponderRelease: (_e, g) => {
        _cancelLP();
        if (g.dy > 80) onCloseRef.current();
      },
      onPanResponderTerminate: () => { _cancelLP(); },
    })
  ).current;

  const handleSelectRole = (role: AccountRole) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedRole(role);
    setAuthStep("credentials");
    setAuthError(null);
  };

  const handleAuthenticate = async () => {
    const email = authEmail.trim().toLowerCase();
    if (!email || authPassword.length < 8) {
      setAuthError("Introduce un email válido y una contraseña de al menos 8 caracteres.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api");
      const response = await fetch(`${apiBase}/supabase/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: authPassword,
          ...(authMode === "register" ? { full_name: authName.trim() || null, role: selectedRole } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error_description ?? payload.msg ?? payload.error ?? "No se pudo autenticar la cuenta.");
      if (payload.access_token) {
        await AsyncStorage.setItem("go_supabase_session_v1", JSON.stringify({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token ?? null,
          user: payload.user ?? null,
        }));
      } else if (authMode === "register") {
        setAuthError("Revisa tu correo para confirmar la cuenta y después inicia sesión.");
        return;
      }
      notifySessionChanged();
      onSetAccountType(selectedRole);
      setAuthStep("role");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "No se pudo autenticar la cuenta.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRecover = async () => {
    const email = authEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setAuthError("Introduce primero el email de tu cuenta.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api");
      const response = await fetch(`${apiBase}/supabase/auth/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error_description ?? payload.msg ?? payload.error ?? "No se pudo enviar el correo.");
      setAuthError("Si el email existe, recibirás instrucciones para restablecer la contraseña.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "No se pudo enviar el correo.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    AsyncStorage.removeItem("go_supabase_session_v1").then(notifySessionChanged).catch(() => {});
    onSetAccountType(null);
    setAuthStep("role");
    onClose();
  };

  const currentOption = ROLE_OPTIONS.find(r => r.role === userAccountType);
  const accentColor   = currentOption?.color ?? "#4A80BD";
  const fabBottom     = insets.bottom + 24;

  const isEmpresa = isEmpresaRole(userAccountType);
  const vStatus   = verification?.status ?? "none";
  const vColor    = verificationColor(vStatus);
  const vLabel    = vStatus === "verified" ? t("verif_status_verified")
                  : vStatus === "pending"  ? t("verif_status_pending")
                  : vStatus === "rejected" ? t("verif_status_rejected")
                  : t("verif_empresa_basica");

  // Translated display labels for account roles (ROLE_LABELS is kept as-is
  // for internal use across the app; this map is only for UI display here).
  const translatedRoleLabel: Record<AccountRole, string> = {
    usuario:    t("role_usuario_label"),
    empresa:    t("role_empresa_label"),
    admin:      t("role_admin_label"),
    trabajador: t("role_trabajador_label"),
    proveedor:  t("role_proveedor_label"),
    partner:    t("role_partner_label"),
    franquicia: t("role_franquicia_label"),
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <View style={[s.root, { paddingTop: insets.top }]} {...rightSwipePan.panHandlers}>

        {/* Zona de cierre — brillo derecho durante long-press */}
        <Animated.View pointerEvents="none" style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: 72,
          opacity: edgeChargeAnim,
        }}>
          <LinearGradient
            colors={["transparent", "rgba(74,128,189,0.38)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View pointerEvents="none" style={{
          position: "absolute", right: 14, top: 0, bottom: 0,
          alignItems: "center", justifyContent: "center",
          opacity: edgeArmedAnim, transform: [{ scale: edgeArmedAnim }],
        }}>
          <View style={{ width: 36, height: 36, borderRadius: 18,
            backgroundColor: "#4A80BD", borderWidth: 2.5, borderColor: "#fff",
            alignItems: "center", justifyContent: "center",
            shadowColor: "#4A80BD", shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
          }}>
            <Feather name="chevron-down" size={16} color="#fff" />
          </View>
        </Animated.View>

        {/* Handle pill */}
        <View style={s.handleZone}>
          <View style={s.handlePill} />
        </View>

        {/* Compact header */}
        <View style={s.header}>
          <View style={s.goPill}>
            <Feather name="zap" size={12} color="#4A80BD" />
            <Text style={s.goPillTxt}>GO</Text>
          </View>
          {userAccountType !== null && (
            <View style={[s.rolePill, { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}40` }]}>
              <View style={[s.roleDot, { backgroundColor: accentColor }]} />
              <Text style={[s.rolePillTxt, { color: accentColor }]}>
                {(translatedRoleLabel[userAccountType] ?? ROLE_LABELS[userAccountType]).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* ── AUTH: credentials ── */}
        {userAccountType === null && authStep === "credentials" && (
          <ScrollView style={s.scroll} contentContainerStyle={s.authScroll} keyboardShouldPersistTaps="handled">
            <View style={s.authForm}>
              <View style={s.welcomeIcon}>
                <Feather name={selectedRole === "empresa" ? "briefcase" : "user"} size={28} color={selectedRole === "empresa" ? "#3D9A84" : "#4A80BD"} />
              </View>
              <Text style={s.welcomeTitle}>{authMode === "login" ? "Inicia sesión en GO" : "Crea tu cuenta GO"}</Text>
              <Text style={s.welcomeSub}>{selectedRole === "empresa" ? "Cuenta Empresa" : "Cuenta Usuario"}</Text>
              {authMode === "register" && (
                <TextInput value={authName} onChangeText={setAuthName} placeholder="Nombre completo" placeholderTextColor="#94A3B8" autoCapitalize="words" style={s.authInput} />
              )}
              <TextInput value={authEmail} onChangeText={setAuthEmail} placeholder="Email" placeholderTextColor="#94A3B8" autoCapitalize="none" keyboardType="email-address" style={s.authInput} />
              <TextInput value={authPassword} onChangeText={setAuthPassword} placeholder="Contraseña (mínimo 8 caracteres)" placeholderTextColor="#94A3B8" secureTextEntry style={s.authInput} />
              {authError && <Text style={s.authError}>{authError}</Text>}
              <TouchableOpacity onPress={handleAuthenticate} disabled={authBusy} activeOpacity={0.82} style={s.authPrimary}>
                {authBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.authPrimaryText}>{authMode === "login" ? "ENTRAR" : "CREAR CUENTA"}</Text>}
              </TouchableOpacity>
              {authMode === "login" && (
                <TouchableOpacity onPress={handleRecover} disabled={authBusy} style={s.authSwitch}>
                  <Text style={s.authSwitchText}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(null); }} disabled={authBusy} style={s.authSwitch}>
                <Text style={s.authSwitchText}>{authMode === "login" ? "¿No tienes cuenta? Regístrate" : "Ya tengo una cuenta · Iniciar sesión"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuthStep("role")} disabled={authBusy} style={s.authBack}>
                <Feather name="arrow-left" size={15} color="#64748B" />
                <Text style={s.authBackText}>Cambiar tipo de cuenta</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── SETUP: no account ── */}
        {userAccountType === null && authStep === "role" && (
          <>
            <ScrollView
              style={s.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.welcomeScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.welcomeBlock}>
                <View style={s.welcomeIcon}>
                  <Feather name="zap" size={28} color="#4A80BD" />
                </View>
                <Text style={s.welcomeTitle}>{t("welcome_go_title")}</Text>
                <Text style={s.welcomeSub}>{t("welcome_go_sub")}</Text>
                <Text style={s.footerNote}>
                  {t("welcome_change_note")}
                </Text>
              </View>
            </ScrollView>

            {/* Fixed bottom zone — ONLY public types */}
            <View style={[s.bottomZone, { paddingBottom: insets.bottom + 28 }]}>
              <Text style={s.sectionLabelPad}>{t("account_type_section")}</Text>
              <View style={s.roleGrid}>
                {ROLE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.role}
                    onPress={() => handleSelectRole(opt.role)}
                    activeOpacity={0.78}
                    style={[s.roleCard, { borderColor: `${opt.color}35` }]}
                  >
                    <View style={[s.roleCardIcon, { backgroundColor: `${opt.color}14` }]}>
                      <Feather name={opt.icon} size={22} color={opt.color} />
                    </View>
                    <Text style={s.roleCardLabel}>{opt.label}</Text>
                    <Text style={s.roleCardSub}>{opt.sublabel}</Text>
                    <Text style={s.roleCardDesc}>{opt.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ADMIN — only visible when IS_INTERNAL_ADMIN = true */}
              {IS_INTERNAL_ADMIN && (
                <TouchableOpacity
                  onPress={() => { onOpenAdmin?.(); onClose(); }}
                  activeOpacity={0.78}
                  style={s.adminCard}
                >
                  <View style={s.adminCardLeft}>
                    <View style={s.adminCardIcon}>
                      <Feather name="shield" size={18} color="#ef4444" />
                    </View>
                    <View>
                      <Text style={s.adminCardLabel}>ADMIN</Text>
                      <Text style={s.adminCardSub}>{t("admin_internal_sub")}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* ── ACTIVE ACCOUNT ── */}
        {userAccountType !== null && (
          <View style={{ flex: 1 }}>

            {/* ── TOP: spacer visual — nada interactivo arriba ── */}
            <View style={{ flex: 1 }} />

            {/* ── BOTTOM DOCK: zona del pulgar — todo lo pulsable vive aquí ── */}
            <View style={[s.actionDock, { paddingBottom: fabBottom + 16 }]}>

              {/* Account card — identidad compacta */}
              <View style={[s.accountCard, { borderColor: `${accentColor}30` }]}>
                <View style={[s.accountIcon, { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}30` }]}>
                  <Feather name={currentOption?.icon ?? "user"} size={24} color={accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.accountName}>{translatedRoleLabel[userAccountType] ?? ROLE_LABELS[userAccountType]}</Text>
                  <Text style={s.accountSub}>{currentOption?.sublabel ?? t("active_account_in_go")}</Text>
                </View>
                <View style={[s.accountBadge, { backgroundColor: `${accentColor}12`, borderColor: `${accentColor}35` }]}>
                  <Text style={[s.accountBadgeTxt, { color: accentColor }]}>{t("active_badge")}</Text>
                </View>
              </View>

              {/* Verification status for empresa accounts */}
              {isEmpresa && (
                <TouchableOpacity
                  style={[s.verificCard, { borderColor: `${vColor}28` }]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpenVerificacion?.(); onClose(); }}
                  activeOpacity={0.82}
                >
                  <View style={[s.verificIcon, { backgroundColor: `${vColor}10` }]}>
                    <Feather
                      name={
                        vStatus === "verified"  ? "check-circle"
                        : vStatus === "pending" ? "clock"
                        : vStatus === "rejected"? "x-circle"
                        : "shield"
                      }
                      size={20}
                      color={vColor}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.verificTitle, { color: vColor }]}>{vLabel}</Text>
                    <Text style={s.verificSub}>
                      {vStatus === "verified"  ? t("verif_full_access")
                      : vStatus === "pending"  ? t("verif_reviewing")
                      : vStatus === "rejected" ? t("verif_reverify")
                      : t("verif_activate_public")}
                    </Text>
                  </View>
                  {vStatus !== "verified" && (
                    <View style={[s.verificCTA, { backgroundColor: `${vColor}12`, borderColor: `${vColor}30` }]}>
                      <Text style={[s.verificCTATxt, { color: vColor }]}>
                        {vStatus === "pending" ? t("verif_see_status") : t("verif_verify")}
                      </Text>
                    </View>
                  )}
                  {vStatus === "verified" && (
                    <Feather name="check" size={16} color={vColor} />
                  )}
                </TouchableOpacity>
              )}

              {/* ACCESO RÁPIDO */}
              <Text style={s.sectionLabel}>{t("quick_access_section")}</Text>
              <View style={s.actionGrid}>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpenPerfil(); onClose(); }}
                  activeOpacity={0.8}
                  style={[s.actionCard, { borderColor: "rgba(74,128,189,0.25)", backgroundColor: "rgba(74,128,189,0.05)" }]}
                >
                  <View style={[s.actionIcon, { backgroundColor: "#4A80BD18" }]}>
                    <Feather name="user" size={20} color="#4A80BD" />
                  </View>
                  <Text style={s.actionLabel}>{t("my_profile_label")}</Text>
                  <Text style={s.actionSub}>{t("account_and_settings")}</Text>
                </TouchableOpacity>

                {isEmpresa ? (
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpenEmpresa(); onClose(); }}
                    activeOpacity={0.8}
                    style={[s.actionCard, { borderColor: "rgba(61,154,132,0.25)", backgroundColor: "rgba(61,154,132,0.05)" }]}
                  >
                    <View style={[s.actionIcon, { backgroundColor: "#3D9A8418" }]}>
                      <Feather name="briefcase" size={20} color="#3D9A84" />
                    </View>
                    <Text style={s.actionLabel}>{t("my_company_label")}</Text>
                    <Text style={s.actionSub}>{t("professional_panel")}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.actionCardEmpty} />
                )}
              </View>

              {/* Cambiar tipo · Cerrar sesión */}
              <View style={s.secondaryRow}>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onSetAccountType(null); }}
                  activeOpacity={0.8}
                  style={s.secondaryBtn}
                >
                  <Feather name="refresh-cw" size={14} color="#6B7280" />
                  <Text style={s.secondaryTxt}>{t("change_type_label")}</Text>
                </TouchableOpacity>
                <View style={s.secondarySep} />
                <TouchableOpacity
                  onPress={handleLogout}
                  activeOpacity={0.8}
                  style={s.secondaryBtn}
                >
                  <Feather name="log-out" size={14} color="#C25A5A" />
                  <Text style={[s.secondaryTxt, { color: "#C25A5A" }]}>{t("sign_out")}</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        )}

        {/* FAB close — draggable, posición guardada por pantalla */}
        <DraggableFAB
          screenKey="login-register"
          buttonKey="main"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={40}
        >
          <TouchableOpacity onPress={onClose} activeOpacity={0.8} hitSlop={8} style={s.fabBtn}>
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.04)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={s.edgeHint}
        />
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const CARD_BG = "#FFFFFF";
const BORDER  = "rgba(0,0,0,0.07)";
const TEXT    = "#111827";
const DIM     = "#9CA3AF";
const GRAY    = "#6B7280";
const ROOT_BG = "#F5F3EF";
const PAD     = 20;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: ROOT_BG },

  handleZone: { paddingTop: 10, paddingBottom: 4, alignItems: "center" },
  handlePill: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.12)" },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: PAD, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD_BG, gap: 10,
  },
  goPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, backgroundColor: "rgba(74,128,189,0.10)",
    borderWidth: 1, borderColor: "rgba(74,128,189,0.22)",
  },
  goPillTxt:   { color: "#4A80BD", fontSize: 12, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1.5 },
  rolePill:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  roleDot:     { width: 6, height: 6, borderRadius: 3 },
  rolePillTxt: { fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", letterSpacing: 1.2 },

  scroll: { flex: 1 },

  welcomeScroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: PAD, paddingVertical: PAD },
  welcomeBlock:  { alignItems: "center", gap: 10 },
  welcomeIcon:   {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "rgba(74,128,189,0.10)",
    borderWidth: 1.5, borderColor: "rgba(74,128,189,0.22)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  welcomeTitle: { color: TEXT, fontSize: 26, fontFamily: "Inter_700Bold", fontWeight: "800", letterSpacing: -0.4 },
  welcomeSub:   { color: DIM, fontSize: 16, fontWeight: "600", textAlign: "center" },
  footerNote:   { color: "rgba(0,0,0,0.22)", fontSize: 11, textAlign: "center", marginTop: 12, lineHeight: 17 },

  // Fixed bottom zone
  bottomZone: {
    backgroundColor: ROOT_BG,
    borderTopWidth: 1, borderTopColor: BORDER,
    paddingTop: 18,
  },
  sectionLabel:    { color: DIM, fontSize: 10, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1.8, marginBottom: 12, marginTop: 4, paddingHorizontal: PAD },
  sectionLabelPad: { color: DIM, fontSize: 10, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1.8, marginBottom: 12, paddingHorizontal: PAD },

  // Public role grid — 2 columns, taller cards with description
  roleGrid: { flexDirection: "row", gap: 10, marginBottom: 4, paddingHorizontal: PAD },
  roleCard: {
    flex: 1,
    backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1.5,
    padding: 18, gap: 6, alignItems: "flex-start",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  roleCardIcon:  { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  roleCardLabel: { color: TEXT, fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "800" },
  roleCardSub:   { color: DIM, fontSize: 11, fontWeight: "600" },
  roleCardDesc:  { color: "rgba(0,0,0,0.35)", fontSize: 11, lineHeight: 16, marginTop: 4 },

  // Admin entry — hidden row below role grid
  adminCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: PAD, marginTop: 10,
    backgroundColor: "rgba(239,68,68,0.05)", borderRadius: 14, borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)", padding: 14,
  },
  adminCardLeft:  { flexDirection: "row", alignItems: "center", gap: 12 },
  adminCardIcon:  { width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(239,68,68,0.10)", alignItems: "center", justifyContent: "center" },
  adminCardLabel: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#ef4444", letterSpacing: 0.5 },
  adminCardSub:   { fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginTop: 1 },

  // Account card
  accountCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1.5,
    padding: 16, marginBottom: 10,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  accountIcon:     { width: 48, height: 48, borderRadius: 15, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  accountName:     { color: TEXT, fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "800", letterSpacing: -0.2 },
  accountSub:      { color: DIM, fontSize: 12, fontWeight: "500", marginTop: 2 },
  accountBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  accountBadgeTxt: { fontSize: 9, fontFamily: "Inter_700Bold", fontWeight: "800", letterSpacing: 1.2 },

  // Verification card
  verificCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1.5,
    padding: 14, marginBottom: 20,
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  verificIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  verificTitle:  { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "800", letterSpacing: 0.1, marginBottom: 2 },
  verificSub:    { color: DIM, fontSize: 11, lineHeight: 15 },
  verificCTA: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, flexShrink: 0,
  },
  verificCTATxt: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800" },

  // Bottom action dock — zona del pulgar
  actionDock: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: "#F5F3EF",
  },

  // Action grid
  actionGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  actionCard: {
    flex: 1, backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1.5,
    paddingVertical: 20, paddingHorizontal: 14, gap: 8, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  actionCardEmpty: { flex: 1 },
  actionIcon:      { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel:     { color: TEXT, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", textAlign: "center" },
  actionSub:       { color: DIM, fontSize: 11, fontWeight: "500", textAlign: "center" },

  // Secondary actions
  secondaryRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD_BG, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, overflow: "hidden", marginTop: 4,
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 16 },
  secondaryTxt: { color: GRAY, fontSize: 13, fontWeight: "600" },
  secondarySep: { width: 1, height: 24, backgroundColor: BORDER },
  authScroll: { flex: 1, paddingHorizontal: 24, paddingTop: 36 },
  authForm: { width: "100%", maxWidth: 420, alignSelf: "center", alignItems: "center", gap: 12 },
  authInput: { width: "100%", backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: "#0F172A", fontSize: 15 },
  authError: { color: "#B91C1C", fontSize: 12, lineHeight: 18, textAlign: "center" },
  authPrimary: { width: "100%", minHeight: 50, borderRadius: 14, backgroundColor: "#4A80BD", alignItems: "center", justifyContent: "center", marginTop: 4 },
  authPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 1.1 },
  authSwitch: { alignItems: "center", paddingVertical: 6 },
  authSwitchText: { color: "#4A80BD", fontSize: 13, fontWeight: "700", textAlign: "center" },
  authBack: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  authBackText: { color: "#64748B", fontSize: 12, fontWeight: "600" },

  // FAB
  fabBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.40,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },

  edgeHint: { position: "absolute", right: 0, top: "40%", bottom: 0, width: "25%" },
});
