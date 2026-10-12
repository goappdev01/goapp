import {
  Inter_400Regular,
  Inter_700Bold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { GoModeProvider } from "@/contexts/GoModeContext";
import { GoBusinessAccessProvider } from "@/contexts/GoBusinessAccessContext";
import { GoAdminAccessProvider } from "@/contexts/GoAdminAccessContext";
import { GoViewProvider } from "@/contexts/GoViewContext";
import { GoNotificationProvider } from "@/contexts/GoNotificationContext";
import { OwnerBusinessDemoProvider } from "@/contexts/OwnerBusinessDemoContext";
import { OwnerContextSurface } from "@/components/debug/OwnerContextIndicator";
import { DEFAULT_BUSINESS_CONFIG } from "@/contexts/GoBusinessConfigContext";
import { GoBusinessConfigProvider } from "@/contexts/GoBusinessConfigContext";
import { GoPushInitializer } from "@/services/GoPushService";
import { seedDemoBusinessIfNeeded, syncConfigToBusinessRegistry } from "@/data/seedDemoData";
import { seedNemesiDemoIfNeeded } from "@/data/goSeedNemesiDemo";
import { seedDemoBusinessesIfNeeded } from "@/data/goSeedDemoBusinesses";
import { purgeBookingsOnce, migrateSlotKeys, migrateBookingStaffIds } from "@/data/booking";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
    Inter_900Black,
  });

  useEffect(() => {
    // Orden de arranque:
    //   1. seedNemesiDemoIfNeeded: purga empresa antigua "nemesi-peluqueria-demo"
    //      de todos los storage keys, luego siembra "Nemesi de Molina" si es
    //      primera instalación.
    //   2. seedDemoBusinessIfNeeded: no-op (compatibilidad; la lógica se migró al paso 1).
    //   3. syncConfigToBusinessRegistry: propaga go_business_config_v1 → go_businesses_v1.
    (async () => {
      // 0. Purga única de reservas de demo (solo la primera vez)
      await purgeBookingsOnce();
      await seedNemesiDemoIfNeeded();
      await seedDemoBusinessIfNeeded();
      await seedDemoBusinessesIfNeeded();
      await syncConfigToBusinessRegistry();
      // Backfill slotKey en reservas antiguas + purga duplicados
      await migrateSlotKeys();
      // Migra staffIds legacy ("st-isa") a formato canónico ("nemesi_molina_staff_isa")
      await migrateBookingStaffIds();
    })();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <LanguageProvider>
          <GoModeProvider>
            <GoAdminAccessProvider>
            <GoViewProvider>
            <OwnerBusinessDemoProvider initialConfig={DEFAULT_BUSINESS_CONFIG}>
            <GoBusinessAccessProvider>
            <GoBusinessConfigProvider>
              <GoNotificationProvider>
                <GoPushInitializer />
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <OwnerContextSurface>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                    </Stack>
                    </OwnerContextSurface>
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </GoNotificationProvider>
            </GoBusinessConfigProvider>
            </GoBusinessAccessProvider>
            </OwnerBusinessDemoProvider>
            </GoViewProvider>
            </GoAdminAccessProvider>
          </GoModeProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
