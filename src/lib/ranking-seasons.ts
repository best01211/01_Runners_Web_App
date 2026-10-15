export type RankingSeason = {
  season_id:string; name:string; starts_on:string; ends_on:string;
  status:string; is_default:boolean; is_public:boolean;
};

export const ALL_SEASONS = "all";

// The former baseline entry is represented by the explicit, unbounded all view.
function isLegacyOverallSeason(season:RankingSeason) {
  return season.is_default && season.name.trim() === "기본 시즌";
}

export function resolveRankingSeason<T extends RankingSeason>(seasons:T[],requestedId?:string|null,now=new Date()) {
  const today=new Date(now.getTime()+9*60*60*1000).toISOString().slice(0,10);
  const available=seasons.filter(season=>!isLegacyOverallSeason(season))
    .sort((a,b)=>b.starts_on.localeCompare(a.starts_on)||a.season_id.localeCompare(b.season_id));
  const current=available.find(season=>season.status==="active"&&season.starts_on<=today&&today<=season.ends_on);
  let selected:T|undefined;
  if(requestedId===undefined||requestedId===null) selected=current;
  else if(requestedId!==ALL_SEASONS&&requestedId!=="") {
    const requested=seasons.find(season=>season.season_id===requestedId);
    if(!requested)throw new Error("조회할 수 없는 시즌입니다.");
    if(!isLegacyOverallSeason(requested))selected=requested;
  }
  const ordered=current?[current,...available.filter(season=>season.season_id!==current.season_id)]:available;
  return {season:selected,seasons:ordered,currentSeasonId:current?.season_id??null};
}
