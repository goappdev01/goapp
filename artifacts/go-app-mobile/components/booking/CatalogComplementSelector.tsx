import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { quoteCatalog, toggleCatalogOption, type CatalogQuote } from "@/data/catalogAssociations";
import { useLanguage } from "@/contexts/LanguageContext";
import { onSessionChanged } from "@/lib/sessionEvents";

export function CatalogComplementSelector({ businessId, rootIds, onChange, repository,accentColor="#65b883" }: { businessId: string; rootIds: string[]; accentColor?:string; onChange: (quote: CatalogQuote | null) => void; repository?: import("@/data/demoBookingRepository").DemoBookingRepository }) {
  const { lang } = useLanguage(); const label = (es: string, en: string) => lang === "en" ? en : es;
  const [selected, setSelected] = useState<string[]>([]), [quote, setQuote] = useState<CatalogQuote | null>(null), [error, setError] = useState("");
  const [sessionRevision, setSessionRevision] = useState(0);
  useEffect(() => onSessionChanged(() => setSessionRevision(value => value + 1)), []);
  const scope = businessId + "|" + rootIds.join(",") + "|" + sessionRevision;
  const [selectionScope, setSelectionScope] = useState(scope);
  const selection = selectionScope === scope ? selected : [];
  const currentQuote = selectionScope === scope && quote?.businessId === businessId && JSON.stringify(quote.rootIds) === JSON.stringify(rootIds) ? quote : null;
  useEffect(() => { setSelected([]); setSelectionScope(scope); }, [scope]);
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
    {currentQuote && <Text style={{ color: accentColor, fontWeight: "700" }}>{label("Total revisado", "Reviewed total")}: {currentQuote.totalPrice.toFixed(2)} {currentQuote.currency}</Text>}
  </View>;
}
