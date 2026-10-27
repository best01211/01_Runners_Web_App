import {TrackingRaceScreen} from "@/components/race-tracking/tracking-race-screen";
export const metadata={title:"라이브 선수 추적 | 01Runners"};
type Props={params:Promise<{raceId:string}>;searchParams?:Promise<{view?:string;runner?:string}>};
export default async function Page({params,searchParams}:Props){
 const query=await searchParams;const requested=query?.view;
 return <TrackingRaceScreen selectedRunner={query?.runner} params={params} view={requested==="runner"||requested==="cheer"?requested:"overview"}/>;
}
