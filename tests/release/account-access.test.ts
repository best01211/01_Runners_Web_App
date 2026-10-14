import assert from "node:assert/strict";
import test from "node:test";
import {canUseService,canStartActivity} from "../../src/lib/auth/account-access";
test("restricted members can view services but cannot start activities",()=>{
 const base={role:"member",approval_status:"approved",account_status:"active"};
 assert.equal(canUseService(base),true);assert.equal(canStartActivity(base),true);
 assert.equal(canUseService({...base,account_status:"restricted"}),true);assert.equal(canStartActivity({...base,account_status:"restricted"}),false);
 for(const profile of [null,{...base,account_status:"suspended"},{...base,account_status:"withdrawn"},{...base,role:"pending"},{...base,approval_status:"pending"},{...base,withdrawal_pending:true},{...base,account_status:"restricted",withdrawal_pending:true}]) {
  assert.equal(canUseService(profile),false);assert.equal(canStartActivity(profile),false);
 }
});
