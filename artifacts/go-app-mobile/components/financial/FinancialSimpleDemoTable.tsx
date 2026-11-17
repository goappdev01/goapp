import React, { useMemo, useState } from "react";
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { saveCalculatorActivity } from "@/data/financialCalculatorTools";
import { updateFinancialDemoMarket } from "@/data/financialDemo";
import type { FinancialDemoState } from "@/data/financialDemoStore";
import { calculatorCatalog, revenueCalculatorRows, revenueCalculatorTotals, updateRevenueCalculator } from "@/data/financialRevenueCalculator";
import { FinanceChoice, FinanceNumber, FinanceTable, financialCount, financialMoney, financeStyles as s } from "./FinancialUI";

type Props = { state: FinancialDemoState; update: (fn: (current: FinancialDemoState) => FinancialDemoState) => void; onCalculate?: () => void };
const money = (value: number | null) => financialMoney(value, "EUR", 0);

/** Compact local presentation over the same financial document and calculation engine. */
export function FinancialSimpleDemoTable({ state, update, onCalculate }: Props) {
  const { width } = useWindowDimensions();
  const [creating, setCreating] = useState(false);
  const [activityName, setActivityName] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const catalog = useMemo(() => calculatorCatalog(state.doc), [state.doc]);
  const rows = useMemo(() => revenueCalculatorRows(state.doc, "REAL"), [state.doc, revision]);
  const row = rows.find(item => item.countryCode === state.countryCode && item.activityId === state.activityId);
  const pairKey = state.countryCode + "|" + state.activityId;
  const cleared = row?.share === 0 && row.fee === 0;
  const knownRows = rows.filter(item => item.market !== null && item.share !== null && item.fee !== null && item.annual !== null);
  const overall = revenueCalculatorTotals(knownRows);
  const byCountry = catalog.countries.flatMap(country => {
    const items = knownRows.filter(item => item.countryCode === country.code);
    return items.length ? [[country.name, financialCount(revenueCalculatorTotals(items).companies), money(revenueCalculatorTotals(items).monthly), money(revenueCalculatorTotals(items).annual)]] : [];
  });

  const editMarket = (value: number | null) => {
    if (value === null) { setError(""); return; }
    if (!Number.isSafeInteger(value) || value < 0 || value > 1e12) { setError("Introduce una cantidad entera válida de empresas."); return; }
    setError("");
    update(current => ({ ...current, doc: updateFinancialDemoMarket(current.doc, current.activityId, current.countryCode, value) }));
  };
  const editAssumption = (field: "share" | "fee", value: number | null) => {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > (field === "share" ? 100 : 1e12))) {
      setError(field === "share" ? "La captación debe estar entre 0 y 100 %." : "Introduce una cuota mensual válida.");
      return;
    }
    setError("");
    update(current => ({ ...current, doc: updateRevenueCalculator(current.doc, current.activityId, current.countryCode, "REAL", field, value) }));
  };
  const createActivity = () => {
    try {
      const doc = saveCalculatorActivity(state.doc, { name: activityName, unit: "empresa", enabled: true });
      const added = doc.activities.find(item => !state.doc.activities.some(previous => previous.id === item.id));
      if (!added) throw new Error("No se pudo seleccionar la actividad creada.");
      update(current => ({ ...current, doc, activityId: added.id }));
      setActivityName(""); setCreating(false); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la actividad."); }
  };
  const clear = () => {
    update(current => {
      const share = updateRevenueCalculator(current.doc, current.activityId, current.countryCode, "REAL", "share", 0);
      return { ...current, doc: updateRevenueCalculator(share, current.activityId, current.countryCode, "REAL", "fee", 0) };
    });
    setError(""); Keyboard.dismiss(); setRevision(value => value + 1);
  };

  return <View style={d.root}>
    <View style={[d.selection, width < 350 && d.stacked]}>
      <FinanceChoice label="País" value={state.countryCode} options={catalog.countries.map(item => ({ value: item.code, label: item.name }))}
        onChange={countryCode => update(current => ({ ...current, countryCode }))}/>
      <FinanceChoice label="Actividad" value={state.activityId} options={catalog.activities.filter(item => item.enabled).map(item => ({ value: item.id, label: item.name }))}
        onChange={activityId => update(current => ({ ...current, activityId }))}/>
    </View>
    {!creating ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Nueva actividad" onPress={() => setCreating(true)} style={d.activityLink}>
      <Text style={d.activityLinkText}>＋ Nueva actividad</Text>
    </TouchableOpacity> : <View style={d.activityEditor}>
      <TextInput accessibilityLabel="Nombre de la nueva actividad" value={activityName} onChangeText={setActivityName} placeholder="Nombre de la actividad"
        maxLength={160} style={[s.input, d.activityInput]} returnKeyType="done" onSubmitEditing={createActivity}/>
      <View style={d.actions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="GUARDAR ACTIVIDAD" onPress={createActivity} style={[d.action, d.calculate, { flex: 2 }]}>
        <Text style={d.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>GUARDAR ACTIVIDAD</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancelar nueva actividad" onPress={() => { setCreating(false); setActivityName(""); setError(""); }} style={[d.action, d.cancel]}>
          <Text style={d.cancelText}>Cancelar</Text></TouchableOpacity></View>
    </View>}
    <View style={d.inputs}>
      <FinanceNumber key={pairKey + "|market"} label="Empresas existentes" value={row?.market ?? null} onChange={editMarket} placeholder="Sin dato"/>
      <View style={[d.selection, width < 350 && d.stacked]}>
        <FinanceNumber key={pairKey + "|share"} label="Captación (%)" value={row?.share ?? null} onChange={value => editAssumption("share", value)}/>
        <FinanceNumber key={pairKey + "|fee"} label="Cuota mensual (€)" value={row?.fee ?? null} disabled={!row?.feeEditable} onChange={value => editAssumption("fee", value)}/>
      </View>
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={d.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="CALCULAR" onPress={() => { Keyboard.dismiss(); setRevision(value => value + 1); onCalculate?.(); }} style={[d.action, d.calculate]}><Text style={d.actionText}>CALCULAR</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="LIMPIAR" onPress={clear} style={[d.action, d.clear]}><Text style={d.actionText}>LIMPIAR</Text></TouchableOpacity>
    </View>
    <View style={d.results}>
      <Text style={s.heading}>Resultado · {catalog.countries.find(item => item.code === state.countryCode)?.name} · {catalog.activities.find(item => item.id === state.activityId)?.name}</Text>
      <View style={s.planBar}><Text style={s.text}>Empresas captadas</Text><Text style={d.resultValue}>{financialCount(cleared ? 0 : row?.companies ?? null)}</Text></View>
      <View style={s.planBar}><Text style={s.text}>Ingreso mensual</Text><Text style={d.resultValue}>{money(cleared ? 0 : row?.monthly ?? null)}</Text></View>
      <View style={s.planBar}><Text style={s.text}>Ingreso anual</Text><Text style={d.resultValue}>{money(cleared ? 0 : row?.annual ?? null)}</Text></View>
    </View>
    <View style={d.totals}>
      <Text style={s.heading}>Total general · cifras conocidas</Text>
      <View style={s.planBar}><Text style={s.text}>Empresas captadas</Text><Text style={d.resultValue}>{financialCount(overall.companies)}</Text></View>
      <View style={s.planBar}><Text style={s.text}>Ingreso mensual</Text><Text style={d.resultValue}>{money(overall.monthly)}</Text></View>
      <View style={s.planBar}><Text style={s.text}>Ingreso anual</Text><Text style={d.resultValue}>{money(overall.annual)}</Text></View>
      <Text style={s.heading}>Totales por país</Text>
      {byCountry.length ? <FinanceTable headers={["País", "Captadas", "Mensual", "Anual"]} rows={byCountry}/> : <Text style={s.note}>Sin cifras calculables todavía.</Text>}
    </View>
  </View>;
}

const d = StyleSheet.create({
  root: { alignSelf: "stretch", gap: 12, paddingBottom: 12 },
  selection: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stacked: { flexDirection: "column" },
  inputs: { gap: 10 },
  activityLink: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  activityLinkText: { color: "#205C9C", fontSize: 14, fontWeight: "700" },
  activityEditor: { gap: 8 },
  activityInput: { alignSelf: "stretch" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  calculate: { backgroundColor: "#20784B" },
  clear: { backgroundColor: "#B53338" },
  cancel: { backgroundColor: "#F6F7F9", borderWidth: 1, borderColor: "#CBD1DA" },
  actionText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15, textAlign: "center" },
  cancelText: { color: "#344052", fontWeight: "700" },
  results: { backgroundColor: "#FFFFFF", borderColor: "#E2E6EB", borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  totals: { borderTopWidth: 1, borderTopColor: "#DCE1E8", paddingTop: 12, gap: 9 },
  resultValue: { color: "#20784B", fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
