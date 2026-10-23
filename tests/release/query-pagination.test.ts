import assert from "node:assert/strict";
import test from "node:test";
import {readAllPages} from "../../src/lib/query-pagination";
test("participant counts include records beyond the default 1000-row cap",async()=>{
 const source=Array.from({length:1101},(_,i)=>i);
 const result=await readAllPages(async(from,to)=>({data:source.slice(from,to+1),error:null}));
 assert.deepEqual(result,source);
});
test("exact page boundaries and empty results terminate correctly",async()=>{
 for(const length of [0,500,1000,5000]){
  const source=Array.from({length},(_,i)=>i);
  assert.equal((await readAllPages(async(from,to)=>({data:source.slice(from,to+1),error:null}))).length,length);
 }
});
test("failed or oversized reads do not produce misleading partial counts",async()=>{
 await assert.rejects(()=>readAllPages(async()=>({data:null,error:{message:"failed"}})));
 await assert.rejects(()=>readAllPages(async()=>({data:Array(500).fill(1),error:null}),500));
});
