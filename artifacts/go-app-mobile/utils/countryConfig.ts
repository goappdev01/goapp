export type Market = "es" | "us" | "uk" | "fr" | "br";

export interface CountryConfig {
  countryCode: string;
  countryName: string;
  flag: string;
  language: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
  dateFormat: string;
  distanceUnit: "km" | "mi";
  market: Market;
}

export const COUNTRY_CONFIGS: Record<Market, CountryConfig> = {
  es: {
    countryCode: "ES",
    countryName: "España",
    flag: "🇪🇸",
    language: "es",
    currency: "EUR",
    currencySymbol: "€",
    timezone: "Europe/Madrid",
    dateFormat: "dd/MM/yyyy",
    distanceUnit: "km",
    market: "es",
  },
  us: {
    countryCode: "US",
    countryName: "United States",
    flag: "🇺🇸",
    language: "en",
    currency: "USD",
    currencySymbol: "$",
    timezone: "America/New_York",
    dateFormat: "MM/dd/yyyy",
    distanceUnit: "mi",
    market: "us",
  },
  uk: {
    countryCode: "GB",
    countryName: "United Kingdom",
    flag: "🇬🇧",
    language: "en",
    currency: "GBP",
    currencySymbol: "£",
    timezone: "Europe/London",
    dateFormat: "dd/MM/yyyy",
    distanceUnit: "mi",
    market: "uk",
  },
  fr: {
    countryCode: "FR",
    countryName: "France",
    flag: "🇫🇷",
    language: "fr",
    currency: "EUR",
    currencySymbol: "€",
    timezone: "Europe/Paris",
    dateFormat: "dd/MM/yyyy",
    distanceUnit: "km",
    market: "fr",
  },
  br: {
    countryCode: "BR",
    countryName: "Brasil",
    flag: "🇧🇷",
    language: "pt",
    currency: "BRL",
    currencySymbol: "R$",
    timezone: "America/Sao_Paulo",
    dateFormat: "dd/MM/yyyy",
    distanceUnit: "km",
    market: "br",
  },
};

export function detectMarketFromLocale(locale: string): Market {
  const l = locale.toLowerCase();
  if (l.startsWith("pt")) return "br";
  if (l.startsWith("fr")) return "fr";
  if (l === "en-gb" || l.startsWith("en-gb")) return "uk";
  if (l.startsWith("en")) return "us";
  if (l.startsWith("es")) return "es";
  return "es";
}

export const MARKET_STORAGE_KEY = "go_user_market_v1";
export const REGION_STORAGE_KEY = "go_user_region_v1";
export const FALLBACK_MARKET: Market = "es";
