import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

export type WeatherHourData = {
  hour: number;
  dateISO: string;
  weatherCode: number;
  temperature: number;
  precipProbability: number;
};

export type WeatherDayData = {
  dateISO: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  sunrise: string;
  sunset: string;
  windMax?: number;      // km/h — max 10m wind speed for the day
  precipMax?: number;    // % — max precipitation probability for the day
};

export type WeatherContextData = {
  loading: boolean;
  hasLocation: boolean;
  weatherHours: Record<string, WeatherHourData>;
  weatherDays: Record<string, WeatherDayData>;
  todaySunrise: Date | null;
  todaySunset: Date | null;
  dayNightProgress: number;
};

const TRANSITION_MS = 45 * 60 * 1000;

function computeDayProgress(sunrise: Date, sunset: Date): number {
  const now = Date.now();
  const sr = sunrise.getTime();
  const ss = sunset.getTime();
  if (now <= sr - TRANSITION_MS) return 0;
  if (now >= ss + TRANSITION_MS) return 0;
  if (now >= sr + TRANSITION_MS && now <= ss - TRANSITION_MS) return 1;
  if (now < sr + TRANSITION_MS) {
    return (now - (sr - TRANSITION_MS)) / (TRANSITION_MS * 2);
  }
  return 1 - (now - (ss - TRANSITION_MS)) / (TRANSITION_MS * 2);
}

function getDefaultDayProgress(): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sr = new Date(today.getTime() + 6 * 60 * 60 * 1000);
  const ss = new Date(today.getTime() + 22 * 60 * 60 * 1000);
  return computeDayProgress(sr, ss);
}

const EMPTY: WeatherContextData = {
  loading: true,
  hasLocation: false,
  weatherHours: {},
  weatherDays: {},
  todaySunrise: null,
  todaySunset: null,
  dayNightProgress: getDefaultDayProgress(),
};

