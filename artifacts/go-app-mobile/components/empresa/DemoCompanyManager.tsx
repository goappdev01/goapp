import React, { useRef, useState } from "react";
import { Alert, Keyboard, ScrollView, Share, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";
import { useLanguage } from "@/contexts/LanguageContext";
/** Selection/storage tools only. Configuration stays in the existing company wizard. */
export function DemoCompanyManager({ open, onOpenChange, onOpenConfiguration }: {
  open: boolean; onOpenChange: (value: boolean) => void; onOpenConfiguration?: () => void;
}) {
  const { catalog, demo } = useOwnerBusinessDemo(); const { lang } = useLanguage();
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [backupText, setBackupText] = useState(""), [importOpen, setImportOpen] = useState(false);
  const busyRef = useRef(false), nameInput = useRef<TextInput>(null), latestName = useRef("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false), [toolsOpen, setToolsOpen] = useState(false);
  if (!catalog || !demo) return null;
  const en = lang === "en", companies = catalog.getCompanies();
  const activeCompanies = companies.filter(company => !company.archived && !company.placeholder);
  const recoveryCompanies = companies.filter(company => company.archived || company.placeholder);
  const currentName = demo.getSnapshot().config.businessName || (en ? "Unnamed business" : "Negocio sin nombre");
  const run = async (operation: () => Promise<unknown>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { await operation(); } catch (error) { Alert.alert("GO", String(error)); } finally { busyRef.current = false; setBusy(false); } };
  const openConfiguration = () => { if (onOpenConfiguration) { onOpenChange(false); onOpenConfiguration(); } };
  const createCompany = () => {
    if (busyRef.current) return;
    const trimmed = latestName.current.trim();
    if (!trimmed || trimmed.length > 100) {
      setCreateError(en ? "Enter a business name (1–100 characters)." : "Introduce el nombre del negocio (1–100 caracteres).");
      nameInput.current?.focus(); return;
    }
    setCreateError("");
    void run(async () => {
      await demo.load(); await catalog.create(trimmed);
      latestName.current = ""; setName(""); setCreating(false); Keyboard.dismiss(); openConfiguration();
    });
  };
  const switchCompany = (id: string, archived: boolean) => run(async () => {
    await demo.load(); // Wait for pending writes to the previous company.
    if (archived) await catalog.recover(id); else await catalog.select(id);
    openConfiguration();
  });
  const button = (label: string, action: () => void, id?: string) => <TouchableOpacity key={id ?? label} testID={id} accessibilityRole="button" disabled={busy} onPress={action} style={{ padding: 10, borderRadius: 10, backgroundColor: "#edf3fa", opacity: busy ? 0.5 : 1 }}><Text style={{ color: "#24527c", fontWeight: "700" }}>{label}</Text></TouchableOpacity>;
  const archiveCurrent = () => Alert.alert("GO", en ? "Archive this test company? Its data can be recovered here." : "¿Archivar esta empresa de prueba? Sus datos se podrán recuperar aquí.", [{ text: en ? "Cancel" : "Cancelar", style: "cancel" }, { text: en ? "Archive" : "Archivar", onPress: () => void run(async () => { await demo.load(); await catalog.archive(catalog.getSelectedId()); }) }]);
  return <View style={{ marginHorizontal: 18, marginBottom: 8, gap: 6 }} testID="demo-company-manager">
    <Text testID="demo-selected-company" style={{ color: "#111827", fontWeight: "700" }}>{en ? "Current business: " : "Negocio actual: "}{currentName}</Text>
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1 }}>{button((en ? "My businesses · " : "Mis negocios · ") + activeCompanies.length + (open ? " ▴" : " ▾"), () => onOpenChange(!open), "demo-company-toggle")}</View>
      <View style={{ flex: 1 }}>{button(en ? "New business" : "Nuevo negocio", () => { setCreating(true); setCreateError(""); setToolsOpen(false); onOpenChange(true); nameInput.current?.focus(); }, "demo-company-new")}</View>
    </View>
    {creating && <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 6, paddingBottom: 8 }} keyboardShouldPersistTaps="always" nestedScrollEnabled testID="demo-company-create-form">
      <Text style={{ color: "#4b5563", fontSize: 12 }}>{en ? "Create an independent business and open its configuration." : "Crea un negocio independiente y abre su configuración."}</Text>
      <TextInput ref={nameInput} autoFocus testID="demo-company-name" accessibilityLabel={en ? "New company name" : "Nombre de nueva empresa"} placeholder={en ? "New business name" : "Nombre del nuevo negocio"} value={name} onChangeText={value => { latestName.current = value; setName(value); setCreateError(""); }} returnKeyType="go" onSubmitEditing={createCompany} maxLength={100} editable={!busy} style={{ borderWidth: 1, borderColor: "#aab8ca", padding: 10, borderRadius: 10, color: "#111827" }} />
      {!!createError && <Text testID="demo-company-create-error" accessibilityRole="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{createError}</Text>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>{button(busy ? (en ? "Creating business…" : "Creando negocio…") : (en ? "Create business" : "Crear negocio"), createCompany, "demo-company-create")}</View>
        <View style={{ flex: 1 }}>{button(en ? "Cancel" : "Cancelar", () => { setCreating(false); latestName.current = ""; setName(""); setCreateError(""); }, "demo-company-create-cancel")}</View>
      </View>
    </ScrollView>}
    {open && !creating && <ScrollView testID="demo-company-list" style={{ maxHeight: 150 }} contentContainerStyle={{ gap: 6, paddingBottom: 6 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {activeCompanies.map(company => button((company.id === catalog.getSelectedId() ? "✓ " : "") + (company.name || (en ? "Unnamed business" : "Negocio sin nombre")), () => void switchCompany(company.id, false), "demo-company-" + company.id))}
      {activeCompanies.length === 0 && <Text style={{ color: "#4b5563", fontSize: 12 }}>{en ? "Create your first business with New business." : "Crea tu primer negocio con Nuevo negocio."}</Text>}
    </ScrollView>}
    <TouchableOpacity testID="demo-company-tools-toggle" accessibilityRole="button" accessibilityState={{ expanded: toolsOpen }} disabled={busy} onPress={() => setToolsOpen(!toolsOpen)} style={{ paddingVertical: 7 }}>
      <Text style={{ color: "#4b5563", fontSize: 12 }}>{en ? "Administration" : "Administración"} {toolsOpen ? "▴" : "▾"}</Text>
    </TouchableOpacity>
    {toolsOpen && <ScrollView testID="demo-company-tools" style={{ maxHeight: 210 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <Text style={{ color: "#4b5563", fontSize: 12 }}>{en ? "Local backups and recovery. These tools preserve your companies and calendars." : "Copias y recuperación locales. Estas herramientas conservan tus negocios y calendarios."}</Text>
      {button(en ? "Export test backup" : "Exportar copia de prueba", () => void run(async () => { const content = await catalog.exportBackup(); await Share.share({ message: content, title: "GO backup" }); }), "demo-company-backup")}
      {button(en ? "Copy test backup" : "Copiar copia de prueba", () => void run(async () => {
        const content = await catalog.exportBackup();
        if (!await Clipboard.setStringAsync(content)) throw new Error(en ? "Could not copy the backup. Try again." : "No se pudo copiar el respaldo. Vuelve a intentarlo.");
        Alert.alert(en ? "Backup copied" : "Copia copiada", en ? "The complete backup is on the clipboard. Paste it into a private note and check that it was saved." : "El respaldo completo está en el portapapeles. Pégalo en una nota privada y comprueba que se ha guardado.");
      }), "demo-company-copy-backup")}
      {button(en ? "Import test backup" : "Importar copia de prueba", () => setImportOpen(!importOpen), "demo-company-import-toggle")}
      {importOpen && <><TextInput testID="demo-backup-input" accessibilityLabel={en ? "Paste your backup" : "Pega tu copia"} value={backupText} onChangeText={setBackupText} multiline maxLength={10000000} style={{ height: 100, borderWidth: 1, borderColor: "#aab8ca", padding: 12, color: "#111827" }} />
        {button(en ? "Restore this backup" : "Restaurar esta copia", () => Alert.alert("GO", en ? "Restore the companies in this backup for the same owner? Their previous saves are kept; other companies are preserved." : "¿Restaurar las empresas de esta copia del mismo propietario? Se conservan sus guardados anteriores y las demás empresas.", [{ text: en ? "Cancel" : "Cancelar", style: "cancel" }, { text: en ? "Restore" : "Restaurar", onPress: () => void run(async () => { await catalog.importBackup(backupText); setBackupText(""); setImportOpen(false); }) }]), "demo-company-import")}</>}
      {button(en ? "Recover previous company save" : "Recuperar guardado anterior de esta empresa", () => Alert.alert("GO", en ? "Restore the previous saved configuration and reservations for this company?" : "¿Restaurar la configuración y reservas del guardado anterior de esta empresa?", [{ text: en ? "Cancel" : "Cancelar", style: "cancel" }, { text: en ? "Restore" : "Restaurar", onPress: () => void run(() => demo.restoreBackup()) }]), "demo-company-previous-save")}
      <Text style={{ color: "#4b5563", fontSize: 12 }}>{(en ? "Archive current business: " : "Archivar negocio actual: ") + currentName}</Text>
      {button(en ? "Archive company" : "Archivar empresa", archiveCurrent, "demo-company-archive-current")}
      {recoveryCompanies.map(company => button((company.name || (en ? "Previous unconfigured business" : "Negocio anterior sin configurar")) + (company.archived ? (en ? " · archived" : " · archivada") : ""), () => void switchCompany(company.id, company.archived), "demo-company-" + company.id))}
    </ScrollView>}
  </View>;
}
