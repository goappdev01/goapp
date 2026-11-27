import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/contexts/LanguageContext";
import { ETHICS_FOUNDATION, ETHICS_PILLARS_TITLE } from "@/lib/ethicsPillars";

/** Read-only window in the existing Ethics architecture; navigation remains with its parent. */
export function GoEthicsPillarsScreen() {
  const { lang } = useLanguage();
  const language = lang === "en" ? "en" : "es";
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  return (
    <ScrollView testID="ethics-pillars-screen" style={s.screen}
      contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 168 }]}
      accessibilityLabel={ETHICS_PILLARS_TITLE[language]}>
      <Text accessibilityRole="header" style={s.title}>{ETHICS_PILLARS_TITLE[language]}</Text>
      <View style={s.notice}>
        <Text style={s.noticeTitle}>{language === "en" ? "Initial ethical foundation" : "Base ética inicial"}</Text>
        <Text style={s.noticeText}>{language === "en"
          ? "Pending further development and multidisciplinary validation."
          : "Pendiente de desarrollo y validación multidisciplinar."}</Text>
      </View>
      {ETHICS_FOUNDATION.pillars.map(pillar => {
        const open = expanded.includes(pillar.id);
        const title = pillar.title[language];
        return (
          <View key={pillar.id} testID={"ethics-pillar-card-" + pillar.number} style={s.card}>
            <TouchableOpacity testID={"ethics-pillar-toggle-" + pillar.number}
              accessibilityRole="button" accessibilityLabel={pillar.number + ". " + title}
              accessibilityState={{ expanded: open }}
              accessibilityHint={language === "en" ? (open ? "Hide pillar content" : "Show pillar content") : (open ? "Ocultar contenido del pilar" : "Mostrar contenido del pilar")}
              activeOpacity={0.8} style={s.toggle}
              onPress={() => setExpanded(previous => previous.includes(pillar.id)
                ? previous.filter(id => id !== pillar.id) : [...previous, pillar.id])}>
              <Text style={s.number}>{pillar.number}</Text>
              <Text style={s.pillarTitle}>{title}</Text>
              <Feather name={open ? "chevron-up" : "chevron-down"} size={20} color="#B9B7FF" accessible={false}/>
            </TouchableOpacity>
            {open && <View testID={"ethics-pillar-body-" + pillar.number} style={s.body}>
              {pillar.paragraphs[language].map((paragraph, index) => <Text key={index} style={s.paragraph}>{paragraph}</Text>)}
            </View>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0D0E11" },
  content: { padding: 16, gap: 12, width: "100%", maxWidth: 780, alignSelf: "center" },
  title: { color: "#FFFFFF", fontSize: 23, fontWeight: "700", flexShrink: 1 },
  notice: { padding: 14, gap: 5, borderRadius: 14, backgroundColor: "#222137", borderWidth: 1, borderColor: "#57548B" },
  noticeTitle: { color: "#D4D2FF", fontSize: 15, fontWeight: "700" },
  noticeText: { color: "#DEDDEB", fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: "#1A1B1F", borderRadius: 16, borderWidth: 1, borderColor: "#454451" },
  toggle: { minHeight: 64, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  number: { color: "#B9B7FF", fontSize: 18, fontWeight: "700", flexShrink: 0 },
  pillarTitle: { color: "#FFFFFF", fontSize: 16, lineHeight: 24, fontWeight: "600", flex: 1, minWidth: 0 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  paragraph: { color: "#E3E4EB", fontSize: 15, lineHeight: 24, flexShrink: 1 },
});
