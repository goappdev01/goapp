// Executes the installed React Native JS responder implementation, not a substitute
// which passes config callbacks straight through. This does not emulate UIKit.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),babel=require('@babel/core');
const loaded=new Map();
function load(name){
 if(loaded.has(name))return loaded.get(name);
 const filename=path.resolve('node_modules/react-native/Libraries/Interaction/'+name+'.js');
 const code=babel.transformSync(fs.readFileSync(filename,'utf8'),{filename,presets:['babel-preset-expo'],babelrc:false,configFile:false}).code;
 const context={exports:{},require:id=>{if(id==='./TouchHistoryMath')return load('TouchHistoryMath');throw Error('Unexpected responder dependency '+id);}};
 vm.runInNewContext(code,context,{filename});loaded.set(name,context.exports);return context.exports;
}
exports.nativePan=()=>load('PanResponder').default;
exports.contact=()=>{
 let time=1,x=100,y=100;
 const record={touchActive:true,startPageX:x,startPageY:y,startTimeStamp:time,currentPageX:x,currentPageY:y,currentTimeStamp:time,previousPageX:x,previousPageY:y,previousTimeStamp:time};
 const history={numberActiveTouches:1,indexOfSingleActiveTouch:0,mostRecentTimeStamp:time,touchBank:[record]};
 const event=()=>({nativeEvent:{touches:[{pageX:x,pageY:y}],pageX:x,pageY:y},touchHistory:history});
 return {event,move(dx,dy){record.previousPageX=x;record.previousPageY=y;record.previousTimeStamp=time;x+=dx;y+=dy;time+=16;Object.assign(record,{currentPageX:x,currentPageY:y,currentTimeStamp:time});history.mostRecentTimeStamp=time;return event();}};
};
