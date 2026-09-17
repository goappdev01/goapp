/**
 * GoCalConfigPanel — Panel de configuración compartido entre Calendario y GO Reservas.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Totalmente controlado (sin estado interno). El padre gestiona el estado y la
 * persistencia en AsyncStorage. Mismo visual que el panel del Calendario normal.
 *
 * Regla: "Si se mejora el Calendario, GO Reservas recibe la mejora automáticamente."
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { DensityKey, CalDayNightMode } from "@/components/AgendaOperativa";
import type { CalSizeKey } from "@/constants/goSizes";

const CAL_SIZES: CalSizeKey[] = ["GO_CAL_SMALL", "GO_CAL_MEDIUM", "GO_CAL_LARGE"];

export interface GoCalConfigPanelProps {
  density: DensityKey;
  onDensityChange: (d: DensityKey) => void;
  timedTaskCount?: number;
  showHours: boolean;
  onShowHoursChange: (v: boolean) => void;
  dayNightMode: CalDayNightMode;
  onDayNightModeChange: (m: CalDayNightMode) => void;
  calSize: CalSizeKey;
  onCalSizeChange: (s: CalSizeKey) => void;
  viewMode: "dia" | "semana";
  onViewModeChange: (v: "dia" | "semana") => void;
  monthGridOpen?: boolean;
  onToggleMonthGrid?: () => void;
}

function chip(active: boolean) {
  return {
    paddingHorizontal: active ? 10 : 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: active ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: active ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.13)",
  } as const;
}

function chipTxt(active: boolean) {
  return {
    color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.38)",
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  };
}

export function GoCalConfigPanel({
  density,
  onDensityChange,
  timedTaskCount = 0,
  showHours,
  onShowHoursChange,
  dayNightMode,
  onDayNightModeChange,
  calSize,
  onCalSizeChange,
  viewMode,
  onViewModeChange,
  monthGridOpen = false,
  onToggleMonthGrid,
}: GoCalConfigPanelProps) {
  const effectiveMin =
    density === "auto"
      ? timedTaskCount <= 3 ? 60 : timedTaskCount <= 8 ? 30 : 15
      : density === "1h" ? 60 : density === "30min" ? 30 : 15;
  const effectiveLabel = effectiveMin === 60 ? "1H" : effectiveMin === 30 ? "30" : "15";

  return (
    <View style={{ paddingHorizontal: 4, marginHorizontal: 0, paddingTop: 10, paddingBottom: 2, gap: 8 }}>

      {/* VISTA */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {(["dia", "semana"] as const).map((v) => {
          const isActive = viewMode === v;
          return (
            <TouchableOpacity
              key={v}
              onPress={() => { Haptics.selectionAsync(); onViewModeChange(v); }}
              activeOpacity={0.7}
              hitSlop={6}
              style={[chip(isActive), { alignItems: "center" }]}
            >
              <Text style={chipTxt(isActive)} numberOfLines={1}>
                {v === "dia" ? "DÍA" : "SEM"}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* MES — solo si el padre provee onToggleMonthGrid */}
        {!!onToggleMonthGrid && (
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); onToggleMonthGrid(); }}
            activeOpacity={0.7}
            hitSlop={6}
            style={[chip(monthGridOpen), { flexDirection: "row", alignItems: "center", gap: 4 }]}
          >
            <Feather
              name="calendar"
              size={9}
              color={monthGridOpen ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.38)"}
            />
            <Text style={chipTxt(monthGridOpen)} numberOfLines={1}>MES</Text>
          </TouchableOpacity>
        )}
        {/* HORAS */}
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); onShowHoursChange(!showHours); }}
          activeOpacity={0.7}
          hitSlop={6}
          style={[chip(showHours), { flexDirection: "row", alignItems: "center", gap: 3 }]}
        >
          <Feather
            name="clock"
            size={9}
            color={showHours ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.38)"}
          />
          <Text style={chipTxt(showHours)} numberOfLines={1}>HORAS</Text>
        </TouchableOpacity>
      </View>

      {/* ESCALA + TAMAÑOS */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {(["auto", "1h", "30min", "15min"] as const).map((d) => {
          const isActive = density === d;
          const label =
            d === "auto"
              ? isActive ? `AUTO·${effectiveLabel}` : "AUTO"
              : d === "1h" ? "1H" : d === "30min" ? "30" : "15";
          return (
            <TouchableOpacity
              key={d}
              onPress={() => { Haptics.selectionAsync(); onDensityChange(d); }}
              activeOpacity={0.7}
              hitSlop={6}
              style={[chip(isActive), { alignItems: "center" }]}
            >
              <Text style={chipTxt(isActive)} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        {/* TAMAÑOS — cicla entre pequeño·mediano·grande */}
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            const next = CAL_SIZES[(CAL_SIZES.indexOf(calSize) + 1) % CAL_SIZES.length];
            onCalSizeChange(next);
          }}
          hitSlop={10}
          style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.07)",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
            alignItems: "center", justifyContent: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.65)" }} />
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: "rgba(255,255,255,0.65)" }} />
            <View style={{ width: 8, height: 8, borderRadius: 4,   backgroundColor: "rgba(255,255,255,0.65)" }} />
          </View>
        </TouchableOpacity>
      </View>

      {/* TEMA */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {([
          { key: "claro"  as const, icon: "sun"    as const, label: "CLARO"  },
          { key: "mixto"  as const, icon: "circle" as const, label: "MIXTO"  },
          { key: "oscuro" as const, icon: "moon"   as const, label: "OSCURO" },
        ]).map(({ key, icon, label }) => {
          const isActive = dayNightMode === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => { Haptics.selectionAsync(); onDayNightModeChange(key); }}
              activeOpacity={0.7}
              hitSlop={6}
              style={[chip(isActive), { flexDirection: "row", alignItems: "center", gap: 4 }]}
            >
              <Feather
                name={icon}
                size={9}
                color={isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.38)"}
              />
              <Text style={chipTxt(isActive)} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

    </View>
  );
}
