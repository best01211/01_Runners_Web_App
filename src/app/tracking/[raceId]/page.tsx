import {TrackingRaceScreen} from "@/components/race-tracking/tracking-race-screen";
export const metadata={title:"라이브 선수 추적 | 01Runners"};
type Props={params:Promise<{raceId:string}>;searchParams?:Promise<{view?:string}>};
export default async function Page({params,searchParams}:Props){
 const requested=(await searchParams)?.view;
 return <TrackingRaceScreen params={params} view={requested==="runner"||requested==="cheer"?requested:"overview"}/>;
}
