import React, { useEffect, useRef, useState } from "react";
import type { TextInputInstance } from "react-native";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBusinessAccess } from "@/contexts/GoBusinessAccessContext";
import { captureAuthIdentity, isAuthIdentityCurrent } from "@/lib/authSession";
import { businessEnrollmentDraftKey, loadBusinessEnrollmentDraft, saveBusinessVerificationDraft, clearBusinessVerificationDraft } from "@/data/businessEnrollmentDraft";
import { businessDocumentLink, dossierStateLabels, executeVerification, getBusinessDossiers, getVerificationRequirements,
  uploadBusinessDocument, type BusinessDossier, type RequirementPolicy, type VerificationCommand } from "@/data/businessVerification";

const newId = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
  const value = Math.floor(Math.random() * 16);
  return (character === "x" ? value : (value & 3) | 8).toString(16);
});
type Form = { legal_name: string; tax_id: string; trading_name: string; address: string; activity: string };
const empty: Form = { legal_name: "", tax_id: "", trading_name: "", address: "", activity: "" };
const editable = (dossier?: BusinessDossier) => !dossier || ["draft", "documents_pending", "correction", "rejected"].includes(dossier.status);

export function BusinessDossierWorkspace({ admin = false, onClose, onLogout }: { admin?: boolean; onClose?: () => void; onLogout?: () => void }) {
  const access = useBusinessAccess();
  const [rows, setRows] = useState<BusinessDossier[]>([]);
  const [policies, setPolicies] = useState<RequirementPolicy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(access.snapshot?.business?.id ?? null);
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [policyActivity, setPolicyActivity] = useState("");
  const [policyLines, setPolicyLines] = useState("");
  const pending = useRef<VerificationCommand | null>(null);
  const mounted = useRef(true);
  const selected = rows.find(row => row.business_id === selectedId);
  const draftKey = access.snapshot?.userId ? `go_verification_form:${access.snapshot.userId}:${selectedId ?? "new"}` : null;
  const working = useRef(false);
  const inputs = useRef<Partial<Record<keyof Form, TextInputInstance>>>({});

  const load = async () => {
    const [dossiers, requirements] = await Promise.all([getBusinessDossiers(admin), getVerificationRequirements()]);
    if (mounted.current) { setRows(dossiers); setPolicies(requirements); setReady(true); }
    return dossiers;
  };
  useEffect(() => {
    mounted.current = true;
    void load().catch(() => { if (mounted.current) setError("No se pudo recuperar el expediente. Pulsa Actualizar."); });
    return () => { mounted.current = false; };
  }, [admin, access.snapshot?.userId]);
  useEffect(() => {
    let current = true;
    setReady(false);
    const initial = selected ? { legal_name: selected.legal_name.trim(), tax_id: selected.tax_id.trim(),
      trading_name: selected.trading_name, address: selected.address.trim(), activity: selected.activity } : empty;
    setForm(initial);
    void (async () => {
      if (!draftKey || admin) return null;
      const value = await AsyncStorage.getItem(draftKey);
      if (value) return value;
      const userId = access.snapshot?.userId;
      const legacy = userId ? await loadBusinessEnrollmentDraft(businessEnrollmentDraftKey(userId, selectedId ?? undefined)) : null;
      return legacy ? JSON.stringify({ ...legacy, activity: initial.activity }) : null;
    })().then(value => {
      if (!current) return;
      if (value) {
        const saved = JSON.parse(value);
        if (Object.keys(empty).every(key => typeof saved[key] === "string")) setForm(saved);
      }
      setReady(true);
    }).catch(() => { if (current) setError("No se pudo recuperar el borrador local."); });
    return () => { current = false; };
  }, [draftKey, selectedId, admin]);

  const run = async (operation: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    let identity: Awaited<ReturnType<typeof captureAuthIdentity>> = null;
    try {
      identity = await captureAuthIdentity();
      if (!identity) throw new Error("Inicia sesión.");
      await operation();
    } catch (issue) {
      if (mounted.current && (!identity || await isAuthIdentityCurrent(identity))) setError(issue instanceof Error ? issue.message : "No se completó la operación.");
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const command = async (value: Omit<VerificationCommand, "requestId">) => {
    const key = access.snapshot?.userId ? `go_verification_pending:${access.snapshot.userId}` : null;
    if (key && !pending.current) {
      const persisted = await AsyncStorage.getItem(key);
      if (persisted) pending.current = JSON.parse(persisted);
    }
    // Keep the exact command until acknowledged. A network retry never creates another business.
    if (pending.current && JSON.stringify({ ...pending.current, requestId: undefined }) !== JSON.stringify(value)) {
      throw new Error("Hay una operación pendiente. Reintenta la misma acción antes de cambiar los datos.");
    }
    pending.current ??= { ...value, requestId: newId() };
    if (key) await AsyncStorage.setItem(key, JSON.stringify(pending.current));
    let result: Awaited<ReturnType<typeof executeVerification>>;
    try { result = await executeVerification(pending.current); }
    catch (issue) {
      if ([400, 403, 409].includes((issue as { status?: number }).status ?? 0)) {
        pending.current = null;
        if (key) await AsyncStorage.removeItem(key);
      }
      throw issue;
    }
    pending.current = null;
    if (key) await AsyncStorage.removeItem(key);
    if (result.dossier && mounted.current) {
      setRows(previous => [...previous.filter(row => row.business_id !== result.dossier.business_id), result.dossier]);
      setSelectedId(result.dossier.business_id);
    }
    return result;
  };
  useEffect(() => {
    const user = access.snapshot?.userId;
    pending.current = null;
    if (!user) return;
    let active = true;
    void AsyncStorage.getItem(`go_verification_pending:${user}`).then(value => {
      if (active && value) pending.current = JSON.parse(value);
    }).catch(() => { if (active) setError("No se pudo recuperar la operación pendiente."); });
    return () => { active = false; };
  }, [access.snapshot?.userId]);

  const change = (key: keyof Form, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (draftKey) void saveBusinessVerificationDraft(draftKey, next).catch(() => setError("No se guardó el borrador local. Mantén abierto el formulario."));
  };
  const save = () => run(async () => {
    if (draftKey) await saveBusinessVerificationDraft(draftKey, form);
    const result = await command({ operation: "draft", ...(selected ? { businessId: selected.business_id, expectedRevision: selected.revision } : {}), data: form });
    if (draftKey) await clearBusinessVerificationDraft(draftKey, form);
    setForm({ legal_name: result.dossier.legal_name.trim(), tax_id: result.dossier.tax_id.trim(), trading_name: result.dossier.trading_name,
      address: result.dossier.address.trim(), activity: result.dossier.activity });
    // Refresh the authority only after the acknowledged business exists server-side.
    await access.refresh();
  });
  const attach = (requirementKey: string) => run(async () => {
    if (!selected || !editable(selected)) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], multiple: false, copyToCacheDirectory: true });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (asset.size !== undefined && asset.size > 10485760) throw new Error("El archivo supera el máximo de 10 MB.");
    const bytes = await new File(asset.uri).bytes();
    const unfinished = selected.documents.find(document => document.status === "uploading" && document.requirement_key === requirementKey
      && document.file_name === asset.name && document.mime_type === asset.mimeType && document.byte_size === bytes.length);
    const reserved = unfinished ? { documentId: unfinished.id, dossier: selected } : await command({ operation: "reserve_document", businessId: selected.business_id, expectedRevision: selected.revision,
      data: { requirementKey, fileName: asset.name, mimeType: asset.mimeType, byteSize: bytes.length } });
    if (!reserved.documentId) throw new Error("El servidor no confirmó el documento.");
    await uploadBusinessDocument(reserved.documentId, bytes);
    await command({ operation: "complete_document", businessId: selected.business_id, expectedRevision: reserved.dossier.revision, data: { documentId: reserved.documentId } });
  });
  const button = (label: string, action: () => void, enabled = true) => <TouchableOpacity key={label} accessibilityRole="button" disabled={busy || !enabled}
    onPress={action} style={[styles.button, (!enabled || busy) && { opacity: 0.45 }]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
  const configured = policies.find(policy => policy.activity === selected?.activity);
  const requirements = selected?.status === "pending" ? selected.requirements ?? [] : configured?.documents ?? [];

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Text style={styles.title}>{admin ? "Verificación empresarial" : "Mis empresas"}</Text>
    {busy && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {pending.current && button("Reintentar operación pendiente", () => void run(async () => {
      if (pending.current) { const { requestId: _requestId, ...value } = pending.current; await command(value); await load(); await access.refresh(); }
    }))}
    {button("Actualizar", () => void run(async () => { await load(); }))}
    {rows.map(row => button(`${row.name} · ${dossierStateLabels[row.status]}`, () => { setSelectedId(row.business_id); setReason(""); }))}
    {!admin && button("NUEVO NEGOCIO", () => { setSelectedId(null); setForm(empty); })}
    {selected && <View style={styles.box}>
      <Text style={styles.title}>{selected.name}</Text>
      <Text style={styles.text}>{dossierStateLabels[selected.status]}</Text>
      {!!selected.rejection_reason && <Text style={styles.error}>{selected.rejection_reason}</Text>}
    </View>}
    {!admin && editable(selected) && <View style={styles.box}>
      {([['legal_name', 'Nombre o razón social'], ['tax_id', 'NIF/CIF'], ['trading_name', 'Nombre comercial'], ['address', 'Dirección']] as const).map(([key, label], index, fields) => <View key={key}>
        <Text style={styles.text}>{label}</Text><TextInput ref={input => { inputs.current[key] = input ?? undefined; }} accessibilityLabel={label} style={styles.input} value={form[key]} editable={ready && !busy}
          returnKeyType={key === "address" ? "done" : "next"} blurOnSubmit={key === "address"}
          onSubmitEditing={() => { const next = fields[index + 1]?.[0]; if (next) inputs.current[next]?.focus(); }}
          maxLength={key === "address" ? 4000 : key === "tax_id" ? 32 : 200} onChangeText={value => change(key, value)} />
      </View>)}
      <Text style={styles.text}>Actividad del expediente</Text>
      {policies.map(policy => button(policy.activity === form.activity ? `✓ ${policy.activity}` : policy.activity, () => change("activity", policy.activity)))}
      {!policies.length && <Text style={styles.text}>ADMIN debe configurar los requisitos de esta actividad antes del envío. Puedes guardar el registro iniciado.</Text>}
      {button("Guardar progreso", () => void save(), ready)}
    </View>}
    {selected && <View style={styles.box}>
      <Text style={styles.title}>Documentación</Text>
      {requirements.map(requirement => <View key={requirement.key}>
        <Text style={styles.text}>{requirement.label}{requirement.required ? " · necesaria" : " · opcional"}</Text>
        {!admin && editable(selected) && button("Adjuntar / sustituir " + requirement.label, () => void attach(requirement.key))}
      </View>)}
      {selected.documents.filter(document => document.status !== "superseded").map(document => <View key={document.id}>
        <Text style={styles.text}>{document.file_name} · {document.status}</Text>
        {!!document.rejection_reason && <Text style={styles.error}>{document.rejection_reason}</Text>}
        {document.status !== "uploading" && button("Consultar " + document.file_name, () => void run(async () => { const link = await businessDocumentLink(document.id); await Linking.openURL(link.url); }))}
        {admin && selected.status === "pending" && document.status !== "uploading" && <View>
          {(["accepted", "rejected"] as const).map(status => button(status === "accepted" ? "Documento válido" : "Rechazar documento", () => void run(async () => {
            await command({ operation: "review_document", businessId: selected.business_id, expectedRevision: selected.revision, reason,
              data: { documentId: document.id, status } });
          }), !!reason.trim()))}
        </View>}
      </View>)}
      {!admin && editable(selected) && button("Enviar para verificación", () => void run(async () => {
        await command({ operation: "submit", businessId: selected.business_id, expectedRevision: selected.revision }); await access.refresh();
      }), !!configured)}
    </View>}
    {admin && selected && <View style={styles.box}>
      <Text style={styles.text}>{selected.legal_name} · {selected.tax_id}</Text><Text style={styles.text}>{selected.address}</Text>
      <TextInput style={styles.input} accessibilityLabel="Motivo de revisión" placeholder="Motivo de la decisión" value={reason} onChangeText={setReason} maxLength={1000} />
      {(selected.status === "pending" ? ["correction", "rejected", "authorized"] : selected.status === "authorized" ? ["suspended", "revoked"]
        : selected.status === "suspended" ? ["authorized", "revoked", "correction"] : selected.status === "revoked" ? ["correction"] : []).map(status => button(dossierStateLabels[status as keyof typeof dossierStateLabels], () => void run(async () => {
          await command({ operation: "decide", businessId: selected.business_id, expectedRevision: selected.revision, status: status as BusinessDossier["status"], reason });
        }), !!reason.trim()))}
      <Text style={styles.title}>Historial</Text>
      {selected.history.map(event => <Text key={event.id} style={styles.text}>{new Date(event.created_at).toLocaleString()} · {event.operation} · {event.to_status} · {event.reason ?? ""}{"\n"}{event.actor_id ? `Cuenta ${event.actor_id}` : "Migración de datos anteriores"}</Text>)}
    </View>}
    {admin && <View style={styles.box}>
      <Text style={styles.title}>Requisitos por actividad</Text>
      {policies.map(policy => button("Editar requisitos de " + policy.activity, () => { setPolicyActivity(policy.activity); setPolicyLines(policy.documents.map(document => `${document.key} | ${document.label} | ${document.required ? "necesaria" : "opcional"}`).join("\n")); }))}
      <TextInput accessibilityLabel="Actividad" style={styles.input} placeholder="Identificador de actividad" value={policyActivity} onChangeText={setPolicyActivity} autoCapitalize="none" />
      <Text style={styles.text}>Una línea por documento con clave | nombre | necesaria u opcional. Una lista vacía expresa que esta actividad no requiere documentos.</Text>
      <TextInput accessibilityLabel="Requisitos documentales" style={styles.input} multiline value={policyLines} onChangeText={setPolicyLines} />
      {button("Guardar requisitos", () => void run(async () => {
        const documents = policyLines.split("\n").filter(line => line.trim()).map(line => {
          const [key, label, required] = line.split("|").map(part => part.trim());
          if (!key || !label || !["necesaria", "opcional"].includes(required)) throw new Error("Revisa el formato de los requisitos.");
          return { key, label, required: required === "necesaria" };
        });
        await command({ operation: "requirements", data: { activity: policyActivity, documents, expectedVersion: policies.find(policy => policy.activity === policyActivity)?.version ?? 0 } }); await load();
      }), !!policyActivity)}
    </View>}
    {!admin && selected?.status === "authorized" && button("Administrar esta empresa", () => void run(async () => { await access.selectBusiness(selected.business_id); onClose?.(); }))}
    {onClose && button("Volver", onClose)}
    {onLogout && button("Cerrar sesión", onLogout)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 90, gap: 14, backgroundColor: "#F5F3EF", flexGrow: 1 },
  box: { padding: 14, gap: 12, backgroundColor: "#FFFFFF", borderRadius: 12 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" }, text: { color: "#374151", fontSize: 15 },
  error: { color: "#B91C1C" }, input: { minHeight: 46, borderWidth: 1, borderColor: "#6B7280", borderRadius: 8, padding: 10, color: "#111827" },
  button: { backgroundColor: "#E5E7EB", borderRadius: 10, padding: 13, minHeight: 46 }, buttonText: { color: "#111827", fontWeight: "600" },
});
