import {useEffect,useRef,useState} from "react";
import {getAuthenticatedUserId} from "@/data/booking";
import {onSessionChanged} from "@/lib/sessionEvents";
import {centralConversationFor} from "@/lib/centralConversationRuntime";
import type {CentralConversation} from "@/lib/centralConversation";
import {useLanguage} from "@/contexts/LanguageContext";

/** Privacy is available for the real account; it never grants access to inference. */
export function useGoAiPrivacyModel(visible:boolean){
  const {locale}=useLanguage(),[state,setState]=useState<{userId:string;model:CentralConversation}|null>(null);
  const current=useRef(state);current.current=state;
  useEffect(()=>{let epoch=0,alive=true;
    const load=async()=>{const token=++epoch;current.current?.model.interrupt();setState(null);if(!visible)return;
      try{const userId=await getAuthenticatedUserId();if(!userId)return;const model=centralConversationFor(userId,locale);await model.restore();
        if(alive&&token===epoch&&userId===await getAuthenticatedUserId())setState({userId,model});
      }catch{/* No account or failed identity check cannot expose another account's preferences. */}};
    void load();const off=onSessionChanged(()=>{void load();});return()=>{alive=false;epoch++;off();};
  },[visible,locale]);return state;
}
