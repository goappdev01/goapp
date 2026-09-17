import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  detectarColumna,
  FIELD_LABELS,
  importarLote,
  TIPO_OPTIONS,
  type ContactoRaw,
  type TipoContacto,
} from "@/data/contactos";

type Step = "pick" | "map" | "preview" | "done";

interface ImportResult {
  importados: number;
  duplicados: number;
}

interface Props {
  onClose: () => void;
  onImportado: () => void;
}

const ALL_FIELDS = Object.keys(FIELD_LABELS) as (keyof ContactoRaw)[];

export function ImportacionScreen({ onClose, onImportado }: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [loading, setLoading] = useState(false);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, keyof ContactoRaw | "">>({});
  const [preview, setPreview] = useState<ContactoRaw[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pickFile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) {
        setLoading(false);
        return;
      }

      const asset = res.assets[0];
      const name = asset.name ?? "";
      const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls");

      let headers: string[] = [];
      let rows: Record<string, string>[] = [];

      if (isXlsx) {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (json.length === 0) {
          Alert.alert("Archivo vacío", "El archivo no contiene datos.");
          setLoading(false);
          return;
        }
        headers = Object.keys(json[0]);
        rows = json.map((r) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))
        );
      } else {
        const text = await fetch(asset.uri).then((r) => r.text());
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });
        if (!parsed.data.length) {
          Alert.alert("Archivo vacío", "El archivo no contiene datos.");
          setLoading(false);
          return;
        }
        headers = parsed.meta.fields ?? [];
        rows = parsed.data;
      }

      const autoMap: Record<string, keyof ContactoRaw | ""> = {};
      for (const h of headers) {
        autoMap[h] = detectarColumna(h) ?? "";
      }

      setRawHeaders(headers);
      setRawRows(rows);
      setColumnMap(autoMap);
      setStep("map");
    } catch (err) {
      Alert.alert("Error", "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
    }
  }, []);

  const buildPreview = useCallback(() => {
    const mapped = rawRows.map((row) => {
      const c: ContactoRaw = {};
      for (const [header, field] of Object.entries(columnMap)) {
        if (!field) continue;
        const val = (row[header] ?? "").trim();
        if (!val) continue;
        if (field === "tipo") {
          const lower = val.toLowerCase() as TipoContacto;
          (c as Record<string, unknown>)[field] = TIPO_OPTIONS.includes(lower)
            ? lower
            : "cliente";
        } else {
          (c as Record<string, unknown>)[field] = val;
        }
      }
      return c;
    });
    setPreview(mapped);
    setStep("preview");
  }, [rawRows, columnMap]);

  const updatePreviewRow = (idx: number, field: keyof ContactoRaw, value: string) => {
    setPreview((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setPreview((prev) => prev.filter((_, i) => i !== idx));
    if (editIdx === idx) setEditIdx(null);
  };

  const doImport = async () => {
    setLoading(true);
    try {
      const res = await importarLote(preview);
      setResult({ importados: res.importados, duplicados: res.duplicados });
      setStep("done");
      onImportado();
    } catch {
      Alert.alert("Error", "No se pudo completar la importación.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "pick") {
    return (
      <View style={s.container}>
        <View style={s.pickHero}>
          <View style={s.pickIconCircle}>
            <Feather name="upload-cloud" size={40} color="#6ee7b7" />
          </View>
          <Text style={s.pickTitle}>Importar contactos</Text>
          <Text style={s.pickSub}>
            Sube un archivo CSV o Excel con tus clientes,{"\n"}proveedores o
            contactos. GO detectará las columnas automáticamente.
          </Text>

          <View style={s.formatRow}>
            <FormatPill icon="file-text" label="CSV" />
            <FormatPill icon="grid" label="Excel .xlsx" />
          </View>

          <TouchableOpacity
            style={s.pickBtn}
            activeOpacity={0.85}
            onPress={pickFile}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Feather name="upload" size={18} color="#000" />
                <Text style={s.pickBtnTxt}>Seleccionar archivo</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={s.pickHint}>
            Campos admitidos: empresa, email, teléfono, ciudad, tipo y más.{"\n"}
            Ningún campo es obligatorio.
          </Text>
        </View>
      </View>
    );
  }

  if (step === "map") {
    const mappedCount = Object.values(columnMap).filter(Boolean).length;
    return (
      <View style={s.container}>
        <View style={s.stepHeader}>
          <Text style={s.stepTitle}>Mapeo de columnas</Text>
          <Text style={s.stepSub}>
            GO detectó {mappedCount} de {rawHeaders.length} columnas.
            Corrígelas si hace falta.
          </Text>
        </View>

        <ScrollView style={s.mapScroll} showsVerticalScrollIndicator={false}>
          {rawHeaders.map((header) => (
            <View key={header} style={s.mapRow}>
              <View style={s.mapLeft}>
                <Text style={s.mapOriginal} numberOfLines={1}>
                  {header}
                </Text>
                <Feather name="arrow-right" size={12} color="#555" />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.mapPillScroll}
              >
                <TouchableOpacity
                  style={[
                    s.mapPill,
                    !columnMap[header] && s.mapPillIgnore,
                  ]}
                  onPress={() =>
                    setColumnMap((prev) => ({ ...prev, [header]: "" }))
                  }
                >
                  <Text
                    style={[
                      s.mapPillTxt,
                      !columnMap[header] && { color: "#666" },
                    ]}
                  >
                    Ignorar
                  </Text>
                </TouchableOpacity>
                {ALL_FIELDS.map((field) => (
                  <TouchableOpacity
                    key={field}
                    style={[
                      s.mapPill,
                      columnMap[header] === field && s.mapPillActive,
                    ]}
                    onPress={() =>
                      setColumnMap((prev) => ({ ...prev, [header]: field }))
                    }
                  >
                    <Text
                      style={[
                        s.mapPillTxt,
                        columnMap[header] === field && { color: "#6ee7b7" },
                      ]}
                    >
                      {FIELD_LABELS[field]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={s.actionRow}>
          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => setStep("pick")}
          >
            <Text style={s.btnSecondaryTxt}>Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={buildPreview}>
            <Text style={s.btnPrimaryTxt}>
              Vista previa ({rawRows.length} filas)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === "preview") {
    return (
      <View style={s.container}>
        <View style={s.stepHeader}>
          <Text style={s.stepTitle}>Vista previa</Text>
          <Text style={s.stepSub}>
            {preview.length} contactos listos.{" "}
            Pulsa una fila para editar o eliminar.
          </Text>
        </View>

        <ScrollView style={s.previewScroll} showsVerticalScrollIndicator={false}>
          {preview.map((row, idx) => (
            <TouchableOpacity
              key={idx}
              style={[s.previewCard, editIdx === idx && s.previewCardActive]}
              activeOpacity={0.85}
              onPress={() => setEditIdx(editIdx === idx ? null : idx)}
            >
              <View style={s.previewCardHeader}>
                <View style={s.previewCardLeft}>
                  <Text style={s.previewEmpresa} numberOfLines={1}>
                    {row.empresa || <Text style={{ color: "#555" }}>Sin empresa</Text>}
                  </Text>
                  <Text style={s.previewSub} numberOfLines={1}>
                    {[row.responsable, row.email, row.telefono]
                      .filter(Boolean)
                      .join(" · ") || "Sin datos"}
                  </Text>
                </View>
                <View style={s.previewRight}>
                  {row.tipo && (
                    <View style={[s.tipoPill, { backgroundColor: TIPO_COLOR[row.tipo as TipoContacto] + "22" }]}>
                      <Text style={[s.tipoPillTxt, { color: TIPO_COLOR[row.tipo as TipoContacto] }]}>
                        {row.tipo}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() => removeRow(idx)}
                    style={s.removeBtn}
                  >
                    <Feather name="trash-2" size={13} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>

              {editIdx === idx && (
                <View style={s.editPanel}>
                  {ALL_FIELDS.map((field) => (
                    <View key={field} style={s.editField}>
                      <Text style={s.editLabel}>{FIELD_LABELS[field]}</Text>
                      {field === "tipo" ? (
                        <View style={s.tipoRow}>
                          {TIPO_OPTIONS.map((t) => (
                            <TouchableOpacity
                              key={t}
                              style={[
                                s.tipoOpt,
                                row.tipo === t && {
                                  backgroundColor: TIPO_COLOR[t] + "33",
                                  borderColor: TIPO_COLOR[t],
                                },
                              ]}
                              onPress={() =>
                                updatePreviewRow(idx, "tipo", t)
                              }
                            >
                              <Text
                                style={[
                                  s.tipoOptTxt,
                                  row.tipo === t && { color: TIPO_COLOR[t] },
                                ]}
                              >
                                {t}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <TextInput
                          style={s.editInput}
                          value={(row as Record<string, unknown>)[field] as string ?? ""}
                          onChangeText={(v) =>
                            updatePreviewRow(idx, field, v)
                          }
                          placeholderTextColor="#555"
                          placeholder={`Ej. ${FIELD_LABELS[field]}`}
                        />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={s.actionRow}>
          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => setStep("map")}
          >
            <Text style={s.btnSecondaryTxt}>Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, loading && { opacity: 0.6 }]}
            onPress={doImport}
            disabled={loading || preview.length === 0}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.btnPrimaryTxt}>
                Importar {preview.length} contactos
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === "done") {
    return (
      <View style={[s.container, s.doneContainer]}>
        <View style={s.doneIconCircle}>
          <Feather name="check-circle" size={52} color="#6ee7b7" />
        </View>
        <Text style={s.doneTitle}>Importación completada</Text>
        <View style={s.doneStats}>
          <View style={s.doneStat}>
            <Text style={[s.doneStatNum, { color: "#6ee7b7" }]}>
              {result?.importados ?? 0}
            </Text>
            <Text style={s.doneStatLabel}>Importados</Text>
          </View>
          {(result?.duplicados ?? 0) > 0 && (
            <View style={s.doneStat}>
              <Text style={[s.doneStatNum, { color: "#f59e0b" }]}>
                {result?.duplicados}
              </Text>
              <Text style={s.doneStatLabel}>Duplicados omitidos</Text>
            </View>
          )}
        </View>
        <Text style={s.doneSub}>
          Los contactos están listos para rutas, visitas y automatización.
        </Text>
        <TouchableOpacity style={s.btnPrimary} onPress={onClose}>
          <Text style={s.btnPrimaryTxt}>Ver contactos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

function FormatPill({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={s.formatPill}>
      <Feather name={icon} size={13} color="#6ee7b7" />
      <Text style={s.formatPillTxt}>{label}</Text>
    </View>
  );
}

const TIPO_COLOR: Record<TipoContacto, string> = {
  cliente: "#6ee7b7",
  proveedor: "#3b82f6",
  tecnico: "#8b5cf6",
  comercial: "#f97316",
  otro: "#6b7280",
};

const s = StyleSheet.create({
  container:         { flex: 1 },
  pickHero:          { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  pickIconCircle:    { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(61,154,132,0.1)", borderWidth: 1, borderColor: "rgba(61,154,132,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  pickTitle:         { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 10, textAlign: "center" },
  pickSub:           { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  formatRow:         { flexDirection: "row", gap: 10, marginBottom: 32 },
  formatPill:        { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(61,154,132,0.1)", borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: "rgba(61,154,132,0.15)" },
  formatPillTxt:     { fontSize: 12, color: "#3D9A84", fontWeight: "600" },
  pickBtn:           { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#3D9A84", borderRadius: 16, paddingHorizontal: 28, paddingVertical: 15, marginBottom: 20 },
  pickBtnTxt:        { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  pickHint:          { fontSize: 11, color: "#9CA3AF", textAlign: "center", lineHeight: 17 },

  stepHeader:        { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  stepTitle:         { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 2 },
  stepSub:           { fontSize: 12, color: "#6B7280" },

  mapScroll:         { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  mapRow:            { marginBottom: 14 },
  mapLeft:           { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  mapOriginal:       { fontSize: 12, fontWeight: "700", color: "#6B7280", flex: 1 },
  mapPillScroll:     { flexGrow: 0 },
  mapPill:           { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginRight: 6, backgroundColor: "#FFFFFF" },
  mapPillActive:     { borderColor: "rgba(61,154,132,0.3)", backgroundColor: "rgba(61,154,132,0.08)" },
  mapPillIgnore:     { borderColor: "rgba(0,0,0,0.06)", backgroundColor: "#F3F4F6" },
  mapPillTxt:        { fontSize: 11, color: "#6B7280", fontWeight: "600" },

  previewScroll:     { flex: 1, paddingHorizontal: 14, paddingTop: 12 },
  previewCard:       { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  previewCardActive: { borderColor: "rgba(61,154,132,0.25)" },
  previewCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewCardLeft:   { flex: 1 },
  previewEmpresa:    { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 2 },
  previewSub:        { fontSize: 11, color: "#9CA3AF" },
  previewRight:      { flexDirection: "row", alignItems: "center", gap: 8 },
  tipoPill:          { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  tipoPillTxt:       { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  removeBtn:         { padding: 4 },

  editPanel:         { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)", gap: 10 },
  editField:         { gap: 4 },
  editLabel:         { fontSize: 10, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  editInput:         { backgroundColor: "#F7F8FA", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#111827", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  tipoRow:           { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tipoOpt:           { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "#F7F8FA" },
  tipoOptTxt:        { fontSize: 11, color: "#6B7280", fontWeight: "600" },

  actionRow:         { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  btnPrimary:        { flex: 1, backgroundColor: "#3D9A84", borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btnPrimaryTxt:     { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  btnSecondary:      { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  btnSecondaryTxt:   { fontSize: 14, fontWeight: "700", color: "#6B7280" },

  doneContainer:     { alignItems: "center", justifyContent: "center", padding: 32 },
  doneIconCircle:    { marginBottom: 24 },
  doneTitle:         { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 20, textAlign: "center" },
  doneStats:         { flexDirection: "row", gap: 24, marginBottom: 16 },
  doneStat:          { alignItems: "center" },
  doneStatNum:       { fontSize: 40, fontWeight: "900" },
  doneStatLabel:     { fontSize: 11, color: "#9CA3AF", fontWeight: "600", marginTop: 2 },
  doneSub:           { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 28 },
});
