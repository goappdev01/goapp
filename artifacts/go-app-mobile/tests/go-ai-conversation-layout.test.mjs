import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript');
function load(file,imports={}){const context={exports:{},require:name=>{if(name in imports)return imports[name];throw Error('Unexpected '+name);}};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}

test('chat Markdown renders emphasis, headings, lists and fenced code without markup residue',()=>{
 const {parseChatMarkdown,chatMarkdownPlainText}=load('lib/chatMarkdown.ts');
 const lines=parseChatMarkdown('# Resumen\n- **Tinte** · 45 €\n1. *Confirmar*\n```\nvalor = 2\n```\n[Detalles](https://example.invalid)');
 assert.equal(lines[0].kind,'heading');assert.equal(lines[1].kind,'bullet');assert.equal(lines[1].segments[1].style,'bold');
 assert.equal(lines[2].kind,'bullet');assert.equal(lines[2].segments[1].style,'italic');assert.equal(lines[3].kind,'code');
 assert.equal(lines[4].segments[0].text,'Detalles');assert.equal(lines[4].segments[0].href,'https://example.invalid');
 assert.equal(chatMarkdownPlainText('**Hola**\n- `código`'),'Hola\n• código');
 assert.ok(!JSON.stringify(lines).includes('**Tinte**'));
});

test('the informational notice is claimed once per authenticated session, including after a view remount',async()=>{
 const disk=new Map(),storage={getItem:async key=>disk.get(key)??null,setItem:async(key,value)=>disk.set(key,value)};
 const imports={react:{useEffect(){},useState(){return[false,()=>{}]}},'@react-native-async-storage/async-storage':storage,'@/lib/authSession':{captureAuthIdentity:async()=>null}};
 const first=load('hooks/useCentralNotice.ts',imports).claimCentralNotice;
 const owner='admin-layout-test',a={userId:owner,sessionId:'session-A',revision:1},b={userId:owner,sessionId:'session-B',revision:2};
 assert.equal(await first(owner,a,storage),true);assert.equal(await first(owner,a,storage),false);
 const reopened=load('hooks/useCentralNotice.ts',imports).claimCentralNotice;
 assert.equal(await reopened(owner,a,storage),false);assert.equal(await reopened(owner,b,storage),true);
 assert.equal(await reopened('someone-else',b,storage),false);
 assert.equal(await reopened(owner,{...b,sessionId:'session-C'},storage,()=>false),false);
});

test('central chat uses one minimal header, equal 90 percent bubble limits and a seven second notice',()=>{
 const screen=readFileSync('components/booking-assistant/BookingAssistantScreen.tsx','utf8');
 assert.match(screen,/central-ai-minimal-header/);assert.match(screen,/maxWidth:"90%",paddingHorizontal:14,paddingVertical:10/);
 assert.match(screen,/autoDismissMs=\{consultation\?\.noticeVisible===undefined\?undefined:7000\}/);
 assert.match(screen,/central-ai-pending-message/);assert.match(screen,/central-ai-preparing/);
 assert.match(screen,/followEnd\.current=true/);
});
