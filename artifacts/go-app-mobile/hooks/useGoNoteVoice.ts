import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useBookingVoice } from "./useBookingVoice";
import { appendNoteDictation } from "@/lib/goNoteTools";

type Field = "title" | "detail";
type Props = { visible: boolean; identity: string; title: string; setTitle: Dispatch<SetStateAction<string>>;
  setDetail: Dispatch<SetStateAction<string>>; english: boolean; titleLimit?: number; onPreparedText?:(text:string)=>void };

/** Uses the existing recorder/transcriber; it never sends a task, message or booking. */
export function useGoNoteVoice({ visible, identity, title, setTitle, setDetail, english, titleLimit = 16, onPreparedText }: Props) {
  const field = useRef<Field>("title"), target = useRef<Field>("title");
  const captureIdentity = useRef(identity);
  const current = useRef({ visible, identity }); current.current = { visible, identity };
  const [notice, setNotice] = useState("");
  const voice = useBookingVoice(text => {
    if (!current.current.visible || current.current.identity !== captureIdentity.current) return;
    if(onPreparedText){onPreparedText(text);return;}
    if (target.current === "detail") setDetail(previous => appendNoteDictation(previous, text));
    else {
      const next = appendNoteDictation(title, text);
      if (next.length <= titleLimit) { setTitle(previous => {
        const updated = appendNoteDictation(previous, text);
        return updated.length <= titleLimit ? updated : previous;
      }); return; }
      setNotice(english ? `The title allows ${titleLimit} characters. Dictation was not truncated: ${text}. Select the details field and dictate there.`
        : `El título admite ${titleLimit} caracteres. No se ha recortado el dictado: ${text}. Selecciona el campo de detalle para dictarlo allí.`);
    }
  }, { requireTranscriptionReady: true });
  const abort = useRef(voice.abort); abort.current = voice.abort;
  useEffect(() => {
    if (!visible || captureIdentity.current !== identity) { abort.current(); setNotice(""); }
  }, [visible, identity]);
  return { ...voice, notice, focus: (value: Field) => { field.current = value; },
    toggle: async () => {
      if (voice.status === "listening") return voice.stop();
      if (voice.status !== "idle" || !visible) return;
      target.current = field.current; captureIdentity.current = identity; setNotice("");
      await voice.start();
    },
  };
}
