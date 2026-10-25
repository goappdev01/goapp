import type { TextInputInstance } from "react-native";
import { OwnerContextModal as Modal } from "@/components/debug/OwnerContextIndicator";
import { notifySessionChanged, onSessionChanged } from "@/lib/sessionEvents";
import { saveAuthSession, clearAuthSession } from "@/lib/authSession";
import { getConfirmedRegistrationRole, PENDING_REGISTRATION_KEY, readPendingRegistration, type PendingRegistration } from "@/lib/registrationReturn";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  Linking,
  PanResponder,
  Platform,
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
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useGoView } from "@/contexts/GoViewContext";
import type { GoView } from "@/data/goViewPolicy";
import { AccountContextSelector } from "./AccountContextSelector";
import { PasswordInput } from "./PasswordInput";
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
const PUBLIC_ROLES: AccountRole[] = ["empresa", "usuario"];

const EMPRESA_ROLES: AccountRole[] = [
  "empresa", "trabajador", "proveedor", "partner", "franquicia",
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
      role: "empresa",
      icon: "briefcase",
      label: t("role_empresa_label"),
      sublabel: t("role_empresa_sub"),
      description: t("role_empresa_desc"),
      color: "#3D9A84",
    },
    {
      role: "usuario",
      icon: "user",
      label: t("role_usuario_label"),
      sublabel: t("role_usuario_sub"),
      description: t("role_usuario_desc"),
      color: "#4A80BD",
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
  onSwitchContext?: () => void;
  onOpenPerfil: () => void;
  onOpenEmpresa: () => void;
  // Verification (empresa accounts only)
  verification?: CuentaVerification;
  onOpenVerificacion?: () => void;
  // Internal admin entry point
  onOpenAdmin?: () => void;
  onSelectOwnerView?: (view: GoView) => Promise<boolean>;
}

const { width: SW } = Dimensions.get("window");

