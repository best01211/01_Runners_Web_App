import test from "node:test";
import assert from "node:assert/strict";
import {isAttendanceCode} from "../../src/lib/attendance-code";
test('attendance codes accept exactly four ASCII digits including leading zeros',()=>{
 for(const code of ['1000','9999','0007','0000'])assert.equal(isAttendanceCode(code),true);
 for(const code of ['', '123', '12345', '123456', ' 1234', '1234 ', '12a4', '１２３４',1234,null,undefined])assert.equal(isAttendanceCode(code),false);
});
