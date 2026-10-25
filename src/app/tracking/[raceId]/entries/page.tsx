import {TrackingRaceScreen} from "@/components/race-tracking/tracking-race-screen";
export const metadata={title:"선수 등록 | 01Runners"};
export default function Page({params}:{params:Promise<{raceId:string}>}){return <TrackingRaceScreen params={params} view="entries"/>;}
