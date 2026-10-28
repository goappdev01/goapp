import * as FileSystem from "expo-file-system/legacy";
import type { TaskScope } from "./goTaskReminders";
import type { NoteAttachment } from "./unifiedNotes";
import { noteId } from "./unifiedNotes";

function directory(scope: TaskScope, id: string) {
  if (!FileSystem.documentDirectory) throw new Error("El almacenamiento de adjuntos no está disponible en este dispositivo.");
  return `${FileSystem.documentDirectory}go-notes/${encodeURIComponent(scope.userId)}/${encodeURIComponent(id)}/`;
}
export function assertNoteAttachments(scope: TaskScope, id: string, attachments: NoteAttachment[]) {
  if (attachments.length>50 || new Set(attachments.map(a=>a.id)).size!==attachments.length) throw new Error("La lista de adjuntos no es válida.");
  for(const a of attachments) {
    if(!a.id || !a.name.trim()) throw new Error("El adjunto no es válido.");
    if(a.kind==="link") { let url:URL;try{url=new URL(a.uri);}catch{throw new Error("El enlace no es válido.");}if(!["http:","https:"].includes(url.protocol)||!url.hostname)throw new Error("El enlace debe comenzar por https:// o http://."); }
    else if(a.kind!=="file" || !a.uri.startsWith(directory(scope,id)) || !/^note_[a-z0-9]+_[a-z0-9]+(?:\.[a-z0-9]{1,8})?$/i.test(a.uri.slice(directory(scope,id).length)))
      throw new Error("El archivo no pertenece a esta nota.");
  }
}
export async function importNoteFile(scope: TaskScope, id: string, asset: {uri:string;name:string;mimeType?:string;size?:number}): Promise<NoteAttachment> {
  if(!/^file:\/\//.test(asset.uri))throw new Error("El archivo seleccionado no está disponible localmente.");
  if(asset.size && asset.size>50*1024*1024)throw new Error("El archivo supera los 50 MB admitidos para una nota.");
  const base=directory(scope,id),attachmentId=noteId(),extension=asset.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] || "";
  await FileSystem.makeDirectoryAsync(base,{intermediates:true});
  const uri=base+attachmentId+extension;
  await FileSystem.copyAsync({from:asset.uri,to:uri});
  const info=await FileSystem.getInfoAsync(uri);
  if(!info.exists || info.isDirectory || info.size>50*1024*1024 || (asset.size!==undefined && info.size!==asset.size))throw new Error("No se ha podido confirmar la copia del adjunto (máximo 50 MB).");
  return {id:attachmentId,name:asset.name,kind:"file",uri,mime:asset.mimeType,size:info.size};
}
export async function verifyNoteFiles(scope:TaskScope,id:string,attachments:NoteAttachment[]){
  assertNoteAttachments(scope,id,attachments);
  for(const attachment of attachments){if(attachment.kind!=="file")continue;const info=await FileSystem.getInfoAsync(attachment.uri);
    if(!info.exists || info.isDirectory || attachment.size!==undefined&&info.size!==attachment.size)throw new Error("No se encuentra un adjunto de esta nota. Puedes recuperarlo o quitar su referencia antes de guardar.");}
}
