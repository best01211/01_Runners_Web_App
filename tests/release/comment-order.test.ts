import assert from "node:assert/strict";
import test from "node:test";
import { orderComments } from "../../src/lib/comment-order";
test("notices remain first while normal comments show newest first without changing input", () => {
  const comments=[{comment_id:"old",kind:"normal",created_at:"2026-10-13T09:00:00Z"},{comment_id:"notice",kind:"notice",created_at:"2026-10-12T09:00:00Z"},{comment_id:"new",kind:"normal",created_at:"2026-10-13T10:00:00Z"}];
  assert.deepEqual(orderComments(comments).map(row=>row.comment_id),["notice","new","old"]);
  assert.deepEqual(comments.map(row=>row.comment_id),["old","notice","new"]);
});
