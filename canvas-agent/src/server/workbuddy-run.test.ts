import assert from "node:assert/strict";
import test from "node:test";

import { beginWorkbuddyHttpRun, endWorkbuddyHttpRun, interruptWorkbuddyHttpRun, workbuddyHttpBusy } from "./workbuddy-run.js";

test("a second WorkBuddy run is rejected until the first ends", () => {
    const first = beginWorkbuddyHttpRun();
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = beginWorkbuddyHttpRun();
    assert.deepEqual(second, { ok: false, code: "WORKBUDDY_BUSY", error: "WorkBuddy 正在回复上一条消息" });
    assert.equal(interruptWorkbuddyHttpRun(), true);
    assert.equal(first.controller.signal.aborted, true);
    endWorkbuddyHttpRun();
    assert.equal(workbuddyHttpBusy(), false);
    assert.equal(interruptWorkbuddyHttpRun(), false);
});