import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { GO_MODULE_STAGE_LABELS, GO_RESERVATION_SECTORS, parseGoModulePublication, type GoModulePublication } from "@workspace/api-zod";
import { supabaseApiRequest } from "@/data/booking";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useGoView } from "@/contexts/GoViewContext";

/** Shared release registry, not business rows and not a local permission editor. */
export function GoModulePublicationPanel() {
  const access = useAdminAccess(), view = useGoView();
  const [publication, setPublication] = useState<GoModulePublication | null>(null);
  const [failed, setFailed] = useState(false);
  const allowed = access.allowed && !access.checking && view.isAdminView;
  useEffect(() => {
    let current = true; setPublication(null); setFailed(false);
    if (allowed) void supabaseApiRequest<{ publication: unknown }>("/supabase/admin/module-publication", {}, true, access.userId ?? undefined)
      .then(value => { if (current) setPublication(parseGoModulePublication(value.publication)); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [allowed, access.userId]);
  if (!allowed) return null;
  return <View testID="go-module-publication-registry" style={{ padding: 16, gap: 8 }}>
    <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Publicación de módulos GO</Text>
    {failed ? <Text style={{ color: "#FFFFFF" }}>No se pudo comprobar la configuración de publicación.</Text>
      : !publication ? <Text style={{ color: "#FFFFFF" }}>Comprobando publicación…</Text>
      : <>
        <Text style={{ color: "#FFFFFF" }}>Entorno: {publication.audience === "pilot" ? "Piloto" : "Usuarios generales"}</Text>
        {GO_RESERVATION_SECTORS.map(id => <Text key={id} style={{ color: "#FFFFFF" }}>{id}: {GO_MODULE_STAGE_LABELS[publication.stages[`reservas.${id}`] ?? "development"]}</Text>)}
        <Text style={{ color: "#FFFFFF" }}>Peluquería: {GO_MODULE_STAGE_LABELS[publication.stages["reservas.peluqueria"] ?? "development"]}</Text>
        <Text style={{ color: "#FFFFFF" }}>GO Imprimir: {GO_MODULE_STAGE_LABELS[publication.stages["go.imprimir"] ?? "development"]}</Text>
        <Text style={{ color: "rgba(255,255,255,0.65)" }}>La configuración efectiva se administra en GO_MODULE_PUBLICATION del servidor mediante un cambio autorizado. Esta consulta no publica módulos ni amplía el acceso a datos privados.</Text>
      </>}
  </View>;
}
