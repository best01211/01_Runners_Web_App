import assert from "node:assert/strict";
import test from "node:test";
import { groupDeletionFiles } from "../../src/lib/member-deletion";
import { finishMemberDeletion } from "../../src/lib/member-deletion-runner";
test("deletion manifests stay scoped to their bucket, deduplicate and batch", () => {
  const files = Array.from({length:205},(_,i)=>({bucket:"profiles",name:`member/${i}.webp`}));
  const result=groupDeletionFiles([...files,files[0],{bucket:"other",name:files[0].name}]);
  assert.deepEqual(result.map(group=>[group.bucket,group.paths.length]),[["profiles",100],["profiles",100],["profiles",5],["other",1]]);
  assert.throws(()=>groupDeletionFiles([{bucket:"",name:"photo"}]),/INVALID_STORAGE_MANIFEST/);
});
test("member deletion stops at failure and resumes after storage cleanup", async () => {
  const job={job_id:"job",target_user_id:"target",status:"database_cleaned",storage_files:[{bucket:"profiles",name:"target/profile.webp"}]};
  const calls:string[]=[];
  const steps={removeFiles:async(bucket:string,paths:string[])=>{calls.push(`${bucket}:${paths.join()}`);return true},markStorageCleaned:async()=>{calls.push("storage-state");return true},deleteAuth:async()=>{calls.push("auth");return false},markCompleted:async()=>{calls.push("complete");return true}};
  assert.equal(await finishMemberDeletion(job,steps),"auth");
  assert.deepEqual(calls,["profiles:target/profile.webp","storage-state","auth"]);
  calls.length=0;
  assert.equal(await finishMemberDeletion({...job,status:"storage_cleaned"},{...steps,deleteAuth:async()=>{calls.push("auth");return true}}),"completed");
  assert.deepEqual(calls,["auth","complete"]);
});
test("completed deletion is idempotent and storage failures never delete Auth", async () => {
  const calls:string[]=[];
  const job={job_id:"job",target_user_id:"target",status:"completed",storage_files:[{bucket:"profiles",name:"target/profile.webp"}]};
  const steps={removeFiles:async()=>{calls.push("storage");return false},markStorageCleaned:async()=>{calls.push("storage-state");return true},deleteAuth:async()=>{calls.push("auth");return true},markCompleted:async()=>{calls.push("complete");return true}};
  assert.equal(await finishMemberDeletion(job,steps),"completed");assert.deepEqual(calls,[]);
  assert.equal(await finishMemberDeletion({...job,status:"database_cleaned"},steps),"storage");assert.deepEqual(calls,["storage"]);
});
test("deletion connection and completion failures remain retryable", async () => {
  const job={job_id:"job",target_user_id:"target",status:"storage_cleaned",storage_files:[]};
  const steps={removeFiles:async()=>true,markStorageCleaned:async()=>true,deleteAuth:async()=>true,markCompleted:async()=>false};
  assert.equal(await finishMemberDeletion(job,steps),"finalize");
  assert.equal(await finishMemberDeletion(job,{...steps,deleteAuth:async()=>{throw new Error("disconnected")}}),"connection");
});
