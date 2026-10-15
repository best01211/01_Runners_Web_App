import assert from "node:assert/strict";
import test from "node:test";
import {draftAction,toggleDraftGroup} from "../../src/lib/participation-draft";
import {visibleComments} from "../../src/lib/comment-visibility";
import {publicComment} from "../../src/lib/public-data";

test('participation draft requires a selection and distinguishes join, change, cancel and unchanged',()=>{
 assert.equal(draftAction(null,null,false),'empty');assert.equal(draftAction(null,'a',false),'join');
 assert.equal(draftAction('a','a',true),'unchanged');assert.equal(draftAction('a','b',true),'change');
 assert.equal(draftAction('a',null,true),'cancel');
 let selected:string|null=null;selected=toggleDraftGroup(selected,'a');assert.equal(selected,'a');selected=toggleDraftGroup(selected,'a');assert.equal(selected,null);
 assert.equal(draftAction('a',toggleDraftGroup(null,'b'),true),'change');
});
test('self-deleted notices disappear while their replies remain visible and moderation tombstones remain',()=>{
 const make=(id:string,author:string,deleted_by:string|null,parent:string|null=null)=>({comment_id:id,author_id:author,parent_comment_id:parent,kind:'normal',deleted_at:deleted_by?'2026-10-15':null,deleted_by,content:'original'});
 const original=[make('own','me','me'),make('reply','other',null,'own'),make('moderated','other','staff'),make('normal','me',null)];
 const visible=visibleComments(original);
 assert.deepEqual(visible.map(c=>c.comment_id),['reply','moderated','normal']);
 assert.equal(visible[0].parent_comment_id,null);assert.equal(original[1].parent_comment_id,'own');
 const sanitized=publicComment(visible[1]);assert.equal(sanitized.content,'');assert.equal('deleted_by' in sanitized,false);
 const withdrawn={...original[0],author_id:null,deleted_by_author:true};
 assert.equal(visibleComments([withdrawn]).length,0);
});
