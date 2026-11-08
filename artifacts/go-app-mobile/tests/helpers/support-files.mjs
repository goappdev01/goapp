import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
export function supportFiles(){
 const data=new Map(),deleted=[],copied=[];let counter=0;
 const fs={cacheDirectory:'file:///private/cache/',documentDirectory:'file:///private/documents/',
  async getInfoAsync(uri){return data.has(uri)?{exists:true,isDirectory:false,size:data.get(uri)}:{exists:false};},
  async makeDirectoryAsync(){},async copyAsync({from,to}){copied.push({from,to});data.set(to,data.get(from));},
  async deleteAsync(uri){deleted.push(uri);for(const key of data.keys())if(key===uri||uri.endsWith('/')&&key.startsWith(uri))data.delete(key);}};
 const scope={exports:{},Error,require(name){if(name==='expo-file-system/legacy')return fs;throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(readFileSync('lib/supportAttachments.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);
 const api=scope.exports;
 return{data,deleted,copied,fs,api,create:(_fs,_id,scope)=>api.createSupportAttachmentStore(fs,()=>`file${++counter}`,scope),asset(name='photo.jpg',size=128,mimeType='image/jpeg'){
  const uri='file:///native/'+name;data.set(uri,size);return{uri,name,mimeType,size};}};
}
