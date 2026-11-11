import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type ViewInstance } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { boardDropTarget } from "@/components/boards/BoardDragSurface";

type Target={id:string;group:string;kind:"card"|"column";label:string};
type Rect={x:number;y:number;width:number;height:number};
type Drag={source:Target;rect:Rect;targets:(Target&Rect)[];y:number;startY:number;offset:number;hit?:Target};
type Controller={register:(target:Target,node:ViewInstance|null)=>void;begin:(target:Target,y:number)=>void;move:(y:number)=>void;end:(cancel?:boolean)=>void;enabled:boolean;active?:string;hit?:string};
const Context=createContext<Controller|null>(null);
/** Same native long-press Pan and board target geometry as GO. Scroll motion is capped at 240 pt/s. */
export function ShoppingReorderSurface({children,enabled,onDrop,onDragging,scrollRef}: {
  children:React.ReactNode;enabled:boolean;onDrop:(source:Target,target:Target)=>void;onDragging:(active:boolean)=>void;
  scrollRef:React.RefObject<React.ElementRef<typeof ScrollView>|null>;
}){
  const viewport=useRef<ViewInstance|null>(null),registry=useRef(new Map<string,{target:Target;node:ViewInstance}>());
  const offset=useRef(0),content=useRef(0),bounds=useRef({x:0,y:0,width:0,height:0});
  const current=useRef<Drag|null>(null),frame=useRef<number|null>(null),epoch=useRef(0),lastFrame=useRef(0);
  const [ghost,setGhost]=useState<{id:string;label:string;y:number;hit?:string}|null>(null);
  const live=useRef({enabled,onDrop,onDragging});live.current={enabled,onDrop,onDragging};
  const finish=(cancel=false)=>{
    epoch.current++;const d=current.current;current.current=null;
    if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;setGhost(null);live.current.onDragging(false);
    if(d&&!cancel&&d.hit&&d.hit.id!==d.source.id)live.current.onDrop(d.source,d.hit);
  };
  const locate=()=>{
    const d=current.current;if(!d)return;
    const delta=offset.current-d.offset;
    const targets=d.targets.map(t=>({...t,y:t.y-delta}));
    // Source and target are always in the same supermarket block (or both category headers).
    const hit=boardDropTarget(targets,d.rect.x+d.rect.width/2,d.y,d.source.kind);
    d.hit=targets.find(t=>t.id===hit?.id);
    setGhost({id:d.source.id,label:d.source.label,y:Math.max(0,Math.min(bounds.current.height-48,d.y-bounds.current.y-24)),hit:hit?.id});
  };
  const tick=(time:number)=>{
    const d=current.current;if(!d)return;
    const dt=Math.min(32,Math.max(0,time-lastFrame.current));lastFrame.current=time;
    const b=bounds.current,edge=Math.min(64,b.height/4),relative=d.y-b.y;
    const speed=relative<edge?-Math.min(1,(edge-relative)/edge):relative>b.height-edge?Math.min(1,(relative-b.height+edge)/edge):0;
    const next=Math.max(0,Math.min(Math.max(0,content.current-b.height),offset.current+speed*dt*.24));
    if(next!==offset.current){offset.current=next;scrollRef.current?.scrollTo({y:next,animated:false});locate();}
    frame.current=requestAnimationFrame(tick);
  };
  const controller:Controller={enabled,active:ghost?.id,hit:ghost?.hit,
    register(target,node){if(node)registry.current.set(target.id,{target,node});else registry.current.delete(target.id);},
    begin(target,y){
      if(!live.current.enabled||current.current)return;
      const source=registry.current.get(target.id);if(!source)return;
      const token=++epoch.current;
      viewport.current?.measureInWindow((x,top,width,height)=>{
        if(token!==epoch.current||!live.current.enabled)return;bounds.current={x,y:top,width,height};
        source.node.measureInWindow((x,sy,width,height)=>{
          if(token!==epoch.current||!live.current.enabled)return;
          const drag:Drag={source:target,rect:{x,y:sy,width,height},targets:[],y,startY:y,offset:offset.current};current.current=drag;
          for(const {target:t,node} of registry.current.values())if(t.kind===target.kind&&t.group===target.group)node.measureInWindow((x,y,width,height)=>{
            if(current.current===drag){drag.targets.push({...t,x,y,width,height});locate();}
          });
          live.current.onDragging(true);lastFrame.current=0;frame.current=requestAnimationFrame(tick);locate();
        });
      });
    },
    move(y){if(current.current){current.current.y=y;locate();}},end:finish,
  };
  useEffect(()=>{if(!enabled)finish(true);},[enabled]);
  useEffect(()=>()=>{epoch.current++;if(frame.current!==null)cancelAnimationFrame(frame.current);current.current=null;},[]);
  return <Context.Provider value={controller}><View ref={viewport} collapsable={false} testID="shopping-reorder-viewport" style={{flex:1,minHeight:0}}>
    <ScrollView ref={scrollRef} testID="shopping-list-scroll" scrollEnabled={!ghost} keyboardShouldPersistTaps="handled" scrollEventThrottle={16}
      onScroll={e=>{offset.current=e.nativeEvent.contentOffset.y;}} onContentSizeChange={(_,h)=>{content.current=h;}}
      contentContainerStyle={{padding:12,gap:10,paddingBottom:24}}>{children}</ScrollView>
    {ghost&&<View pointerEvents="none" testID="shopping-drag-ghost" style={[styles.ghost,{top:ghost.y}]}><Text style={{color:"white",fontSize:17,fontWeight:"700"}}>{ghost.label}</Text></View>}
  </View></Context.Provider>;
}
export function ShoppingReorderRow({target,children}:{target:Target;children:React.ReactNode}){
  const ctx=useContext(Context),node=useRef<ViewInstance|null>(null);
  useEffect(()=>()=>ctx?.register(target,null),[target.id]);
  return <View ref={ref=>{node.current=ref;ctx?.register(target,ref);}} collapsable={false} testID={"shopping-position-"+target.id}
    style={ctx?.active===target.id?{opacity:.45}:undefined}>{children}
    {ctx?.hit===target.id&&ctx.active!==target.id&&<View pointerEvents="none" testID={"shopping-drop-target-"+target.id} style={styles.target}/>}</View>;
}
export function ShoppingReorderHandle({target}:{target:Target}){
  const ctx=useContext(Context),latest=useRef(ctx);latest.current=ctx;
  const pan=useMemo(()=>Gesture.Pan().enabled(!!ctx?.enabled).activateAfterLongPress(500).maxPointers(1).runOnJS(true)
    .onStart(e=>latest.current?.begin(target,e.absoluteY)).onUpdate(e=>latest.current?.move(e.absoluteY)).onFinalize((_e,success)=>latest.current?.end(!success)),[ctx?.enabled,target.id,target.group,target.label]);
  return <GestureDetector gesture={pan}><View testID={"shopping-drag-"+target.id} accessible accessibilityLabel={"Mantener pulsado medio segundo para ordenar "+target.label}
    style={{minWidth:48,minHeight:48,alignItems:"center",justifyContent:"center",opacity:ctx?.enabled?1:.35}}><Text style={{fontSize:25,color:"#425d4d"}}>≡</Text></View></GestureDetector>;
}
const styles=StyleSheet.create({ghost:{position:"absolute",left:16,right:16,minHeight:48,padding:12,borderRadius:12,backgroundColor:"#24573e",borderWidth:2,borderColor:"#9ae3b8",zIndex:50},target:{position:"absolute",left:0,top:0,right:0,bottom:0,borderWidth:3,borderColor:"#15803d",borderRadius:12}});
