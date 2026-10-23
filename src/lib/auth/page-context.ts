import {createHmac,timingSafeEqual} from "node:crypto";
import type {CurrentProfile} from "./current-user";

// Internal request header only. Never put this on browser response headers/cookies.
export const PAGE_CONTEXT_HEADER="x-runners-verified-page";
const VERSION=1;
const MAX_AGE_MS=60_000;
function signature(value:string){
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)return null;
 const key=createHmac("sha256",secret).update("runners-page-context-v1").digest();
 return createHmac("sha256",key).update(value).digest();
}
function cookieBinding(cookie:string){return createHmac("sha256","runners-session-binding-v1").update(cookie).digest("hex");}
export function canPassPageContext(pathname:string,method:string){
 return method==="GET"&&!/^\/(?:api|auth|_next)(?:\/|$)/.test(pathname);
}
export function encodePageContext(profile:CurrentProfile,cookie:string,pathname:string,now=Date.now()):string|null{
 if(!canPassPageContext(pathname,"GET"))return null;
 const value=Buffer.from(JSON.stringify({version:VERSION,issuedAt:now,pathname,cookie:cookieBinding(cookie),profile})).toString("base64url");
 const mac=signature(value);return mac?`${value}.${mac.toString("base64url")}`:null;
}
export function decodePageContext(token:string|null,cookie:string,now=Date.now()):CurrentProfile|null{
 if(!token||token.length>8192)return null;
 try{
  const [value,encodedMac,extra]=token.split(".");if(!value||!encodedMac||extra)return null;
  const expected=signature(value),actual=Buffer.from(encodedMac,"base64url");
  if(!expected||actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  const context=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
  if(context.version!==VERSION||!Number.isFinite(context.issuedAt)||now<context.issuedAt||now-context.issuedAt>MAX_AGE_MS||context.cookie!==cookieBinding(cookie)||typeof context.pathname!=="string"||!canPassPageContext(context.pathname,"GET"))return null;
  const profile=context.profile;
  if(!profile||typeof profile.user_id!=="string"||typeof profile.login_id!=="string"||typeof profile.name!=="string"||!['guest','member','staff','admin'].includes(profile.role)||!['active','restricted'].includes(profile.account_status)||profile.approval_status!=="approved"||profile.withdrawal_pending!==false)return null;
  return profile as CurrentProfile;
 }catch{return null;}
}
