const {createRequire}=require('module'), fs=require('fs'), vm=require('vm'), path=require('path');
const project=process.cwd();
const req=createRequire(path.join(project,'package.json'));
class Node {
 constructor(type,name,doc){this.nodeType=type;this.nodeName=name;this.tagName=name;this.ownerDocument=doc;this.childNodes=[];this.parentNode=null;this.attributes={};this.style={};}
 appendChild(node){if(node.parentNode)node.parentNode.removeChild(node);node.parentNode=this;this.childNodes.push(node);return node;}
 removeChild(node){const i=this.childNodes.indexOf(node);if(i<0)throw Error('Missing child');this.childNodes.splice(i,1);node.parentNode=null;return node;}
 insertBefore(node,before){if(node.parentNode)node.parentNode.removeChild(node);const i=this.childNodes.indexOf(before);if(i<0)throw Error('Missing insertion target');this.childNodes.splice(i,0,node);node.parentNode=this;return node;}
 setAttribute(k,v){this.attributes[k]=String(v);}
 removeAttribute(k){delete this.attributes[k];}
 addEventListener(){}
 removeEventListener(){}
 get firstChild(){return this.childNodes[0]??null;}
 get lastChild(){return this.childNodes.at(-1)??null;}
 get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]??null;}
 get textContent(){return this.nodeType===3?this.nodeValue:this.childNodes.map(n=>n.textContent).join('');}
 set textContent(value){this.childNodes.forEach(n=>n.parentNode=null);this.childNodes=[];if(value){const text=new Node(3,'#text',this.ownerDocument);text.nodeValue=String(value);this.appendChild(text);}}
}
const document=new Node(9,'#document',null);document.ownerDocument=document;
document.createElement=name=>new Node(1,name.toUpperCase(),document);
document.createElementNS=(_namespace,name)=>document.createElement(name);
document.createTextNode=value=>{const node=new Node(3,'#text',document);node.nodeValue=value;return node;};
document.createComment=value=>{const node=new Node(8,'#comment',document);node.nodeValue=value;return node;};
document.documentElement=document.createElement('html');document.body=document.createElement('body');document.documentElement.appendChild(document.body);document.activeElement=document.body;
global.window={document,HTMLIFrameElement:class{},HTMLElement:Node,Node,addEventListener(){},removeEventListener(){}};
document.defaultView=global.window;global.document=document;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=req('react'), {createRoot}=req('react-dom/client');
const ts=req('typescript');
const native=(name)=>({children,...props})=>React.createElement('div',{'data-native':name,'data-testid':props.testID},children);
const rn={View:native('View'),Text:native('Text'),Image:native('Image'),Modal:native('Modal'),Platform:{OS:'ios'},StyleSheet:{absoluteFill:{},create:x=>x}};
const evaluate=(file,imports={})=>{
 const context={exports:{},__DEV__:true,console,Promise,Date,setTimeout,clearTimeout,setInterval,clearInterval,require(name){if(name==='react')return React;if(name in imports)return imports[name];if(name==='@/components/ui/GoScreenModal')return {GoScreenModal:(imports['react-native']||rn).Modal};if(name==='react-native')return rn;if(name.endsWith('.png'))return 1;throw Error('Unexpected import '+name);}};
 const code=ts.transpileModule(fs.readFileSync(path.join(project,file),'utf8'),{compilerOptions:{ alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,context,{filename:file});return context.exports;
};

module.exports={React,createRoot,document,req,ts,native,rn,evaluate};
