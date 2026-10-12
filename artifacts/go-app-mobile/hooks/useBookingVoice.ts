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
  const recorderStatus = useRef<(event: { hasError: boolean; isFinished: boolean; mediaServicesDidReset?: boolean; url?: string | null }) => void>(() => {});
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, event => recorderStatus.current(event));
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
  recorderStatus.current = event => {
    if (event.url && event.url !== recorder.uri) return;
    if (statusRef.current === "listening" && (event.hasError || event.isFinished || event.mediaServicesDidReset)) {
      console.info("[assistant-voice]", { code: "CAPTURE_INTERRUPTED" });
      abort();
      setError("La grabación se ha interrumpido. Pulsa GO para intentarlo de nuevo o escribe tu solicitud.");
    }
  };
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
      let stage = "permission";
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (generation.current !== token) return;
        if (!permission.granted) {
          console.info("[assistant-voice]", { code: "PERMISSION_DENIED" });
          setError("Permite el acceso al micrófono o escribe tu solicitud.");
          changeStatus("idle");
          return;
        }
        console.info("[assistant-voice]", { code: "PERMISSION_GRANTED" });
        stage = "recording";
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
          if (!recorder.isRecording || !recorder.getStatus().isRecording) throw new Error("RECORDING_NOT_STARTED");
          console.info("[assistant-voice]", { code: "CAPTURE_STARTED" });
          changeStatus("listening");
        });
      } catch (e) {
        if (generation.current !== token) return;
        await withRecorder(async () => {
          if (generation.current === token) await cleanupNative();
        });
        if (generation.current !== token) return;
        console.info("[assistant-voice]", { code: "START_FAILED", stage });
        setError(stage === "permission"
          ? "No he podido comprobar el permiso del micrófono. Inténtalo de nuevo."
          : "No he podido iniciar la grabación. Inténtalo de nuevo o escribe tu solicitud.");
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
    let stage = "recording";
    let publicFailure = "No he podido finalizar la grabación. Inténtalo de nuevo o escribe tu solicitud.";
    changeStatus("transcribing");
    try {
      await withRecorder(async () => {
        if (generation.current !== token) return;
        await recorder.stop();
        uri = recorder.uri;
        await setAudioModeAsync({ allowsRecording: false });
      });
      if (generation.current !== token) return;
      if (!uri) throw new Error("RECORDING_MISSING");
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || !info.size) {
        publicFailure = "No he podido obtener audio de la grabación. Pulsa GO para intentarlo de nuevo.";
        throw new Error("EMPTY_RECORDING");
      }
      if (info.size > 5000000) {
        publicFailure = "La grabación es demasiado larga. Prueba con una solicitud más breve.";
        throw new Error("RECORDING_TOO_LARGE");
      }
      stage = "backend";
      publicFailure = "Tu voz se ha grabado, pero no he podido procesarla ahora. Puedes escribir o intentarlo de nuevo.";
      const capabilities = await assistantApi<{ transcription: boolean }>("/capabilities");
      if (generation.current !== token) return;
      if (capabilities.transcription !== true) {
        publicFailure = "Tu voz se ha grabado, pero el dictado no está disponible ahora. Puedes escribir tu solicitud.";
        throw new Error("TRANSCRIPTION_UNAVAILABLE");
      }
      const userId = await getAuthenticatedUserId();
      if (generation.current !== token) return;
      if (!userId) {
        publicFailure = "Inicia sesión desde tu perfil para procesar tu voz. También puedes escribir.";
        throw new Error("VOICE_SESSION_REQUIRED");
      }
      stage = "audio-read";
      publicFailure = "No he podido leer tu grabación. Inténtalo de nuevo o escribe tu solicitud.";
      if (generation.current !== token) return;
      const audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (generation.current !== token) return;
      stage = "transcription";
      publicFailure = "Tu voz se ha grabado, pero no he podido transcribirla ahora. Puedes escribir o intentarlo de nuevo.";
      const result = await assistantApi<{ text: string }>("/transcribe", {
        audio,
        mime: "audio/m4a",
      });
      if (generation.current !== token) return;
      if (typeof result.text !== "string") throw new Error("INVALID_TRANSCRIPTION");
      if (generation.current === token && result.text.trim())
        callback.current(result.text.trim(), zone);
      else if (generation.current === token)
        setError(
          "No he oído una solicitud. Pulsa GO para intentarlo de nuevo.",
        );
    } catch (e) {
      if (generation.current === token) {
        console.info("[assistant-voice]", { code: "PROCESSING_FAILED", stage });
        setError(publicFailure);
        if (stage === "recording" && (!uri || recorder.isRecording)) await withRecorder(async () => {
          if (generation.current === token) await cleanupNative();
        });
      }
    } finally {
      // Delete only this stopped recording; a later session may already be active.
      if (uri)
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      if (generation.current === token) {
        changeStatus("idle");
        setTranscript("");
      }
    }
  }, [recorder, changeStatus, withRecorder, cleanupNative]);
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
