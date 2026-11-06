import {useEffect,useSyncExternalStore} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
export const NAVIGATION_OPACITY_KEY="go_navigation_opacity_v1";
export const clampNavigationOpacity=(value:number)=>Math.max(11,Math.min(99,Math.round(Number.isFinite(value)?value:75)));
let value=75,revision=0,loading:Promise<void>|undefined,writes=Promise.resolve();const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(fn=>fn());
export function loadNavigationOpacity(){if(!loading){const version=revision;loading=AsyncStorage.getItem(NAVIGATION_OPACITY_KEY).then(raw=>{if(raw!==null&&version===revision){value=clampNavigationOpacity(Number(raw));emit();}}).catch(()=>{});}return loading;}
export function setNavigationOpacity(next:number){value=clampNavigationOpacity(next);revision++;emit();const saved=value;writes=writes.catch(()=>{}).then(()=>AsyncStorage.setItem(NAVIGATION_OPACITY_KEY,String(saved)));return writes;}
export function useNavigationOpacity(_screenKey?:string){const opacity=useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>value,()=>75);useEffect(()=>{void loadNavigationOpacity();},[]);return opacity;}
