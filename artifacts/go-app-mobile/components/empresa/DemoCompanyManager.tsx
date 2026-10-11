import React, { useRef, useState } from "react";
import { Alert, ScrollView, Share, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";
import { useLanguage } from "@/contexts/LanguageContext";
/** Selection/storage tools only. Configuration stays in the existing company wizard. */
export function DemoCompanyManager({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const { catalog, demo } = useOwnerBusinessDemo(); const { lang } = useLanguage();
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [backupText, setBackupText] = useState(""), [importOpen, setImportOpen] = useState(false);
  const busyRef = useRef(false);
  if (!catalog || !demo) return null;
  const en = lang === "en", companies = catalog.getCompanies();
  const run = async (operation: () => Promise<unknown>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { await operation(); } catch (error) { Alert.alert("DEMO", String(error)); } finally { busyRef.current = false; setBusy(false); } };
  const button = (label: string, action: () => void, id?: string) => <TouchableOpacity key={id ?? label} testID={id} accessibilityRole="button" disabled={busy} onPress={action} style={{ padding: 12, borderRadius: 12, backgroundColor: "#edf3fa", opacity: busy ? 0.5 : 1 }}><Text style={{ color: "#24527c", fontWeight: "700" }}>{label}</Text></TouchableOpacity>;
  return <View style={{ marginHorizontal: 18, marginBottom: 8, gap: 8 }} testID="demo-company-manager">
    {button((en ? "DEMO companies · " : "Empresas DEMO · ") + companies.filter(company => !company.archived).length + " ▾", () => onOpenChange(!open), "demo-company-toggle")}
    {open && <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <Text style={{ color: "#4b5563", fontSize: 12 }}>{en ? "Saved on this device. Switching companies keeps each configuration and calendar." : "Guardadas en este dispositivo. Cambiar de empresa conserva cada configuración y calendario."}</Text>
      {companies.map(company => <View key={company.id} style={{ gap: 5 }}>
        {button((company.id === catalog.getSelectedId() ? "✓ " : "") + (company.name || (en ? "Previous DEMO company" : "Empresa DEMO anterior")) + (company.archived ? (en ? " · archived" : " · archivada") : ""), () => void run(() => company.archived ? catalog.recover(company.id) : catalog.select(company.id)), "demo-company-" + company.id)}
        {!company.archived && button(en ? "Archive company" : "Archivar empresa", () => Alert.alert("DEMO", en ? "Archive this test company? Its data can be recovered here." : "¿Archivar esta empresa de prueba? Sus datos se podrán recuperar aquí.", [{ text: en ? "Cancel" : "Cancelar", style: "cancel" }, { text: en ? "Archive" : "Archivar", onPress: () => void run(() => catalog.archive(company.id)) }]))}
      </View>)}
      <TextInput accessibilityLabel={en ? "New DEMO company name" : "Nombre de nueva empresa DEMO"} placeholder={en ? "New test company" : "Nueva empresa de prueba"} value={name} onChangeText={setName} maxLength={100} editable={!busy} style={{ borderWidth: 1, borderColor: "#aab8ca", padding: 12, borderRadius: 12, color: "#111827" }} />
      {button(en ? "Create DEMO company" : "Crear empresa DEMO", () => void run(async () => { await catalog.create(name); setName(""); }), "demo-company-create")}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{["GO PELUQUERÍA", "GO RESTAURANTE"].map(label => button(label, () => setName(label)))}</View>
      {button(en ? "Export test backup" : "Exportar copia de prueba", () => void run(async () => { const content = await catalog.exportBackup(); await Share.share({ message: content, title: "GO DEMO backup" }); }), "demo-company-backup")}
      {button(en ? "Import test backup" : "Importar copia de prueba", () => setImportOpen(!importOpen), "demo-company-import-toggle")}
      {importOpen && <><TextInput testID="demo-backup-input" accessibilityLabel={en ? "Paste your DEMO backup" : "Pega tu copia DEMO"} value={backupText} onChangeText={setBackupText} multiline maxLength={10000000} style={{ height: 100, borderWidth: 1, borderColor: "#aab8ca", padding: 12, color: "#111827" }} />
        {button(en ? "Restore this backup" : "Restaurar esta copia", () => Alert.alert("DEMO", en ? "Restore the companies in this backup for the same owner? Their previous saves are kept; other companies are preserved." : "¿Restaurar las empresas de esta copia del mismo propietario? Se conservan sus guardados anteriores y las demás empresas.", [{ text: en ? "Cancel" : "Cancelar", style: "cancel" }, { text: en ? "Restore" : "Restaurar", onPress: () => void run(async () => { await catalog.importBackup(backupText); setBackupText(""); setImportOpen(false); }) }]), "demo-company-import")}</>}
      {button(en ? "Recover previous company save" : "Recuperar guardado anterior de esta empresa", () => Alert.alert("DEMO", en ? "Restore the previous saved configuration and reservations for this company?" : "¿Restaurar la configuración y reservas del guardado anterior de esta empresa?", [{ text: en ? "Cancel" : "Cancelar", style: "cancel" }, { text: en ? "Restore" : "Restaurar", onPress: () => void run(() => demo.restoreBackup()) }]))}
    </ScrollView>}
  </View>;
}
