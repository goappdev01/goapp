import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { assistantApi } from "@/lib/bookingAssistant";
import { getAuthenticatedUserId } from "@/data/booking";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult:
    | ((e: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useBookingVoice(onText: (text: string, zone: boolean) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [status, setStatus] = useState<
    "idle" | "preparing" | "listening" | "transcribing"
  >("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const statusRef = useRef(status);
  const generation = useRef(0);
  const recognizer = useRef<Recognition | null>(null);
  const nativeQueue = useRef<Promise<void>>(Promise.resolve());
  const targetZone = useRef(false);
  const callback = useRef(onText);
  callback.current = onText;
  const changeStatus = useCallback((value: typeof status) => {
    statusRef.current = value;
    setStatus(value);
  }, []);
  // Serialize recorder ownership, so closing/reopening cannot stop a new session.
  const withRecorder = useCallback((operation: () => Promise<void>) => {
    const task = nativeQueue.current.then(operation, operation);
    nativeQueue.current = task.catch(() => {});
    return task;
  }, []);
  const cleanupNative = useCallback(async () => {
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {}
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {}
    const uri = recorder.uri;
    if (uri)
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }, [recorder]);
  const abort = useCallback(() => {
    generation.current++;
    if (recognizer.current) {
      recognizer.current.onend = null;
      recognizer.current.abort();
      recognizer.current = null;
    }
    if (Platform.OS !== "web") void withRecorder(cleanupNative);
    changeStatus("idle");
    setTranscript("");
  }, [changeStatus, cleanupNative, withRecorder]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (
        state === "background" ||
        (state === "inactive" && statusRef.current === "listening")
      )
        abort();
    });
    return () => {
      sub.remove();
      abort();
    };
  }, [abort]);
  const start = useCallback(
    async (zone = false) => {
      if (statusRef.current !== "idle") return;
      const token = ++generation.current;
      targetZone.current = zone;
      setTranscript("");
      setError("");
      changeStatus("preparing");
      if (Platform.OS === "web") {
        const scope = globalThis as unknown as SpeechWindow;
        const Constructor =
          scope.SpeechRecognition || scope.webkitSpeechRecognition;
        if (!Constructor) {
          setError(
            "Este navegador no admite dictado. Puedes escribir tu solicitud.",
          );
          changeStatus("idle");
          return;
        }
        const recognition = new Constructor();
        let latestText = "";
        let delivered = false;
        recognizer.current = recognition;
        recognition.lang = "es-ES";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onstart = () => {
          if (generation.current === token) changeStatus("listening");
        };
        recognition.onresult = (event) => {
          if (generation.current !== token) return;
          latestText = "";
          for (let i = 0; i < event.results.length; i++)
            latestText += event.results[i][0].transcript + " ";
          setTranscript(latestText.trim());
        };
        recognition.onerror = (event) => {
          if (generation.current !== token) return;
          if (event.error !== "no-speech" && event.error !== "aborted")
            setError(
              "No se pudo activar el micrófono. Revisa su permiso o escribe tu solicitud.",
            );
        };
        recognition.onend = () => {
          if (generation.current !== token || delivered) return;
          delivered = true;
          recognizer.current = null;
          changeStatus("idle");
          const text = latestText.trim();
          setTranscript("");
          if (text) callback.current(text, targetZone.current);
        };
        try {
          recognition.start();
        } catch {
          recognizer.current = null;
          setError(
            "Pulsa GO para activar el micrófono o escribe tu solicitud.",
          );
          changeStatus("idle");
        }
        return;
      }
      try {
        const capabilities = await assistantApi<{ transcription: boolean }>(
          "/capabilities",
        );
        if (generation.current !== token) return;
        if (!capabilities.transcription)
          throw new Error(
            "La voz no está disponible ahora. Puedes escribir tu solicitud.",
          );
        const userId = await getAuthenticatedUserId();
        if (generation.current !== token) return;
        if (!userId)
          throw new Error(
            "Inicia sesión desde tu perfil para usar la voz. También puedes escribir.",
          );
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (generation.current !== token) return;
        if (!permission.granted)
          throw new Error(
            "Permite el acceso al micrófono o escribe tu solicitud.",
          );
        await withRecorder(async () => {
          if (generation.current !== token) return;
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
          });
          await recorder.prepareToRecordAsync();
          if (generation.current !== token) {
            await cleanupNative();
            return;
          }
          recorder.record();
          changeStatus("listening");
        });
      } catch (e) {
        if (generation.current !== token) return;
        await withRecorder(async () => {
          if (generation.current === token) await cleanupNative();
        });
        if (generation.current !== token) return;
        setError(
          e instanceof Error ? e.message : "No se pudo iniciar la escucha.",
        );
        changeStatus("idle");
      }
    },
    [recorder, changeStatus, cleanupNative, withRecorder],
  );
  const stop = useCallback(async () => {
    if (statusRef.current !== "listening") return;
    if (recognizer.current) {
      changeStatus("transcribing");
      recognizer.current.stop();
      return;
    }
    const token = generation.current;
    const zone = targetZone.current;
    let uri: string | null = null;
    changeStatus("transcribing");
    try {
      await withRecorder(async () => {
        if (generation.current !== token) return;
        await recorder.stop();
        uri = recorder.uri;
        await setAudioModeAsync({ allowsRecording: false });
      });
      if (generation.current !== token) return;
      if (!uri) throw new Error("No se ha grabado audio.");
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || (info.size ?? 0) > 5000000)
        throw new Error(
          "La grabación es demasiado larga. Prueba con una solicitud más breve.",
        );
      if (generation.current !== token) return;
      const audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (generation.current !== token) return;
      const result = await assistantApi<{ text: string }>("/transcribe", {
        audio,
        mime: "audio/m4a",
      });
      if (generation.current === token && result.text.trim())
        callback.current(result.text.trim(), zone);
      else if (generation.current === token)
        setError(
          "No he oído una solicitud. Pulsa GO para intentarlo de nuevo.",
        );
    } catch (e) {
      if (generation.current === token)
        setError(e instanceof Error ? e.message : "No se pudo transcribir.");
    } finally {
      // Delete only this stopped recording; a later session may already be active.
      if (uri)
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      if (generation.current === token) {
        changeStatus("idle");
        setTranscript("");
      }
    }
  }, [recorder, changeStatus, withRecorder]);
  // Bound the recording without presenting countdowns or percentages.
  useEffect(() => {
    if (status !== "listening" || Platform.OS === "web") return;
    const timer = setTimeout(() => {
      void stop();
    }, 60000);
    return () => clearTimeout(timer);
  }, [status, stop]);
  return {
    status,
    transcript,
    error,
    start,
    stop,
    abort,
    toggle: () => (statusRef.current === "listening" ? stop() : start()),
  };
}
