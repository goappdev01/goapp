import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const ts=createRequire(import.meta.url)("typescript");
const compile=file=>ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function module(file,imports={}){const exports={};vm.runInNewContext(compile(file),{exports,require:key=>{if(key in imports)return imports[key];throw Error("Unexpected dependency "+key);},Date,Intl,Set,Map});return exports;}
const storeAPI=module("data/businessDemoStore.ts"),catalogAPI=module("data/businessDemoCatalog.ts",{"./businessDemoStore":storeAPI});
const initial={businessName:"",address:"",cartaUrl:"",sectorId:null,subId:null,plantillaItems:[],activeDays:[],openFrom:"09:00",openTo:"20:00",daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false};
const turn=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(){let cursor=0,open=true,lang="es",authorized=true;const slots=[],memory=new Map(),shares=[],alerts=[];
 const catalog=catalogAPI.createBusinessDemoCatalog({ownerUserId:"11111111-1111-4111-8111-111111111111",initialConfig:initial,canUse:()=>authorized,storage:{getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)}});
 const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef:value=>React.useState(()=>({current:value}))[0]};
 const native={Text:'Text',TextInput:'TextInput',ScrollView:'ScrollView',View:'View',TouchableOpacity:'TouchableOpacity',Share:{share:async value=>shares.push(value)},Alert:{alert:(...args)=>alerts.push(args)}};
 const {DemoCompanyManager}=module("components/empresa/DemoCompanyManager.tsx",{react:{default:React,...React},'react-native':native,'@/contexts/OwnerBusinessDemoContext':{useOwnerBusinessDemo:()=>authorized?{catalog,demo:catalog.getSelectedStore()}:{}},'@/contexts/LanguageContext':{useLanguage:()=>({lang})}});
 return{catalog,shares,alerts,setLang:value=>lang=value,setAuthorized:value=>authorized=value,render:()=>{cursor=0;return DemoCompanyManager({open,onOpenChange:value=>open=value});}};
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(tree.children??[]).flatMap(nodes)];
const byID=(tree,id)=>nodes(tree).find(node=>node.props.testID===id);
const content=tree=>typeof tree==='string'?tree:(tree?.children??[]).map(content).join(' ');
const button=(tree,label)=>nodes(tree).find(node=>node.type==='TouchableOpacity'&&content(node)===label);
test('actual manager creates a preset company once even with two immediate taps, then selects the previous company',async()=>{const f=fixture();let tree=f.render();button(tree,'GO PELUQUERÍA').props.onPress();tree=f.render();assert.equal(nodes(tree).find(n=>n.type==='TextInput').props.value,'GO PELUQUERÍA');const create=byID(tree,'demo-company-create');create.props.onPress();create.props.onPress();await turn();assert.equal(f.catalog.getCompanies().length,2);assert.equal(f.catalog.getSelectedStore().getSnapshot().config.businessName,'GO PELUQUERÍA');tree=f.render();byID(tree,'demo-company-legacy').props.onPress();await turn();assert.equal(f.catalog.getSelectedId(),'legacy');});
test('actual archive confirmation removes only the selected DEMO from active lists and recovery returns its saved data',async()=>{const f=fixture();await f.catalog.create('Recover');const id=f.catalog.getSelectedId();await f.catalog.getSelectedStore().updateConfig({address:'Ficticia'});let tree=f.render();const row=nodes(tree).find(n=>n.type==='View'&&n.props.key===id);button(row,'Archivar empresa').props.onPress();f.alerts.at(-1)[2].find(action=>action.onPress).onPress();await turn();assert.equal(f.catalog.getCompanies().find(c=>c.id===id).archived,true);tree=f.render();byID(tree,'demo-company-'+id).props.onPress();await turn();assert.equal(f.catalog.getSelectedStore().getSnapshot().config.address,'Ficticia');});
test('backup export uses the native share action and UI stays hidden without current owner authority',async()=>{const f=fixture();await f.catalog.create('Backup');byID(f.render(),'demo-company-backup').props.onPress();await turn();assert.equal(JSON.parse(f.shares[0].message).format,'go-demo-backup');assert.equal(f.alerts.length,0);f.setAuthorized(false);assert.equal(f.render(),null);});
test('changing interface language keeps company names and IDs intact',async()=>{const f=fixture();await f.catalog.create('GO PELUQUERÍA');const id=f.catalog.getSelectedId();f.setLang('en');const tree=f.render();assert.ok(content(tree).includes('Create DEMO company'));assert.ok(content(tree).includes('GO PELUQUERÍA'));assert.equal(f.catalog.getSelectedId(),id);});
