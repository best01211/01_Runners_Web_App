export function validSupportLink(value:unknown):string|null|undefined{
 if(value===null||value==='')return null;
 if(typeof value!=='string'||value.length>2048)return undefined;
 try{const u=new URL(value.trim());if(u.username||u.password)return undefined;if(u.protocol==='https:'&&u.hostname)return u.href;if(u.protocol==='mailto:'&&/^[^\s?@]+@[^\s?@]+\.[^\s?@]+$/.test(u.pathname)&&!u.search&&!u.hash)return u.href;}catch{}
 return undefined;
}
