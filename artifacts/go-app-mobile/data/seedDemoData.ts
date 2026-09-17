/**
 * seedDemoData.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHIVO DE COMPATIBILIDAD — solo exporta utilidades de arranque.
 *
 * La empresa demo "Nemesi de Molina" (nemesi_molina) es gestionada
 * exclusivamente por goSeedNemesiDemo.ts.
 *
 * La empresa antigua "Nemesi" (nemesi-peluqueria-demo) fue eliminada.
 * Su purga ocurre automáticamente en cada arranque dentro de
 * seedNemesiDemoIfNeeded() → _purgeOldDemoBusinesses().
 *
 * seedDemoBusinessIfNeeded() se mantiene exportada por compatibilidad
 * con importaciones existentes pero NO hace nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Business } from "./booking";
import type { BusinessConfig } from "@/contexts/GoBusinessConfigContext";

// DEMO_BUSINESS_ID apunta al ID canónico de la única empresa Nemesi
export const DEMO_BUSINESS_ID = "nemesi_molina";

// ── seedDemoBusinessIfNeeded — no-op ──────────────────────────────────────
// La siembra/purga ahora ocurre dentro de seedNemesiDemoIfNeeded (goSeedNemesiDemo.ts).
// Esta función se conserva para no romper importaciones existentes.
export async function seedDemoBusinessIfNeeded(): Promise<void> {
  // no-op intencionado
}

// ── Sincronización de arranque: config → go_businesses_v1 ────────────────────
//
// Garantiza que el negocio configurado en go_business_config_v1 existe en
// go_businesses_v1 con bookingActive: true ANTES de que GoBusinessConfigContext
// monte su useEffect. Se llama desde _layout.tsx junto al seed demo, así el
// buscador puede encontrar el negocio del usuario desde el primer arranque.

export async function syncConfigToBusinessRegistry(): Promise<void> {
  try {
    const rawConfig = await AsyncStorage.getItem("go_business_config_v1");
    if (!rawConfig) return;
    const cfg = JSON.parse(rawConfig) as {
      businessName?: string;
      businessId?:   string;
      address?:      string;
      subId?:        string;
      sectorId?:     string;
      phone?:        string;
      whatsapp?:     string;
    };
    const name = cfg.businessName?.trim();
    if (!name) return;

    const rawBiz = await AsyncStorage.getItem("go_businesses_v1");
    const businesses: (Business & { bookingActive?: boolean })[] = rawBiz
      ? JSON.parse(rawBiz)
      : [];

    if (cfg.businessId) {
      const idx = businesses.findIndex((b) => b.id === cfg.businessId);
      if (idx >= 0) {
        const needsUpdate =
          businesses[idx].name         !== name                ||
          businesses[idx].bookingActive !== true               ||
          (cfg.phone    !== undefined && businesses[idx].phone    !== cfg.phone)    ||
          (cfg.whatsapp !== undefined && businesses[idx].whatsapp !== cfg.whatsapp);
        if (needsUpdate) {
          businesses[idx] = {
            ...businesses[idx],
            name,
            bookingActive: true,
            ...(cfg.phone    !== undefined ? { phone:    cfg.phone    } : {}),
            ...(cfg.whatsapp !== undefined ? { whatsapp: cfg.whatsapp } : {}),
          };
          await AsyncStorage.setItem("go_businesses_v1", JSON.stringify(businesses));
        }
        return;
      }
    }

    // Si no hay businessId en config o no se encontró, crear registro
    // solo si no existe ya otro negocio con el mismo nombre.
    const alreadyExists = businesses.some(
      (b) => b.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (!alreadyExists) {
      const newBiz: Business = {
        id:            cfg.businessId ?? `sync_${Date.now()}`,
        name,
        category:      cfg.subId ?? cfg.sectorId ?? "",
        location:      cfg.address?.trim() ?? "",
        phone:         cfg.phone    ?? "",
        whatsapp:      cfg.whatsapp,
        bookingActive: true,
        bookingColor:  "#3B82F6",
        timezone:      "Europe/Madrid",
        createdAt:     new Date().toISOString(),
      };
      businesses.push(newBiz);
      await AsyncStorage.setItem("go_businesses_v1", JSON.stringify(businesses));
    }
  } catch (err) {
    console.warn("[GO Sync] Error sincronizando config con registro de negocios:", err);
  }
}
