import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");
  const choiceRevision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const revision = choiceRevision.current;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled || revision !== choiceRevision.current) return;
        if (stored && (IMPLEMENTED as string[]).includes(stored)) {
          setLangState(stored as Lang);
        } else {
          setLangState("es");
        }
      })
      .catch(() => {
        if (!cancelled && revision === choiceRevision.current) setLangState("es");
      });
    return () => { cancelled = true; };
  }, []);

  const setLang = useCallback((l: Lang) => {
    choiceRevision.current++;
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => translations[lang][key] ?? translations.es[key],
    [lang],
  );

  // Spain is the default locale; an explicit supported preference is preserved.
  const locale = lang === "es" ? "es-ES" : "en-US";

  return (
    <LanguageContext.Provider value={{ lang, locale, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
