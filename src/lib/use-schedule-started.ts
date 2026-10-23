"use client";
import {useEffect,useState} from 'react';

export function useScheduleStarted(startAt:string){
 const [started,setStarted]=useState(false);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const update=()=>{
   clearTimeout(timer);
   const start=Date.parse(startAt),remaining=start-Date.now();
   setStarted(Number.isFinite(start)&&remaining<=0);
   if(Number.isFinite(start)&&remaining>0)timer=setTimeout(update,Math.min(remaining,2147483647));
  };
  update();window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[startAt]);
 return started;
}
