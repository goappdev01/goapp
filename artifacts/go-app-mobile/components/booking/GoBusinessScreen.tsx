import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  AvailabilityWindow,
  BookableItem,
  Business,
  createAvailabilityWindow,
  createBookableItem,
  createBusiness,
  deleteAvailabilityWindow,
  deleteBookableItem,
  getAvailabilityWindows,
  getBookableItems,
  getBusinesses,
  saveAvailabilityWindow,
  saveBusiness,
  saveBookableItem,
} from "@/data/booking";
import { useLanguage } from "@/contexts/LanguageContext";

const BG          = "#F7F8FA";
const CARD        = "#FFFFFF";
const BORDER      = "rgba(0,0,0,0.08)";
const TEXT        = "#111827";
const GRAY        = "#6B7280";
const DIM         = "#9CA3AF";
const PLACEHOLDER = "#C0C4CC";
const ACCENT      = "#4A80BD";

function ServiceCard({
  item, onPatch, onRemove,
}: {
  item: BookableItem;
  onPatch: (u: BookableItem) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={card.wrap}>
      <TextInput
        style={card.nameInput}
        value={item.title}
        onChangeText={v => onPatch({ ...item, title: v })}
        placeholder={t("biz_service_name_ph")}
        placeholderTextColor={PLACEHOLDER}
        returnKeyType="done"
      />

      <View style={card.row}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>{t("biz_duration_label")}</Text>
          <Text style={card.sub}>{t("biz_how_long")}</Text>
        </View>
        <View style={card.numBox}>
          <TextInput
            style={card.numInput}
            value={String(item.durationMinutes)}
            onChangeText={v => onPatch({ ...item, durationMinutes: parseInt(v) || 30 })}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <Text style={card.numUnit}>min</Text>
        </View>
      </View>

      <View style={card.row}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>{t("biz_max_persons")}</Text>
          <Text style={card.sub}>{t("biz_per_booking")}</Text>
        </View>
        <View style={card.numBox}>
          <TextInput
            style={card.numInput}
            value={String(item.customerCapacity)}
            onChangeText={v => onPatch({ ...item, customerCapacity: parseInt(v) || 1 })}
            keyboardType="numeric"
            returnKeyType="done"
          />
        </View>
      </View>

      <View style={card.row}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>{t("biz_price_label")}</Text>
          <Text style={card.sub}>{t("biz_if_free")}</Text>
        </View>
        <View style={card.numBox}>
          <TextInput
            style={card.numInput}
            value={item.price ? String(item.price) : ""}
            onChangeText={v => onPatch({ ...item, price: parseFloat(v) || 0 })}
            keyboardType="numeric"
            returnKeyType="done"
            placeholder="0"
            placeholderTextColor={PLACEHOLDER}
          />
          <Text style={card.numUnit}>€</Text>
        </View>
      </View>

      <View style={[card.row, { borderBottomWidth: 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>{t("biz_active_label")}</Text>
          <Text style={card.sub}>{t("biz_clients_can_book")}</Text>
        </View>
        <Switch
          value={item.active}
          onValueChange={v => onPatch({ ...item, active: v })}
          trackColor={{ false: "#E5E7EB", true: ACCENT }}
          thumbColor={item.active ? "#fff" : "#f4f3f4"}
          ios_backgroundColor="#E5E7EB"
        />
      </View>

      <TouchableOpacity onPress={onRemove} activeOpacity={0.7} hitSlop={8} style={card.removeRow}>
        <Feather name="trash-2" size={13} color={DIM} />
        <Text style={card.removeTxt}>{t("biz_remove_service")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ScheduleCard({
  win, onPatch, onRemove,
}: {
  win: AvailabilityWindow;
  onPatch: (u: AvailabilityWindow) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const DAYS = [
    t("day_sun").slice(0, 3).toUpperCase(),
    t("day_mon").slice(0, 3).toUpperCase(),
    t("day_tue").slice(0, 3).toUpperCase(),
    t("day_wed").slice(0, 3).toUpperCase(),
    t("day_thu").slice(0, 3).toUpperCase(),
    t("day_fri").slice(0, 3).toUpperCase(),
    t("day_sat").slice(0, 3).toUpperCase(),
  ];
  return (
    <View style={card.wrap}>
      <Text style={card.label}>{t("biz_day_of_week")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ marginTop: 10, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {DAYS.map((day, idx) => {
            const sel = win.weekday === idx;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => onPatch({ ...win, weekday: idx })}
                activeOpacity={0.75}
                style={[card.dayPill, sel && card.dayPillSel]}
              >
                <Text style={[card.dayTxt, sel && card.dayTxtSel]}>{day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>{t("biz_opening_label")}</Text>
          <View style={[card.numBox, { marginTop: 8 }]}>
            <TextInput
              style={card.numInput}
              value={String(win.visibleStartHour)}
              onChangeText={v => onPatch({ ...win, visibleStartHour: parseInt(v) || 0 })}
              keyboardType="numeric"
              returnKeyType="done"
            />
            <Text style={card.numUnit}>h</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>{t("biz_closing_label")}</Text>
          <View style={[card.numBox, { marginTop: 8 }]}>
            <TextInput
              style={card.numInput}
              value={String(win.visibleEndHour)}
              onChangeText={v => onPatch({ ...win, visibleEndHour: parseInt(v) || 18 })}
              keyboardType="numeric"
              returnKeyType="done"
            />
            <Text style={card.numUnit}>h</Text>
          </View>
        </View>
      </View>

      <View style={[card.row, {
        borderBottomWidth: 0, marginTop: 14,
        paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER,
      }]}>
        <Text style={card.label}>{t("biz_active_label")}</Text>
        <Switch
          value={win.active}
          onValueChange={v => onPatch({ ...win, active: v })}
          trackColor={{ false: "#E5E7EB", true: ACCENT }}
          thumbColor={win.active ? "#fff" : "#f4f3f4"}
          ios_backgroundColor="#E5E7EB"
        />
      </View>

      <TouchableOpacity onPress={onRemove} activeOpacity={0.7} hitSlop={8} style={card.removeRow}>
        <Feather name="trash-2" size={13} color={DIM} />
        <Text style={card.removeTxt}>{t("biz_remove_schedule")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function GoBusinessContent({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  const [biz,     setBiz]     = useState<Business | null>(null);
  const [items,   setItems]   = useState<BookableItem[]>([]);
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let all   = await getBusinesses();
    let found = all[0] ?? null;
    if (!found) {
      found = await createBusiness({
        name: "", category: "", location: "", phone: "",
        bookingActive: true,
        bookingColor: "#4A80BD",
        timezone: "Europe/Madrid",
      });
    }
    if (!found.bookingActive) {
      found = { ...found, bookingActive: true };
      await saveBusiness(found);
    }
    setBiz(found);
    const [its, wins] = await Promise.all([
      getBookableItems(found.id),
      getAvailabilityWindows(found.id),
    ]);
    setItems(its);
    setWindows(wins);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const saveBizField = async (field: keyof Business, value: any) => {
    if (!biz) return;
    const updated = { ...biz, [field]: value };
    setBiz(updated);
    await saveBusiness(updated);
  };

  const addItem = async () => {
    if (!biz) return;
    const item = await createBookableItem({
      businessId: biz.id, title: "", type: "",
      durationMinutes: 30, customerCapacity: 1, unitQuantity: 1,
      price: 0, paymentRequired: false, active: true, visible: true,
    });
    setItems(p => [...p, item]);
    Haptics.selectionAsync().catch(() => {});
  };

  const patchItem = async (updated: BookableItem) => {
    setItems(p => p.map(i => i.id === updated.id ? updated : i));
    await saveBookableItem(updated);
  };

  const removeItem = (id: string) => {
    Alert.alert(t("biz_remove_service"), t("biz_remove_service_confirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("delete"), style: "destructive", onPress: async () => {
        await deleteBookableItem(id);
        setItems(p => p.filter(i => i.id !== id));
      }},
    ]);
  };

  const addWindow = async () => {
    if (!biz) return;
    const w = await createAvailabilityWindow({
      businessId: biz.id, weekday: 1,
      visibleStartHour: 9, visibleEndHour: 18, active: true,
    });
    setWindows(p => [...p, w]);
    Haptics.selectionAsync().catch(() => {});
  };

  const patchWindow = async (updated: AvailabilityWindow) => {
    setWindows(p => p.map(w => w.id === updated.id ? updated : w));
    await saveAvailabilityWindow(updated);
  };

  const removeWindow = async (id: string) => {
    await deleteAvailabilityWindow(id);
    setWindows(p => p.filter(w => w.id !== id));
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t("biz_my_business")}</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: GRAY, fontSize: 16 }}>{t("biz_loading")}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          <StepLabel n="1" title={t("biz_step1_title")} />
          <View style={s.stepCard}>
            <TextInput
              style={s.bigInput}
              value={biz!.name}
              onChangeText={v => setBiz(b => b ? { ...b, name: v } : b)}
              onBlur={() => saveBizField("name", biz!.name)}
              placeholder={t("biz_biz_name_ph")}
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
            />
          </View>

          <StepLabel n="2" title={t("biz_step2_title")} />
          <View style={s.stepCard}>
            <TextInput
              style={s.bigInput}
              value={biz!.category}
              onChangeText={v => setBiz(b => b ? { ...b, category: v } : b)}
              onBlur={() => saveBizField("category", biz!.category)}
              placeholder={t("biz_category_eg_ph")}
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
            />
          </View>

          <StepLabel n="3" title={t("biz_step3_title")} />
          <View style={s.stepCard}>
            <TextInput
              style={s.bigInput}
              value={biz!.location}
              onChangeText={v => setBiz(b => b ? { ...b, location: v } : b)}
              onBlur={() => saveBizField("location", biz!.location)}
              placeholder={t("biz_location_ph")}
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
            />
          </View>

          <View style={s.sep} />
          <StepLabel n="4" title={t("biz_step4_title")} />
          <Text style={s.secHint}>{t("biz_step4_hint")}</Text>

          {items.map(item => (
            <ServiceCard
              key={item.id}
              item={item}
              onPatch={patchItem}
              onRemove={() => removeItem(item.id)}
            />
          ))}

          <TouchableOpacity onPress={addItem} activeOpacity={0.8} style={s.addBtn}>
            <Feather name="plus" size={18} color={ACCENT} />
            <Text style={s.addBtnTxt}>
              {items.length === 0 ? t("biz_add_first_service") : t("biz_add_another_service")}
            </Text>
          </TouchableOpacity>

          <View style={s.sep} />
          <StepLabel n="5" title={t("biz_step5_title")} />
          <Text style={s.secHint}>{t("biz_step5_hint")}</Text>

          {windows.map(w => (
            <ScheduleCard
              key={w.id}
              win={w}
              onPatch={patchWindow}
              onRemove={() => removeWindow(w.id)}
            />
          ))}

          <TouchableOpacity onPress={addWindow} activeOpacity={0.8} style={s.addBtn}>
            <Feather name="plus" size={18} color={ACCENT} />
            <Text style={s.addBtnTxt}>
              {windows.length === 0 ? t("biz_add_schedule") : t("biz_add_another_schedule")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function StepLabel({ n, title }: { n: string; title: string }) {
  return (
    <View style={s.stepRow}>
      <View style={s.badge}>
        <Text style={s.badgeNum}>{n}</Text>
      </View>
      <Text style={s.stepTitle}>{title}</Text>
    </View>
  );
}

const card = StyleSheet.create({
  wrap:       { marginHorizontal: 16, marginBottom: 10, borderRadius: 18,
                backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 20,
                shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  nameInput:  { color: TEXT, fontSize: 18, fontWeight: "600",
                paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 2 },
  row:        { flexDirection: "row", alignItems: "center",
                paddingVertical: 13, gap: 12,
                borderBottomWidth: 1, borderBottomColor: BORDER },
  label:      { color: TEXT, fontSize: 15, fontWeight: "500" },
  sub:        { color: DIM, fontSize: 12, marginTop: 2 },
  numBox:     { flexDirection: "row", alignItems: "center",
                backgroundColor: BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 4,
                borderWidth: 1, borderColor: BORDER },
  numInput:   { color: TEXT, fontSize: 18, fontWeight: "600",
                minWidth: 36, textAlign: "center" },
  numUnit:    { color: GRAY, fontSize: 13 },
  removeRow:  { flexDirection: "row", alignItems: "center", gap: 6,
                marginTop: 14, paddingTop: 12,
                borderTopWidth: 1, borderTopColor: BORDER },
  removeTxt:  { color: DIM, fontSize: 13 },
  dayPill:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  dayPillSel: { backgroundColor: ACCENT + "15", borderColor: ACCENT },
  dayTxt:     { color: GRAY, fontSize: 14, fontWeight: "500" },
  dayTxtSel:  { color: ACCENT, fontWeight: "700" },
});

const s = StyleSheet.create({
  header:     { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16,
                borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle:{ color: TEXT, fontSize: 20, fontWeight: "800" },

  stepRow:    { flexDirection: "row", alignItems: "center", gap: 12,
                paddingHorizontal: 16, marginTop: 28, marginBottom: 12 },
  badge:      { width: 28, height: 28, borderRadius: 14,
                backgroundColor: ACCENT + "15", alignItems: "center", justifyContent: "center" },
  badgeNum:   { color: ACCENT, fontSize: 14, fontWeight: "700" },
  stepTitle:  { color: TEXT, fontSize: 18, fontWeight: "600", flex: 1 },

  stepCard:   { marginHorizontal: 16, borderRadius: 16,
                backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
                paddingHorizontal: 18 },
  bigInput:   { color: TEXT, fontSize: 18, paddingVertical: 14 },

  sep:        { height: 1, backgroundColor: BORDER,
                marginHorizontal: 16, marginTop: 32, marginBottom: 4 },
  secHint:    { color: GRAY, fontSize: 14, paddingHorizontal: 16,
                marginBottom: 14, marginTop: 4, lineHeight: 20 },

  addBtn:     { flexDirection: "row", alignItems: "center", gap: 10,
                marginHorizontal: 16, marginTop: 4,
                paddingVertical: 16, paddingHorizontal: 20,
                borderRadius: 16, borderWidth: 1.5,
                borderColor: ACCENT + "40",
                borderStyle: "dashed",
                backgroundColor: ACCENT + "08" },
  addBtnTxt:  { fontSize: 16, fontWeight: "600", color: ACCENT },
});
