import type { CSSProperties } from "react";

const paths = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h2m4 0h2m-8 4h2",
  trophy: "M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v5m-4 3h8m-7-3h6v3H9Z",
  route: "M8 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM8 5h8a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h8",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  plus: "M12 4v16M4 12h16",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2",
  logout: "M9 3H4v18h5m6-14 5 5-5 5m-7-5h12",
  link: "m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  check: "m5 12 4 4L19 6",
  users: "M16 21v-2a6 6 0 0 0-12 0v2M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-4a4 4 0 0 1 0 8m3 10v-2a6 6 0 0 0-3-5",
} as const;
export type IconName = keyof typeof paths;
export function Icon({name,size=20,className="",style}:{name:IconName;size?:number;className?:string;style?:CSSProperties}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} style={style}><path d={paths[name]}/></svg>;
}
