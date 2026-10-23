import assert from "node:assert/strict";
import test from "node:test";
import {canUseService,canStartActivity,canRegisterTrackingEntries} from "../../src/lib/auth/account-access";
test("restricted members can view services but cannot start activities",()=>{
 const base={role:"member",approval_status:"approved",account_status:"active"};
 assert.equal(canUseService(base),true);assert.equal(canStartActivity(base),true);
 assert.equal(canUseService({...base,account_status:"restricted"}),true);assert.equal(canStartActivity({...base,account_status:"restricted"}),false);
 for(const profile of [null,{...base,account_status:"suspended"},{...base,account_status:"withdrawn"},{...base,role:"pending"},{...base,approval_status:"pending"},{...base,withdrawal_pending:true},{...base,account_status:"restricted",withdrawal_pending:true}]) {
  assert.equal(canUseService(profile),false);assert.equal(canStartActivity(profile),false);
 }
});

test("tracking entry registration admits active approved staff and admins only",()=>{
 const p={role:"staff",approval_status:"approved",account_status:"active"};
 for(const role of ["staff","admin"])assert.equal(canRegisterTrackingEntries({...p,role}),true);
 for(const changed of [{role:"member"},{role:"guest"},{account_status:"restricted"},{account_status:"suspended"},{approval_status:"pending"},{withdrawal_pending:true}])assert.equal(canRegisterTrackingEntries({...p,...changed}),false);
});
