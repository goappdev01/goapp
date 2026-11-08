import * as FileSystem from "expo-file-system/legacy";
export type SupportAttachment = {id:string;uri:string;name:string;mime:string;size:number};
export type SupportAsset = {uri:string;name?:string;mimeType?:string;size?:number};
export const SUPPORT_FILE_LIMIT=10*1024*1024, SUPPORT_TOTAL_LIMIT=25*1024*1024, SUPPORT_FILE_COUNT=5;
const extensions:Record<string,readonly string[]>={"image/jpeg":["jpg","jpeg"],"image/png":["png"],"image/heic":["heic"],"image/heif":["heif"],"image/webp":["webp"],"application/pdf":["pdf"]};
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);
/** Same native local-copy/size verification pattern as Notes, in a separate private cache. */
export function createSupportAttachmentStore(fs=FileSystem, makeId=id, persistentScope?:string) {
  const session=makeId();if(!/^[a-z0-9]+$/i.test(session))throw Error("Sesión de archivos inválida.");
  const scope=persistentScope===undefined?null:Array.from(persistentScope).map(c=>c.charCodeAt(0).toString(16)).join("-");
  const root=scope?(fs.documentDirectory?fs.documentDirectory+"go-support-drafts/"+scope+"/":null):fs.cacheDirectory?fs.cacheDirectory+"go-support/"+session+"/":null;
  const files=new Map<string,SupportAttachment>();let closed=false;
  const remove=async(attachmentId:string)=>{const file=files.get(attachmentId);if(!file)return;await fs.deleteAsync(file.uri,{idempotent:true});files.delete(attachmentId);};
  return {
    async restore(saved:readonly SupportAttachment[]){
      const restored:SupportAttachment[]=[];
      for(const file of saved){
        const ext=file.name.split(".").pop()?.toLowerCase();
        if(!root||!ext||!extensions[file.mime]?.includes(ext)||file.uri!==root+file.id+"."+ext)continue;
        const info=await fs.getInfoAsync(file.uri);
        if(!closed&&info.exists&&!info.isDirectory&&info.size===file.size){files.set(file.id,file);restored.push(file);}
      }
      return restored;
    },
    async importAsset(asset:SupportAsset):Promise<SupportAttachment>{
      if(closed||!root)throw Error("No se puede preparar el archivo.");
      if(!asset.uri.startsWith("file://"))throw Error("Selecciona un archivo local.");
      const mime=asset.mimeType?.toLowerCase()??"",allowed=extensions[mime];
      if(!allowed)throw Error("Selecciona una fotografía compatible o un PDF.");
      const name=(asset.name||("Fotografía."+allowed[0])).trim();
      const ext=name.split(".").pop()?.toLowerCase();
      if(!ext||!allowed.includes(ext))throw Error("El tipo y nombre del archivo no coinciden.");
      const info=await fs.getInfoAsync(asset.uri);
      if(!info.exists||info.isDirectory||!Number.isSafeInteger(info.size)||info.size<=0||info.size>SUPPORT_FILE_LIMIT
        ||asset.size!==undefined&&info.size!==asset.size)throw Error("El archivo no es válido o supera 10 MB.");
      if(closed)throw Error("Selección cancelada.");
      if(files.size>=SUPPORT_FILE_COUNT||Array.from(files.values()).reduce((n,f)=>n+f.size,0)+info.size>SUPPORT_TOTAL_LIMIT)throw Error("Máximo 5 archivos y 25 MB en total.");
      const attachmentId=makeId();if(!/^[a-z0-9]+$/i.test(attachmentId)||files.has(attachmentId))throw Error("Referencia de archivo inválida.");
      const uri=root+attachmentId+"."+ext;
      await fs.makeDirectoryAsync(root,{intermediates:true});
      try {await fs.copyAsync({from:asset.uri,to:uri});const copy=await fs.getInfoAsync(uri);
        if(closed||!copy.exists||copy.isDirectory||copy.size!==info.size)throw Error("No se pudo verificar el archivo.");
        const result={id:attachmentId,uri,name,mime,size:copy.size};files.set(attachmentId,result);return result;
      }catch(error){await fs.deleteAsync(uri,{idempotent:true}).catch(()=>{});throw error;}
    }, remove,
    async dispose(){closed=true;files.clear();if(root&&!scope)await fs.deleteAsync(root,{idempotent:true});},
  };
}