function authErrorMessage(payload: Record<string, unknown>, status: number, fallback: string): string {
  const message = String(payload.error_description ?? payload.msg ?? payload.message ?? payload.error ?? fallback);
  const code = payload.code ?? payload.error_code;
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "Correo o contraseña incorrectos.";
  }
  if (code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(message)) {
    return "Se ha alcanzado el límite temporal de envío de correos. Espera un poco y vuelve a intentarlo.";
  }
  return status === 429
    ? "Se ha alcanzado el límite temporal de solicitudes. Espera un poco y vuelve a intentarlo."
    : message;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LoginRegisterPanel({
  visible,
  onClose,
  userAccountType,
  onSetAccountType,
  onSwitchContext,
  onOpenPerfil,
  onOpenEmpresa,
  verification,
  onOpenVerificacion,
  onOpenAdmin,
  onSelectOwnerView,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const adminAccess = useAdminAccess();
  const goView = useGoView();
  const [viewBusy, setViewBusy] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const ownerSelectorIdentity = useRef<string | null>(null);
  if (goView.isOwner && adminAccess.userId) ownerSelectorIdentity.current = adminAccess.userId;
  else if (!adminAccess.checking || ownerSelectorIdentity.current !== adminAccess.userId) ownerSelectorIdentity.current = null;
  // Retain only presentation during revalidation; buttons require current authority.
  const ownerSelector = goView.isOwner || (!!adminAccess.userId && adminAccess.checking && ownerSelectorIdentity.current === adminAccess.userId);
  const chooseOwnerView = async (next: GoView) => {
    if (viewBusy || !goView.isOwner || !onSelectOwnerView) return;
    setViewBusy(true); setViewError(null);
    try {
      if (!await onSelectOwnerView(next)) setViewError(t("context_access_error"));
    } catch { setViewError(t("context_access_error")); }
    finally { setViewBusy(false); }
  };
  const [authStep, setAuthStep] = useState<"role" | "credentials">("role");
  const [ownerLogin, setOwnerLogin] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<AccountRole>("usuario");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const authRequestInFlightRef = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const passwordInputRef = useRef<TextInputInstance>(null);
  const authInputRevisionRef = useRef(0);
  const pendingRegistrationRef = useRef<PendingRegistration | null>(null);
  const authContextRef = useRef({ visible, userAccountType, onSetAccountType });
  authContextRef.current = { visible, userAccountType, onSetAccountType };

  const handleAuthEmailChange = (value: string) => {
    authInputRevisionRef.current++;
    setAuthEmail(value);
    setAuthError(null);
    if (pendingRegistrationRef.current && pendingRegistrationRef.current.email !== value.trim().toLowerCase()) {
      pendingRegistrationRef.current = null;
      AsyncStorage.removeItem(PENDING_REGISTRATION_KEY).catch(() => {});
    }
  };

  useEffect(() => {
    let cancelled = false;
    let returning = false;
    let leftApp = AppState.currentState === "background";
    const continueRegistration = async () => {
      const pending = pendingRegistrationRef.current;
      const context = authContextRef.current;
      if (cancelled || returning || !pending || !context.visible || context.userAccountType !== null) return;
      returning = true;
      try {
        const role = await getConfirmedRegistrationRole(pending);
        if (cancelled || pendingRegistrationRef.current !== pending || authContextRef.current.userAccountType !== null) return;
        await AsyncStorage.removeItem(PENDING_REGISTRATION_KEY).catch(() => {});
        if (cancelled || pendingRegistrationRef.current !== pending || authContextRef.current.userAccountType !== null) return;
        pendingRegistrationRef.current = null;
        setSelectedRole(pending.role);
        setAuthEmail(pending.email);
        setAuthPassword("");
        setAuthError(null);
        if (role) {
          notifySessionChanged();
          authContextRef.current.onSetAccountType(role);
          setAuthStep("role");
        } else {
          setAuthMode("login");
          setAuthStep("credentials");
        }
      } finally {
        returning = false;
      }
    };
    const appStateSubscription = AppState.addEventListener("change", nextState => {
      if (nextState === "background") leftApp = true;
      if (nextState === "active" && leftApp) {
        leftApp = false;
        void continueRegistration();
      }
    });
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      if (url.startsWith("go-app://")) void continueRegistration();
    });
    const unsubscribeSession = onSessionChanged(() => {
      pendingRegistrationRef.current = null;
      AsyncStorage.removeItem(PENDING_REGISTRATION_KEY).catch(() => {});
    });
    // Also restore the pending step if Expo Go reloads or an installed app
    // is launched again by the existing go-app:// confirmation page link.
    readPendingRegistration().then(pending => {
      if (cancelled || !pending || pendingRegistrationRef.current || authContextRef.current.userAccountType !== null) return;
      pendingRegistrationRef.current = pending;
      if (AppState.currentState === "active") void continueRegistration();
    });
    return () => {
      cancelled = true;
      appStateSubscription.remove();
      linkSubscription.remove();
      unsubscribeSession();
    };
  }, []);

  const ROLE_OPTIONS = getRoleOptions(t);
  const ownerOptions = (["ADMIN", "BUSINESS", "USER"] as const).map(view => ({
    id: view,
    label: t(view === "BUSINESS" ? "role_empresa_label" : view === "ADMIN" ? "role_admin_label" : "role_usuario_label"),
    icon: (view === "ADMIN" ? "shield" : view === "BUSINESS" ? "briefcase" : "user") as RoleOption["icon"],
    color: view === "ADMIN" ? "#C25A5A" : view === "BUSINESS" ? "#3D9A84" : "#4A80BD",
    sublabel: t(view === "ADMIN" ? "admin_internal_sub" : view === "BUSINESS" ? "context_business_preview" : "role_usuario_sub"),
    description: t(view === "ADMIN" ? "context_admin_description" : view === "BUSINESS" ? "context_business_description" : "role_usuario_desc"),
  }));

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
    setOwnerLogin(false);
    setSelectedRole(role);
    setAuthStep("credentials");
    setAuthError(null);
  };

  const handleAuthenticate = async () => {
    if (authRequestInFlightRef.current) return;
    const inputRevision = authInputRevisionRef.current;
    const email = authEmail.trim().toLowerCase();
    if (!email || authPassword.length < 8) {
      setAuthError("Introduce un email válido y una contraseña de al menos 8 caracteres.");
      return;
    }
    authRequestInFlightRef.current = true;
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
      if (inputRevision !== authInputRevisionRef.current) return;
      if (!response.ok) {
        const message = payload.error_description ?? payload.msg ?? payload.message ?? payload.error ?? "No se pudo autenticar la cuenta.";
        const emailRateLimit = (payload.code ?? payload.error_code) === "over_email_send_rate_limit"
          || /email rate limit exceeded/i.test(String(message));
        console.warn("[auth] Solicitud rechazada", { operation: authMode, httpStatus: response.status, emailRateLimit });
        throw new Error(authErrorMessage(payload, response.status, "No se pudo autenticar la cuenta."));
      }
      if (payload.access_token) {
        await saveAuthSession(payload);
      } else if (authMode === "register") {
        const pending = { email, role: selectedRole };
        pendingRegistrationRef.current = pending;
        // Persist only the pending navigation step, never a password.
        await AsyncStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(pending)).catch(() => {});
        setAuthError("Revisa tu correo para confirmar la cuenta y después inicia sesión.");
        return;
      }
      if (ownerLogin) {
        setAuthPassword("");
        let ownerGranted = false;
        if (payload.user?.id) {
          try {
            ownerGranted = await adminAccess.refreshOwner(payload.user.id, { reportUnavailable: true });
          } catch (error) {
            const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
            throw new Error(authErrorMessage({}, status, "No se pudo comprobar el acceso de propietario. Comprueba la conexión y vuelve a intentarlo."));
          }
        }
        if (!ownerGranted) throw new Error(t("owner_login_denied"));
      } else { onSetAccountType(selectedRole); }
      setAuthStep("role");
    } catch (error) {
      if (inputRevision === authInputRevisionRef.current) {
        setAuthError(error instanceof Error ? error.message : "No se pudo autenticar la cuenta.");
      }
    } finally {
      authRequestInFlightRef.current = false;
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
      if (!response.ok) throw new Error(authErrorMessage(payload, response.status, "No se pudo enviar el correo."));
      setAuthError("Si el email existe, recibirás instrucciones para restablecer la contraseña.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "No se pudo enviar el correo.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await clearAuthSession();
      onSetAccountType(null);
      setAuthPassword("");
      setAuthStep("role");
    } catch {
      setAuthError("No se pudo cerrar la sesión. Vuelve a intentarlo.");
    }
  };

  const currentOption = ROLE_OPTIONS.find(r => r.role === userAccountType);
  const accentColor   = currentOption?.color ?? "#4A80BD";
  const fabBottom     = insets.bottom + 24;

  const isEmpresa = goView.isOwner ? goView.view === "BUSINESS" : isEmpresaRole(userAccountType);
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
      <StatusBar style="dark" />
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
        {!ownerSelector && userAccountType === null && authStep === "credentials" && (
          <ScrollView style={s.scroll} contentContainerStyle={s.authScroll} keyboardShouldPersistTaps="always">
            <View style={s.authForm}>
              <View style={s.welcomeIcon}>
                <Feather name={selectedRole === "empresa" ? "briefcase" : "user"} size={28} color={selectedRole === "empresa" ? "#3D9A84" : "#4A80BD"} />
              </View>
              <Text style={s.welcomeTitle}>{authMode === "login" ? "Inicia sesión en GO" : "Crea tu cuenta GO"}</Text>
              <Text style={s.welcomeSub}>{ownerLogin ? t("owner_login_label") : selectedRole === "empresa" ? "Cuenta Empresa" : "Cuenta Usuario"}</Text>
              {authMode === "register" && (
                <TextInput value={authName} onChangeText={setAuthName} placeholder="Nombre completo" placeholderTextColor="#94A3B8" autoCapitalize="words" style={s.authInput} />
              )}
              <TextInput
                value={authEmail}
                onChangeText={handleAuthEmailChange}
                placeholder="Email"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType={Platform.OS === "ios" ? (authMode === "login" ? "username" : "emailAddress") : undefined}
                autoComplete={Platform.OS === "ios" ? undefined : (authMode === "login" ? "username" : "email")}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                style={s.authInput}
              />
              <PasswordInput
                key={`${authMode}:${selectedRole}:${ownerLogin ? "owner" : "account"}:${visible ? "open" : "closed"}`}
                testID="auth-password"
                ref={passwordInputRef}
                value={authPassword}
                onChangeText={setAuthPassword}
                placeholder="Contraseña (mínimo 8 caracteres)"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={Platform.OS === "ios" ? (authMode === "login" ? "password" : "newPassword") : undefined}
                autoComplete={Platform.OS === "ios" ? undefined : (authMode === "login" ? "current-password" : "new-password")}
                returnKeyType={authMode === "login" ? "go" : "done"}
                onSubmitEditing={authMode === "login" ? handleAuthenticate : undefined}
                style={s.authInput}
              />
              {authError && <Text style={s.authError}>{authError}</Text>}
              <TouchableOpacity onPress={handleAuthenticate} disabled={authBusy} activeOpacity={0.82} style={s.authPrimary}>
                {authBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.authPrimaryText}>{authMode === "login" ? "ENTRAR" : "CREAR CUENTA"}</Text>}
              </TouchableOpacity>
              {authMode === "login" && (
                <TouchableOpacity onPress={handleRecover} disabled={authBusy} style={s.authSwitch}>
                  <Text style={s.authSwitchText}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
              )}
              {!ownerLogin && <TouchableOpacity onPress={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(null); }} disabled={authBusy} style={s.authSwitch}>
                <Text style={s.authSwitchText}>{authMode === "login" ? "¿No tienes cuenta? Regístrate" : "Ya tengo una cuenta · Iniciar sesión"}</Text>
              </TouchableOpacity>}
              <TouchableOpacity onPress={() => setAuthStep("role")} disabled={authBusy} style={s.authBack}>
                <Feather name="arrow-left" size={15} color="#64748B" />
                <Text style={s.authBackText}>Cambiar tipo de cuenta</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── SETUP: no account ── */}
        {(ownerSelector || (userAccountType === null && authStep === "role")) && (
          <>
            <ScrollView
              style={s.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[s.welcomeScroll, { justifyContent: "flex-start", paddingHorizontal: 0, paddingBottom: userAccountType !== null ? fabBottom + 60 : insets.bottom + 28 }]}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[s.welcomeBlock, { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20 }]}>
                <View style={s.welcomeIcon}>
                  <Feather name="zap" size={28} color="#4A80BD" />
                </View>
                <Text style={s.welcomeTitle}>{t("welcome_go_title")}</Text>
                <Text style={s.welcomeSub}>{t("welcome_go_sub")}</Text>
                <Text style={s.footerNote}>
                  {t(ownerSelector ? "context_change_note" : "welcome_change_note")}
                </Text>
              </View>
              {ownerSelector && (
                <View style={{ marginTop: 24, gap: 12 }}>
                  <Text style={s.sectionLabelPad}>{t("context_active").replace("__CONTEXT__", ownerOptions.find(option => option.id === goView.view)?.label.toUpperCase() ?? "")}</Text>
                  <AccountContextSelector options={ownerOptions} selected={goView.view}
                    disabled={viewBusy || !goView.isOwner} testIDPrefix="owner-view"
                    onSelect={next => { void chooseOwnerView(next); }} />
                  <Text style={[s.actionSub, { paddingHorizontal: 20 }]}>{t("context_preview_notice")}</Text>
                  {(viewBusy || !goView.isOwner) && <ActivityIndicator accessibilityLabel={t("context_checking")} />}
                  {viewError && <Text accessibilityRole="alert" style={s.authError}>{viewError}</Text>}
                  <View style={[s.secondaryRow, { marginHorizontal: 20 }]}>
                    <TouchableOpacity onPress={() => { onOpenPerfil(); onClose(); }} style={s.secondaryBtn}>
                      <Text style={s.secondaryTxt}>{t("my_profile_label")}</Text>
                    </TouchableOpacity>
                    <View style={s.secondarySep} />
                    <TouchableOpacity onPress={handleLogout} style={s.secondaryBtn}>
                      <Text style={[s.secondaryTxt, { color: "#C25A5A" }]}>{t("sign_out")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {!ownerSelector && <View style={[s.bottomZone, { paddingBottom: 0, marginTop: 18 }]}>
              <Text style={s.sectionLabelPad}>{t("account_type_section")}</Text>
              <AccountContextSelector options={ROLE_OPTIONS.map(option => ({ ...option, id: option.role }))}
                testIDPrefix="account-role" onSelect={handleSelectRole} />
              </View>}
              {!ownerSelector && <TouchableOpacity testID="owner-direct-login" accessibilityRole="button" onPress={() => { setOwnerLogin(true); setAuthMode("login"); setAuthStep("credentials"); setAuthError(null); }} style={[s.secondaryBtn, { marginHorizontal: 20, marginTop: 12, padding: 14 }]}><Text style={s.secondaryTxt}>{t("owner_login_label")}</Text></TouchableOpacity>}
            </ScrollView>
          </>
        )}

        {/* ── ACTIVE ACCOUNT ── */}
        {userAccountType !== null && !ownerSelector && (
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
              {isEmpresa && !goView.isBusinessPreview && (
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

              {/* Technical ADMIN retains its private entry without owner controls. */}
              {adminAccess.allowed && !goView.isOwner && (
                <TouchableOpacity
                  onPress={() => { onOpenAdmin?.(); }}
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

              {/* Cambiar tipo · Cerrar sesión */}
              <View style={s.secondaryRow}>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onSwitchContext?.(); }}
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
        {userAccountType !== null && (
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
        )}

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
