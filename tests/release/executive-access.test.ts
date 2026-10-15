import assert from "node:assert/strict";
import test from "node:test";
import {canAdminister} from "../../src/lib/auth/account-access";

test("president and administrator share administration while vice president and staff do not", () => {
  const active={account_status:"active",approval_status:"approved"};
  assert.equal(canAdminister({...active,role:"admin"}),true);
  assert.equal(canAdminister({...active,role:"staff",staff_position:"president"}),true);
  for(const staff_position of ["vice_president","staff",null])assert.equal(canAdminister({...active,role:"staff",staff_position}),false);
  assert.equal(canAdminister({...active,role:"member",staff_position:"president"}),false);
  assert.equal(canAdminister({...active,role:"staff",staff_position:"president",withdrawal_pending:true}),false);
  assert.equal(canAdminister({...active,role:"staff",staff_position:"president",account_status:"restricted"}),false);
});
