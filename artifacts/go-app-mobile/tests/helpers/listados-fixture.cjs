const {readFileSync}=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
function load(file,imports={}){const context={exports:{},Date,Intl,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected '+name+' in '+file);}};vm.runInNewContext(compile(readFileSync(file,'utf8')),context);return context.exports;}
const completion=load('lib/goActionCompletion.ts'),notes=load('lib/unifiedNotes.ts'),presentation=load('data/goEntryPresentation.ts');
const history=load('lib/listadosHistory.ts',{'./goActionCompletion':completion,'./unifiedNotes':notes,'@/data/goEntryPresentation':presentation});
function visual(React,fontScale=1){return load('components/ListadosProposalActions.tsx',{'react':React,'react-native':{View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',useWindowDimensions:()=>({fontScale})}}).ListadosProposalActions;}
module.exports={load,compile,completion,notes,history,visual};
