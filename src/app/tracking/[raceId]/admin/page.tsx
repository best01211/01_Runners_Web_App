import {TrackingRaceScreen} from "@/components/race-tracking/tracking-race-screen";
export const metadata={title:"추적 관리자 | 01Runners"};
export default function Page({params}:{params:Promise<{raceId:string}>}){return <TrackingRaceScreen params={params} view="admin"/>;}
