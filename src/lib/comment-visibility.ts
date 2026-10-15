type Comment={comment_id:string;author_id:string|null;deleted_at:string|null;deleted_by?:string|null;deleted_by_author?:boolean;parent_comment_id:string|null};
export function visibleComments<T extends Comment>(comments:T[]):T[]{
 const hidden=new Set(comments.filter(c=>Boolean(c.deleted_at&&(c.deleted_by_author||(c.deleted_by&&c.deleted_by===c.author_id)))).map(c=>c.comment_id));
 return comments.filter(c=>!hidden.has(c.comment_id)).map(c=>hidden.has(c.parent_comment_id??'')?{...c,parent_comment_id:null}:c);
}
