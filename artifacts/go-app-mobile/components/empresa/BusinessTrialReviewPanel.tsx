import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Share, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { supabaseApiRequest } from "@/data/booking";

type Document = { id: string; kind: string; file_name: string; mime_type: string; byte_size: number };
type Application = {
  business_id: string;
  status: string;
  accepted_at: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  review_notes?: string | null;
  verification: { legal_name: string; tax_id: string; trading_name: string; address: string } | null;
  documents: Document[];
};

export function BusinessTrialReviewPanel() {
  const [items, setItems] = useState<Application[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [image, setImage] = useState<string | null>(null);
  const refresh = async () => {
    setBusy(true); setError(null);
    try {
      const result = await supabaseApiRequest<Application[]>("/supabase/admin/trial/applications", {}, true);
      if (!Array.isArray(result)) throw new Error("La cola no se pudo leer.");
      setItems(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer la cola de empresas.");
    } finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const decide = async (businessId: string, action: "approve" | "changes" | "reject") => {
    if (busy || (action !== "approve" && (reason[businessId]?.trim().length ?? 0) < 3)) {
      setError("Escribe el motivo antes de solicitar cambios o rechazar."); return;
    }
    setBusy(true); setError(null);
    try {
      await supabaseApiRequest(`/supabase/admin/trial/applications/${businessId}/decision`, {
        method: "POST", body: JSON.stringify({ action, reason: reason[businessId]?.trim() ?? "" }),
      }, true);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la decisión."); }
    finally { setBusy(false); }
  };
  const viewDocument = async (doc: Document) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await supabaseApiRequest<{ name: string; mime_type: string; content_base64: string }>(
        `/supabase/admin/trial/documents/${doc.id}`, {}, true);
      if (!["application/pdf", "image/jpeg", "image/png"].includes(result.mime_type) || !result.content_base64) throw new Error("Archivo no válido.");
      if (result.mime_type !== "application/pdf") {
        setImage(`data:${result.mime_type};base64,${result.content_base64}`);
      } else {
        const uri = `${FileSystem.cacheDirectory}go-review-${doc.id}.pdf`;
        await FileSystem.writeAsStringAsync(uri, result.content_base64, { encoding: FileSystem.EncodingType.Base64 });
        try { await Share.share({ url: uri, title: "Revisar documentación GO" }); }
        finally { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo abrir el archivo."); }
    finally { setBusy(false); }
  };
  const button = (text: string, press: () => void, background = "#3D9A84") => <TouchableOpacity
    style={{ padding: 12, borderRadius: 9, backgroundColor: background, opacity: busy ? 0.5 : 1 }} disabled={busy} onPress={press}>
    <Text style={{ color: "white", fontWeight: "600" }}>{text}</Text>
  </TouchableOpacity>;
  return <View style={{ gap: 14 }}>
    <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Solicitudes reales de empresa</Text>
    {button("Actualizar cola", () => { void refresh(); }, "#46546B")}
    {busy && <ActivityIndicator />}
    {error && <Text style={{ color: "#FEA7A7" }}>{error}</Text>}
    {image && <View style={{ gap: 8 }}><Image source={{ uri: image }} resizeMode="contain" style={{ height: 300, width: "100%" }} />
      {button("Cerrar documento", () => setImage(null), "#46546B")}</View>}
    {!busy && !items.length && !error && <Text style={{ color: "#CBD5E1" }}>No hay solicitudes registradas.</Text>}
    {items.map(item => <View key={item.business_id} style={{ backgroundColor: "#20262E", padding: 14, borderRadius: 12, gap: 10 }}>
      <Text style={{ color: "white", fontWeight: "700" }}>{item.verification?.legal_name || "Empresa preparando documentación"}</Text>
      <Text style={{ color: "#CBD5E1" }}>Estado: {item.status} · Documentos: {item.documents.length}</Text>
      {item.verification && <>
        <Text style={{ color: "#CBD5E1" }}>NIF/CIF: {item.verification.tax_id}</Text>
        <Text style={{ color: "#CBD5E1" }}>Dirección: {item.verification.address}</Text>
      </>}
      {item.trial_ends_at && <Text style={{ color: "#CBD5E1" }}>Fin de prueba: {new Date(item.trial_ends_at).toLocaleDateString("es-ES")}</Text>}
      {item.documents.map(doc => <View key={doc.id} style={{ gap: 6 }}>
        <Text style={{ color: "#CBD5E1" }}>{doc.kind}: {doc.file_name}</Text>
        {button("Ver documento privado", () => { void viewDocument(doc); }, "#46546B")}
      </View>)}
      {item.status === "pending_review" && <>
        <TextInput placeholder="Motivo para solicitar correcciones o rechazar" placeholderTextColor="#9CA3AF"
          value={reason[item.business_id] ?? ""} maxLength={1000} multiline
          onChangeText={value => setReason(prev => ({ ...prev, [item.business_id]: value }))}
          style={{ backgroundColor: "white", borderRadius: 8, minHeight: 56, padding: 10 }} />
        {button("Aprobar y comenzar 30 días", () => { void decide(item.business_id, "approve"); })}
        {button("Solicitar cambios", () => { void decide(item.business_id, "changes"); }, "#8D6B24")}
        {button("Rechazar", () => { void decide(item.business_id, "reject"); }, "#9B4141")}
      </>}
      {!!item.review_notes && <Text style={{ color: "#CBD5E1" }}>Observaciones: {item.review_notes}</Text>}
    </View>)}
  </View>;
}
