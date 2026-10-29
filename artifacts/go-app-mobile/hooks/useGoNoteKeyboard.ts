import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, TextInput, useWindowDimensions } from "react-native";

/** The RN input owns focus. A controller-library promise is not proof that iOS hid it. */
export function useGoNoteKeyboard(enabled:boolean) {
  const viewport=useWindowDimensions(),height=useRef(viewport.height);height.current=viewport.height;
  const [visible,setVisible]=useState(()=>Keyboard.isVisible()),[dismissing,setDismissing]=useState(false);
  const live=useRef(enabled),shown=useRef(visible);live.current=enabled;
  const pending=useRef<{resolve:(hidden:boolean)=>void;timer:ReturnType<typeof setTimeout>}|null>(null);
  const finish=useCallback((hidden:boolean)=>{
    const task=pending.current;if(!task)return;pending.current=null;clearTimeout(task.timer);
    if(live.current)setDismissing(false);task.resolve(hidden);
  },[]);
  useEffect(()=>{
    live.current=enabled;
    if(!enabled){finish(false);return;}
    shown.current=Keyboard.isVisible();setVisible(shown.current);
    const show=()=>{shown.current=true;setVisible(true);};
    const hide=()=>{shown.current=false;setVisible(false);finish(true);};
    const listeners=[Keyboard.addListener("keyboardWillShow",show),Keyboard.addListener("keyboardDidShow",show),Keyboard.addListener("keyboardDidHide",hide),
      Keyboard.addListener("keyboardDidChangeFrame",event=>{
        const frame=event.endCoordinates;
        if(frame&&(frame.height===0||frame.screenY>=height.current))hide();
      })];
    return()=>{live.current=false;listeners.forEach(listener=>listener.remove());finish(false);};
  },[enabled,finish]);
  const isActive=useCallback(()=>shown.current||!!pending.current,[]);
  const dismiss=useCallback(()=>{
    if(!live.current)return Promise.resolve(false);
    if(pending.current)return new Promise<boolean>(resolve=>{
      // A repeated press only joins the existing dismissal; it can never close NOTA.
      const task=pending.current!,previous=task.resolve;task.resolve=hidden=>{previous(hidden);resolve(hidden);};
    });
    const hadKeyboard=shown.current,focused=TextInput.State.currentlyFocusedInput();
    if(!hadKeyboard&&!focused)return Promise.resolve(true);
    return new Promise<boolean>(resolve=>{
      // This is a failure bound, not a delay before showing tools or a forced success.
      const timer=setTimeout(()=>finish(false),1200);pending.current={resolve,timer};setDismissing(true);
      try{
        focused?.blur();Keyboard.dismiss();
        if(!hadKeyboard&&!TextInput.State.currentlyFocusedInput())finish(true);
      }catch{finish(false);}
    });
  },[finish]);
  return {visible,dismissing,isActive,dismiss};
}
