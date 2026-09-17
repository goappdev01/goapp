import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NativeModules, Platform } from "react-native";
import { translations, type Lang, type TranslationKey } from "@/i18n/translations";

const IMPLEMENTED: readonly Lang[] = ["es", "en"];

interface LanguageContextValue {
  lang: Lang;
  locale: string;   // Locale completo: "es-ES", "en-US", etc. para formatHourByLocale
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "es",
  locale: "es-ES",
  setLang: () => {},
  t: (key) => translations.es[key],
});

const STORAGE_KEY = "go_app_language_v1";

function getDeviceLocale(): string {
  try {
    if (Platform.OS === "web") {
      return (
        (navigator as any).language ||
        (navigator as any).userLanguage ||
        "es"
      ).toLowerCase();
    }
    const iosLocale: string =
      NativeModules.SettingsManager?.settings?.AppleLocale ||
      NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
      "";
    const androidLocale: string =
      NativeModules.I18nManager?.localeIdentifier || "";
    return (iosLocale || androidLocale || "es").toLowerCase();
  } catch {
    return "es";
  }
}

function detectDeviceLang(): Lang {
  const locale = getDeviceLocale();
  const code = locale.split(/[-_]/)[0];
  if ((IMPLEMENTED as string[]).includes(code)) return code as Lang;
  return "es";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  // Locale completo del dispositivo (ej: "es-ES", "en-US").
  // Se normaliza: guión bajo → guión y se capitaliza la región (es_es → es-ES).
  const deviceLocale = (() => {
    const raw = getDeviceLocale(); // ya en minúsculas, ej: "es-es" o "es_es"
    const parts = raw.split(/[-_]/);
    if (parts.length >= 2)
      return `${parts[0]}-${parts[1].toUpperCase()}`;
    return raw;
  })();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && (IMPLEMENTED as string[]).includes(stored)) {
          setLangState(stored as Lang);
        } else {
          const detected = detectDeviceLang();
          setLangState(detected);
          AsyncStorage.setItem(STORAGE_KEY, detected).catch(() => {});
        }
      })
      .catch(() => {
        setLangState(detectDeviceLang());
      });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => translations[lang][key] ?? translations.es[key],
    [lang],
  );

  // Locale a exponer: si el dispositivo ya tiene la región correcta (ej: "es-ES"),
  // se usa tal cual; si solo hay idioma (ej: lang="es"), se completa con región por defecto.
  const locale = deviceLocale.startsWith(lang)
    ? deviceLocale
    : lang === "es" ? "es-ES" : "en-US";

  return (
    <LanguageContext.Provider value={{ lang, locale, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
