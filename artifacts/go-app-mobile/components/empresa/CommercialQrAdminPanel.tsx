import React, { useEffect, useRef, useState } from "react";
import { Alert, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useGoView } from "@/contexts/GoViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { newSupportRequestKey } from "@/lib/supportRequests";
import {
  authorizePhysicalQr, createCommercialQrBatch, getAdminCommercialSupplier, getCommercialQrBatch,
  revokePhysicalQr, setCommercialSupplierUrl,
  shareCommercialPoster,
  type CommercialQrBatch,
} from "@/data/commercialQr";

const panel = { backgroundColor: "#1A1B1F", borderRadius: 16, borderWidth: 1, borderColor: "#454650", padding: 16, gap: 12 } as const;
const input = { color: "#fff", borderWidth: 1, borderColor: "#60616A", borderRadius: 10, paddingHorizontal: 12, minHeight: 44 } as const;
const button = { backgroundColor: "#D8A83C", borderRadius: 10, padding: 12, minHeight: 44, alignItems: "center", justifyContent: "center" } as const;

export function CommercialQrAdminPanel() {
  const admin = useAdminAccess();
  const view = useGoView();
  const { lang } = useLanguage();
  const en = lang === "en";
  const [quantity, setQuantity] = useState("20");
  const [batchId, setBatchId] = useState("");
  const [batch, setBatch] = useState<CommercialQrBatch | null>(null);
  const [reference, setReference] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pendingCreation = useRef<{ quantity: number; requestId: string } | null>(null);
  const [supplierUrl, setSupplierUrl] = useState("");
  const [supplierEnabled, setSupplierEnabled] = useState(false);
  useEffect(() => { setBatch(null); setBatchId(""); setReference(""); setBusinessId(""); setReason(""); pendingCreation.current = null; }, [admin.userId]);
  useEffect(() => {
    if (!admin.userId || !admin.isOwner || !view.isAdminView) return;
    let current = true;
    void getAdminCommercialSupplier(admin.userId).then(value => { if (current) { setSupplierUrl(value.url); setSupplierEnabled(value.enabled); } }).catch(() => {});
    return () => { current = false; };
  }, [admin.userId, admin.isOwner, view.isAdminView]);
  if (!admin.isOwner || !view.isAdminView || admin.checking || !admin.userId) return null;
  const userId = admin.userId;

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice("");
    try { await work(); } catch { setNotice(en ? "The QR operation failed. Nothing is confirmed." : "La operación QR ha fallado. No hay ningún cambio confirmado."); }
    finally { setBusy(false); }
  };
  const makeBatch = () => {
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 1000) { setNotice(en ? "Enter 1 to 1000." : "Introduce entre 1 y 1000."); return; }
    Alert.alert(en ? "Create unique QR batch" : "Crear lote de QR únicos", `${count} QR`, [
      { text: en ? "Cancel" : "Cancelar", style: "cancel" },
      { text: en ? "Create" : "Crear", onPress: () => { void run(async () => {
        if (!pendingCreation.current || pendingCreation.current.quantity !== count)
          pendingCreation.current = { quantity: count, requestId: newSupportRequestKey() };
        const result = await createCommercialQrBatch(count, pendingCreation.current.requestId, userId);
        pendingCreation.current = null;
        setBatch(result); setBatchId(result.batchId);
        setNotice(en ? "Batch created. Save its identifier to retrieve it later." : "Lote creado. Conserva su identificador para recuperarlo después.");
      }); } },
    ]);
  };
  const authorize = () => {
    if (!reference.trim() || !businessId.trim() || reason.trim().length < 3) { setNotice(en ? "Enter code, company ID and reason." : "Introduce código, ID de empresa y motivo."); return; }
    Alert.alert(en ? "Authorize physical QR" : "Autorizar QR físico", `${reference.trim().toUpperCase()} → ${businessId.trim()}`, [
      { text: en ? "Cancel" : "Cancelar", style: "cancel" },
      { text: en ? "Authorize" : "Autorizar", onPress: () => { void run(async () => {
        await authorizePhysicalQr(reference.trim(), businessId.trim(), reason.trim(), userId);
        setNotice(en ? "Authorized. The company owner must confirm assignment." : "Autorizado. El titular de la empresa debe confirmar la asignación.");
        if (batch) setBatch(await getCommercialQrBatch(batch.batchId, userId));
      }); } },
    ]);
  };
  const revoke = () => {
    if (!reference.trim() || reason.trim().length < 3) { setNotice(en ? "Enter code and reason." : "Introduce código y motivo."); return; }
    Alert.alert(en ? "Revoke physical QR" : "Revocar QR físico", reference.trim().toUpperCase(), [
      { text: en ? "Cancel" : "Cancelar", style: "cancel" },
      { text: en ? "Revoke" : "Revocar", style: "destructive", onPress: () => { void run(async () => {
        await revokePhysicalQr(reference.trim(), reason.trim(), userId);
        setNotice(en ? "Revoked; the printed QR no longer opens a company." : "Revocado; el QR impreso ya no abre ninguna empresa.");
        if (batch) setBatch(await getCommercialQrBatch(batch.batchId, userId));
      }); } },
    ]);
  };

  return <View style={panel}>
    <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>{en ? "Physical commercial QR" : "QR comerciales físicos"}</Text>
    <Text style={{ color: "#D5D5DC" }}>{en ? "Each code stays unassigned until ADMIN authorizes a company and its owner confirms." : "Cada código queda sin asignar hasta que ADMIN autoriza una empresa y su titular confirma."}</Text>
    <Text style={{ color: "#fff" }}>{en ? "Quantity" : "Cantidad"}</Text>
    <TextInput accessibilityLabel={en ? "Batch quantity" : "Cantidad del lote"} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" style={input} editable={!busy} />
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={makeBatch} style={button}><Text style={{ color: "#10151F", fontWeight: "700" }}>{en ? "Create batch" : "Crear lote"}</Text></TouchableOpacity>
    <Text style={{ color: "#fff" }}>{en ? "Existing batch ID" : "ID de lote existente"}</Text>
    <TextInput accessibilityLabel={en ? "Existing batch ID" : "ID de lote existente"} value={batchId} onChangeText={setBatchId} autoCapitalize="none" style={input} editable={!busy} />
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { setBatch(null); void run(async () => setBatch(await getCommercialQrBatch(batchId.trim(), userId))); }} style={button}><Text style={{ color: "#10151F", fontWeight: "700" }}>{en ? "Retrieve batch" : "Recuperar lote"}</Text></TouchableOpacity>
    {batch && <View style={{ gap: 4 }}><Text style={{ color: "#fff", fontWeight: "700" }}>{batch.quantity} QR · {batch.batchId}</Text>
      {batch.codes.slice(0, 20).map(item => <TouchableOpacity key={item.inventoryId} accessibilityRole="button" onPress={() => setReference(item.inventoryId)}><Text style={{ color: "#D5D5DC" }}>{item.inventoryId} · {item.state ?? "unassigned"}</Text></TouchableOpacity>)}
      {batch.codes.length > 20 && <Text style={{ color: "#D5D5DC" }}>{en ? "First 20 shown. Enter any inventory ID below." : "Se muestran los primeros 20. Introduce cualquier ID de inventario abajo."}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { void run(async () => {
        await shareCommercialPoster("batch", batch.batchId, userId);
      }); }} style={button}><Text style={{ color: "#10151F", fontWeight: "700" }}>{en ? "Share four-up A4 PDF" : "Compartir PDF A4, cuatro por hoja"}</Text></TouchableOpacity>
    </View>}
    <Text style={{ color: "#fff" }}>{en ? "Code or inventory ID" : "Código o ID de inventario"}</Text>
    <TextInput accessibilityLabel={en ? "Physical QR code" : "Código QR físico"} value={reference} onChangeText={setReference} autoCapitalize="characters" style={input} editable={!busy} />
    <Text style={{ color: "#fff" }}>{en ? "Company ID for authorization" : "ID de empresa para autorización"}</Text>
    <TextInput accessibilityLabel={en ? "Company ID" : "ID de empresa"} value={businessId} onChangeText={setBusinessId} autoCapitalize="none" style={input} editable={!busy} />
    <Text style={{ color: "#fff" }}>{en ? "Audit reason" : "Motivo para auditoría"}</Text>
    <TextInput accessibilityLabel={en ? "Audit reason" : "Motivo para auditoría"} value={reason} onChangeText={setReason} maxLength={500} style={input} editable={!busy} />
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={authorize} style={button}><Text style={{ color: "#10151F", fontWeight: "700" }}>{en ? "Authorize company" : "Autorizar empresa"}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={revoke} style={[button, { backgroundColor: "#A64141" }]}><Text style={{ color: "#fff", fontWeight: "700" }}>{en ? "Revoke code" : "Revocar código"}</Text></TouchableOpacity>
    <Text style={{ color: "#fff", fontWeight: "700", marginTop: 10 }}>{en ? "A6 support supplier" : "Proveedor de soporte A6"}</Text>
    <TextInput accessibilityLabel={en ? "Supplier product URL" : "URL del producto del proveedor"} value={supplierUrl} onChangeText={setSupplierUrl} autoCapitalize="none" keyboardType="url" style={input} editable={!busy} />
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ color: "#fff" }}>{en ? "Show supplier link" : "Mostrar enlace al proveedor"}</Text>
      <Switch accessibilityLabel={en ? "Show supplier link" : "Mostrar enlace al proveedor"} value={supplierEnabled} onValueChange={setSupplierEnabled} disabled={busy} />
    </View>
    <TouchableOpacity accessibilityRole="button" disabled={busy || !supplierUrl.trim()} onPress={() => {
      Alert.alert(en ? "Save supplier" : "Guardar proveedor", supplierUrl.trim(), [
        { text: en ? "Cancel" : "Cancelar", style: "cancel" },
        { text: en ? "Save" : "Guardar", onPress: () => { void run(async () => {
          await setCommercialSupplierUrl(supplierUrl.trim(), supplierEnabled, userId);
          setNotice(en ? "Supplier link saved." : "Enlace del proveedor guardado.");
        }); } },
      ]);
    }} style={button}><Text style={{ color: "#10151F", fontWeight: "700" }}>{en ? "Save supplier" : "Guardar proveedor"}</Text></TouchableOpacity>
    {notice ? <Text accessibilityRole="alert" style={{ color: "#fff" }}>{notice}</Text> : null}
  </View>;
}