export function useWeatherContext(): WeatherContextData {
  const [state, setState] = useState<WeatherContextData>(EMPTY);
  const sunriseRef = useRef<Date | null>(null);
  const sunsetRef = useRef<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      const sr = sunriseRef.current;
      const ss = sunsetRef.current;
      setState((prev) => ({
        ...prev,
        dayNightProgress: sr && ss ? computeDayProgress(sr, ss) : getDefaultDayProgress(),
      }));
    };
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: "denied" as const }));

      if (status !== "granted") {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, hasLocation: false }));
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      }).catch(() => null);

      if (cancelled || !loc) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, hasLocation: false }));
        return;
      }

      const { latitude, longitude } = loc.coords;
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
        `&hourly=temperature_2m,precipitation_probability,weathercode` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,windspeed_10m_max,precipitation_probability_max` +
        `&timezone=auto&forecast_days=7`;

      const res = await fetch(url).catch(() => null);
      if (cancelled || !res || !res.ok) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, hasLocation: true }));
        return;
      }

      const data = await res.json().catch(() => null);
      if (cancelled || !data) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, hasLocation: true }));
        return;
      }

      const weatherHours: Record<string, WeatherHourData> = {};
      const hourlyTimes: string[] = data.hourly?.time ?? [];
      const hourlyTemps: number[] = data.hourly?.temperature_2m ?? [];
      const hourlyPrecip: number[] = data.hourly?.precipitation_probability ?? [];
      const hourlyCodes: number[] = data.hourly?.weathercode ?? [];

      for (let i = 0; i < hourlyTimes.length; i++) {
        const isoStr = hourlyTimes[i] as string;
        const dateISO = isoStr.slice(0, 10);
        const hour = parseInt(isoStr.slice(11, 13), 10);
        const key = `${dateISO}|${String(hour).padStart(2, "0")}`;
        weatherHours[key] = {
          hour,
          dateISO,
          weatherCode: hourlyCodes[i] ?? 0,
          temperature: Math.round(hourlyTemps[i] ?? 0),
          precipProbability: Math.round(hourlyPrecip[i] ?? 0),
        };
      }

      const weatherDays: Record<string, WeatherDayData> = {};
      const dailyDates: string[] = data.daily?.time ?? [];
      const dailyCodes: number[] = data.daily?.weathercode ?? [];
      const dailyTempMax: number[] = data.daily?.temperature_2m_max ?? [];
      const dailyTempMin: number[] = data.daily?.temperature_2m_min ?? [];
      const dailySunrises: string[] = data.daily?.sunrise ?? [];
      const dailySunsets: string[] = data.daily?.sunset ?? [];
      const dailyWindMax: number[] = data.daily?.windspeed_10m_max ?? [];
      const dailyPrecipMax: number[] = data.daily?.precipitation_probability_max ?? [];

      let todaySunrise: Date | null = null;
      let todaySunset: Date | null = null;
      const todayISO = new Date().toISOString().slice(0, 10);

      for (let i = 0; i < dailyDates.length; i++) {
        const dateISO = dailyDates[i] as string;
        weatherDays[dateISO] = {
          dateISO,
          weatherCode: dailyCodes[i] ?? 0,
          tempMax: Math.round(dailyTempMax[i] ?? 0),
          tempMin: Math.round(dailyTempMin[i] ?? 0),
          sunrise: dailySunrises[i] ?? "",
          sunset: dailySunsets[i] ?? "",
          windMax: dailyWindMax[i] != null ? Math.round(dailyWindMax[i] as number) : undefined,
          precipMax: dailyPrecipMax[i] != null ? Math.round(dailyPrecipMax[i] as number) : undefined,
        };
        if (dateISO === todayISO) {
          todaySunrise = dailySunrises[i] ? new Date(dailySunrises[i] as string) : null;
          todaySunset = dailySunsets[i] ? new Date(dailySunsets[i] as string) : null;
        }
      }

      if (todaySunrise) sunriseRef.current = todaySunrise;
      if (todaySunset) sunsetRef.current = todaySunset;

      if (!cancelled) {
        setState({
          loading: false,
          hasLocation: true,
          weatherHours,
          weatherDays,
          todaySunrise,
          todaySunset,
          dayNightProgress: todaySunrise && todaySunset
            ? computeDayProgress(todaySunrise, todaySunset)
            : getDefaultDayProgress(),
        });
      }
    }

    init().catch(() => {
      if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
    });

    return () => { cancelled = true; };
  }, []);

  return state;
}

export function getWeatherForHour(
  weatherHours: WeatherContextData["weatherHours"],
  dateISO: string,
  hour: number,
): WeatherHourData | null {
  return weatherHours[`${dateISO}|${String(hour).padStart(2, "0")}`] ?? null;
}

export function getWeatherFeatherIcon(code: number): string {
  if (code === 0) return "sun";
  if (code <= 2) return "cloud";
  if (code === 3) return "cloud";
  if (code <= 48) return "wind";
  if (code <= 55) return "cloud-drizzle";
  if (code <= 65) return "cloud-rain";
  if (code <= 77) return "cloud-snow";
  if (code <= 82) return "cloud-rain";
  if (code <= 86) return "cloud-snow";
  return "cloud-lightning";
}

export function getWeatherColor(code: number): string {
  if (code === 0)  return "#FFC300"; // ☀️ sol — amarillo cálido
  if (code <= 2)   return "#a8c8de"; // 🌤 parcialmente nublado — azul claro legible
  if (code === 3)  return "#90afc0"; // ☁️ cubierto — gris-azul más visible
  if (code <= 48)  return "#c8d8e4"; // 🌫 niebla/bruma — gris muy claro (era invisible)
  if (code <= 55)  return "#64B5F6"; // 🌦 llovizna — azul claro
  if (code <= 65)  return "#42a5f5"; // 🌧 lluvia — azul vivo
  if (code <= 77)  return "#90CAF9"; // 🌨 nieve — azul hielo
  if (code <= 82)  return "#1e9af5"; // 🌧 chubascos — azul brillante
  if (code <= 86)  return "#B3E5FC"; // 🌨 nieve intermitente — azul pálido
  return "#AB47BC";                  // ⛈ tormenta — violeta
}

export function isAdverseWeather(code: number): boolean {
  return code >= 51;
}
