import assert from "node:assert/strict";
import test from "node:test";

import { shouldFinishWorkbuddyPoll, visibleWorkbuddyMessages, workbuddyPermissionRequestId, type WorkbuddyPollMessage } from "./workbuddy-poll.js";

const text = (messageId: string, body: string): WorkbuddyPollMessage => ({ messageId, role: "assistant", msgType: "text", text: body, requestId: messageId });

test("first assistant text does not finish the turn", () => {
    assert.equal(shouldFinishWorkbuddyPoll([], [text("a1", "hello")]), false);
});

test("two identical assistant snapshots finish the turn", () => {
    const snapshot = [text("a1", "hello")];
    assert.equal(shouldFinishWorkbuddyPoll(snapshot, snapshot), true);
});

test("an open permission request keeps the turn running", () => {
    const snapshot: WorkbuddyPollMessage[] = [{ messageId: "p1", role: "assistant", msgType: "permission", text: "allow?", requestId: "req-1" }];
    assert.equal(shouldFinishWorkbuddyPoll(snapshot, snapshot), false);
});

test("permission_request uses metadata requestId, otherwise message id", () => {
    assert.equal(workbuddyPermissionRequestId({ messageId: "m1", metadata: { requestId: "req-9" } }), "req-9");
    assert.equal(workbuddyPermissionRequestId({ messageId: "m1" }), "m1");
});

test("a replied permission drops out, then two stable text snapshots finish", () => {
    const messages: WorkbuddyPollMessage[] = [
        text("a1", "done"),
        { messageId: "p1", role: "assistant", msgType: "permission_request", text: "allow?", requestId: "req-1" },
    ];
    const hidden = visibleWorkbuddyMessages(messages, new Set(["req-1"]));
    assert.deepEqual(hidden, [text("a1", "done")]);
    assert.equal(shouldFinishWorkbuddyPoll(hidden, hidden), true);
});