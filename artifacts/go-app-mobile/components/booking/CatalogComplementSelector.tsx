import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { quoteCatalog, toggleCatalogOption, type CatalogQuote } from "@/data/catalogAssociations";
import { useLanguage } from "@/contexts/LanguageContext";
import { onSessionChanged } from "@/lib/sessionEvents";

export function CatalogQuoteBreakdown({ quote, showTotal = true, accentColor = "#65b883", individual = false }: { quote: CatalogQuote; showTotal?: boolean; accentColor?: string; individual?: boolean }) {
  const { lang } = useLanguage();
  const money = new Intl.NumberFormat(lang === "en" ? "en-GB" : "es-ES", { style: "currency", currency: quote.currency });
  const roots = new Set(quote.rootIds);
  if (individual) return <View testID="booking-review-service-lines" style={{ gap: 4 }}>
    {quote.lines.map(line => <View key={line.itemId} testID={`booking-review-line-${line.itemId}`}
      style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600", flex: 1, minWidth: 0 }}>
        {roots.has(line.itemId) ? line.name : `↳ ${line.name}`}
      </Text>
      <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700", flexShrink: 0 }}>
        {line.included ? (lang === "en" ? "Included" : "Incluido") : money.format(line.charge)}
      </Text>
    </View>)}
  </View>;
  const principal = quote.lines.filter(line => roots.has(line.itemId)).reduce((cents, line) => cents + Math.round(line.charge * 100), 0) / 100;
  const extras = quote.lines.filter(line => !roots.has(line.itemId));
  return <View style={{ gap: 3 }}>
    <Text style={{ color: "#FFFFFF" }}>{lang === "en" ? "Main services" : "Servicios principales"} · {money.format(principal)}</Text>
    {extras.map(line => <Text key={line.itemId} style={{ color: "#FFFFFF" }}>{line.name} · {line.included ? (lang === "en" ? "Included" : "Incluido") : money.format(line.charge)}</Text>)}
    {showTotal && <Text style={{ color: accentColor, fontWeight: "700" }}>{lang === "en" ? "Total before confirming" : "Total antes de confirmar"}: {money.format(quote.totalPrice)}</Text>}
  </View>;
}

export function CatalogComplementSelector({ businessId, rootIds, onChange, repository,accentColor="#65b883", showTotal = true, initialSelected }: { businessId: string; rootIds: string[]; accentColor?:string; showTotal?: boolean; initialSelected?:string[]; onChange: (quote: CatalogQuote | null) => void; repository?: import("@/data/demoBookingRepository").DemoBookingRepository }) {
  const { lang } = useLanguage(); const label = (es: string, en: string) => lang === "en" ? en : es;
  const [selected, setSelected] = useState<string[]>(initialSelected ?? []), [quote, setQuote] = useState<CatalogQuote | null>(null), [error, setError] = useState("");
  const [sessionRevision, setSessionRevision] = useState(0);
  useEffect(() => onSessionChanged(() => setSessionRevision(value => value + 1)), []);
  const scope = businessId + "|" + rootIds.join(",") + "|" + sessionRevision;
  const [selectionScope, setSelectionScope] = useState(scope);
  const initialSelection = sessionRevision===0 ? initialSelected ?? [] : [];
  const selection = selectionScope === scope ? selected : initialSelection;
  const currentQuote = selectionScope === scope && quote?.businessId === businessId && JSON.stringify(quote.rootIds) === JSON.stringify(rootIds) ? quote : null;
  useEffect(() => { setSelected(initialSelection); setSelectionScope(scope); }, [scope, initialSelected?.join(",")]);
  useEffect(() => {
    let current = true; onChange(null); setQuote(null); setError("");
    if (!rootIds.length) return () => { current = false; };
    void (repository ? repository.quoteCatalog(businessId, rootIds, selection) : quoteCatalog(businessId, rootIds, selection)).then(value => { if (current) { setQuote(value); onChange(value); } }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [scope, selection.join(","), onChange, repository]);
  if (!rootIds.length) return null;
  return <View accessibilityLabel={label("Complementos del catálogo", "Catalogue extras")} style={{ gap: 8, paddingVertical: 8 }}>
    {!currentQuote && !error && <ActivityIndicator color="white" />}
    {!!error && <Text accessibilityRole="alert" style={{ color: "#ff9c80" }}>{error}</Text>}
    {currentQuote?.options.map(option => <TouchableOpacity key={option.associationId} accessibilityRole="checkbox" accessibilityState={{ checked: option.selected, disabled: option.mode === "included" }}
      disabled={option.mode === "included"} onPress={() => setSelected(toggleCatalogOption(currentQuote, option.associationId))}
      style={{ minHeight: 44, borderWidth: 1, borderRadius: 10, borderColor:option.mode==="included"?"#666666":option.selected?accentColor:accentColor+"90",backgroundColor:option.selected&&option.mode!=="included"?accentColor+"18":"transparent", padding: 10 }}>
      <Text style={{ color: "white" }}>{option.selected ? "✓ " : "□ "}{option.name}{option.mode !== "included"&&<Text style={{color:accentColor}}>{` · ${option.price.toFixed(2)} ${option.currency}`}</Text>}</Text>
      <Text style={{ color: "#ccc" }}>{option.mode === "included" ? label("Incluido · sin cargo adicional", "Included · no extra charge") : option.mode === "recommended" ? label("Recomendado · puedes continuar sin añadirlo", "Recommended · you can continue without it") : label("Opcional · solo se añade si lo aceptas", "Optional · added only if accepted")}</Text>
    </TouchableOpacity>)}
    {currentQuote && <CatalogQuoteBreakdown quote={currentQuote} showTotal={showTotal} accentColor={accentColor} />}
  </View>;
}
