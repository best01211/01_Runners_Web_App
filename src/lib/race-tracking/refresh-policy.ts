export const TRACKING_REFRESH_MS = 180_000;
export const TRACKING_MIN_REFRESH_MS = 60_000;

/** The race start is the clock origin; opening a page does not reset it. */
export function nextTrackingRefresh(startAt:string,now:number):number {
 const start=Date.parse(startAt);
 return now<start?start:start+(Math.floor((now-start)/TRACKING_REFRESH_MS)+1)*TRACKING_REFRESH_MS;
}
export function canRefreshTracking(now:number,lastAttempt:number):boolean {
 return now-lastAttempt>=TRACKING_MIN_REFRESH_MS;
}
