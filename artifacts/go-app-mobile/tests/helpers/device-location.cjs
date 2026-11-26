const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ts=require(require.resolve('typescript',{paths:[process.cwd()]}));
module.exports=function deviceLocation(native={}){
 const load=(file,imports={})=>{
  const context={exports:{},Error,Promise,WeakMap,Number,require:key=>{if(key in imports)return imports[key];throw Error('Unexpected location dependency '+key);}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(process.cwd(),file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.exports;
 };
 const core=load('lib/locationAccess.ts');
 const api=load('lib/deviceLocation.ts',{'./locationAccess':core,'react-native':{AppState:{currentState:'active'},Platform:{OS:'ios'},Alert:{alert(){}},...native}});
 return {...core,...api};
};
