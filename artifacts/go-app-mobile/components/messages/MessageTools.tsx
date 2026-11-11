import React, { useEffect, useRef, useState } from "react";
import { Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import type { GoDirectMessage } from "../MessagesScreen";
import { readLocationMessage } from "@/data/contactPlaces";
import { GoToolAction } from "@/components/ui/GoToolRail";

export const MESSAGE_ATTACHMENT_UNAVAILABLE = "No disponible hasta activar la conversación compartida";
export type MessageAttachment = { id: string; uri: string; name: string; mimeType: string; size?: number; image: boolean };

/** Native selections stay in this editor's memory. No upload, public URL or fake receipt.
 * Account/thread changes invalidate pending native picker results before they can enter a draft. */
export function useMessageAttachments(identity: string, visible: boolean) {
  const [draft, setDraft] = useState<{identity:string;items:MessageAttachment[]}>({identity,items:[]}), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const items=draft.identity===identity?draft.items:[];
  const current = useRef({ identity, visible }); current.current = { identity, visible };
  const epoch = useRef(0), lock = useRef(false);
  useEffect(() => { epoch.current++; lock.current = false; setBusy(false); setDraft({identity,items:[]}); setError("");
    return () => { epoch.current++; };
  }, [identity]);
  useEffect(()=>{if(!visible){epoch.current++;lock.current=false;setBusy(false);}},[visible]);
  const pick = async (kind: "photo" | "document") => {
    if (lock.current || !visible) return;
    if (items.length >= 5) { setError("Puedes seleccionar hasta cinco adjuntos."); return; }
    const token = ++epoch.current, key = identity;
    const active = () => epoch.current === token && current.current.identity === key && current.current.visible;
    lock.current = true; setBusy(true); setError("");
    try {
      let attachment: Omit<MessageAttachment, "id"> | undefined;
      if (kind === "photo") {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: .8 });
        if (!active() || result.canceled) return;
        const asset = result.assets[0];
        attachment = { uri: asset.uri, name: asset.fileName || "Fotografía", mimeType: asset.mimeType || "image/*", size: asset.fileSize, image: true };
      } else {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (!active() || result.canceled) return;
        const asset = result.assets[0];
        attachment = { uri: asset.uri, name: asset.name || "Documento", mimeType: asset.mimeType || "application/octet-stream", size: asset.size, image: !!asset.mimeType?.startsWith("image/") };
      }
      if (active() && attachment) {
        const selected = { ...attachment, name: attachment.name.split(/[\\/]/).pop() || "Adjunto", id: String(token) };
        setDraft(previous => ({identity,items:[...(previous.identity===identity?previous.items:[]),selected]}));
      }
    } catch { if (active()) setError("No se pudo abrir el selector. Revisa el permiso en Ajustes y vuelve a intentarlo."); }
    finally { if (epoch.current === token) { lock.current = false; setBusy(false); } }
  };
  return { items, busy, error, pick, remove: (id: string) => setDraft(previous => ({...previous,items:previous.items.filter(item => item.id !== id)})) };
}

export function MessageAttachmentPreview({ items, onRemove }: { items: MessageAttachment[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return <View testID="message-attachment-preview" style={s.preview}>
    <Text style={s.notice}>{MESSAGE_ATTACHMENT_UNAVAILABLE}. Adjuntos locales sin enviar; el borrador se conserva.</Text>
    <ScrollView horizontal bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {items.map(item => <View key={item.id} style={s.attachment}>
        {item.image && <Image accessibilityLabel="Previsualización de fotografía" source={{ uri: item.uri }} style={{ width: 48, height: 48, borderRadius: 6 }} />}
        <View style={{ flexShrink: 1, maxWidth: 180 }}><Text style={s.text}>{item.name}</Text>
          <Text style={s.notice}>{item.mimeType} · {item.size === undefined ? "Tamaño no disponible" : `${Math.ceil(item.size / 1024)} KB`}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Retirar " + item.name} onPress={() => onRemove(item.id)} style={s.remove}><Text style={s.text}>Retirar</Text></TouchableOpacity>
      </View>)}
    </ScrollView>
  </View>;
}

/** The parent supplies only the current authenticated conversation's messages. */
export function MessageSharePicker({ messages, canShare, onBack }: { messages: GoDirectMessage[]; canShare: boolean; onBack: () => void }) {
  const [selected, setSelected] = useState<string>(), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), mounted = useRef(true), sharing = useRef(false);
  const current = useRef({ messages, canShare }); current.current = { messages, canShare };
  useEffect(() => () => { mounted.current = false; }, []);
  // Location payloads are private structured attachments; never export them as ordinary text.
  const available = canShare ? messages.filter(message => message.text.trim() && !readLocationMessage(message.text)) : [];
  const message = available.find(item => item.senderId + ":" + item.id === selected);
  const share = async (copy: boolean) => {
    const active = current.current;
    const target = active.canShare && active.messages.find(item => item.senderId + ":" + item.id === selected && !readLocationMessage(item.text));
    if (!target || sharing.current) return;
    sharing.current = true; setBusy(true); setNotice("");
    try { if (copy) await Clipboard.setStringAsync(target.text); else await Share.share({ message: target.text });
      if (mounted.current && copy) setNotice("Texto seleccionado copiado.");
    } catch { if (mounted.current) setNotice("No se pudo compartir el mensaje. Puedes volver a intentarlo."); }
    finally { sharing.current = false; if (mounted.current) setBusy(false); }
  };
  return <View testID="message-share-picker" style={{ gap: 8 }}>
    <GoToolAction label="Volver a herramientas" icon="arrow-left" onPress={onBack}/>
    <Text style={s.text}>Selecciona un mensaje concreto. Revisa su contenido; solo se compartirá ese texto.</Text>
    {!available.length && <Text style={s.notice}>No hay mensajes confirmados para compartir.</Text>}
    {message ? <>
      <Text testID="message-share-selection" selectable style={s.text}>{message.text}</Text>
      <GoToolAction label="Compartir este mensaje" icon="share" disabled={busy} onPress={() => void share(false)}/>
      <GoToolAction label="Copiar este mensaje" icon="copy" disabled={busy} onPress={() => void share(true)}/>
      <GoToolAction label="Elegir otro mensaje" icon="message-square" disabled={busy} onPress={() => setSelected(undefined)}/>
    </> : available.map((item, index) => <TouchableOpacity key={item.senderId + ":" + item.id} accessibilityRole="button"
      accessibilityLabel={"Seleccionar mensaje " + (index + 1)} onPress={() => setSelected(item.senderId + ":" + item.id)} style={s.selection}>
      <Text style={s.text}>{item.text}</Text></TouchableOpacity>)}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
  </View>;
}

const s = StyleSheet.create({
  text: { color: "#273e4b", fontSize: 13 }, notice: { color: "#4d5f69", fontSize: 12 },
  preview: { paddingHorizontal: 10, paddingTop: 6, gap: 5, maxHeight: 145 },
  attachment: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6, borderWidth: 1, borderColor: "#b2bdc5", borderRadius: 12 },
  remove: { minHeight: 44, minWidth: 44, justifyContent: "center", padding: 6 },
  selection: { minHeight: 48, padding: 10, borderWidth: 1, borderColor: "#b2bdc5", borderRadius: 10 },
});
