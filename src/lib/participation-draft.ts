export function draftAction(savedGroup:string|null,selectedGroup:string|null,hasParticipation:boolean) {
 if(!hasParticipation)return selectedGroup?'join':'empty';
 if(selectedGroup===null)return 'cancel';
 return selectedGroup===savedGroup?'unchanged':'change';
}
export function toggleDraftGroup(selected:string|null,clicked:string){return selected===clicked?null:clicked;}
