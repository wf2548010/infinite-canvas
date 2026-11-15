import assert from "node:assert/strict";
import test from "node:test";

import { acknowledgeWorkbuddyPermission, resetWorkbuddyTurnState, runWorkbuddyTurn } from "./workbuddy.js";

test("a WorkBuddy turn updates once, waits through permission, then completes", async () => {
    resetWorkbuddyTurnState();
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    let polls = 0;
    const partial = [{ message_id: "a1", role: "assistant", msg_type: "text", content: ["partial"], metadata: {} }];
    const asking = [
        { message_id: "a1", role: "assistant", msg_type: "text", content: ["final"], metadata: {} },
        { message_id: "p1", role: "assistant", msg_type: "permission", content: ["allow export?"], metadata: { requestId: "req-1" } },
    ];
    const settled = [{ message_id: "a1", role: "assistant", msg_type: "text", content: ["final"], metadata: {} }];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
            return new Response(JSON.stringify({ code: 0, msg: "ok", data: { message_id: "user-1" } }), { status: 200 });
        }
        polls += 1;
        if (polls === 3) acknowledgeWorkbuddyPermission("req-1");
        const messages = polls === 1 ? partial : polls < 4 ? asking : settled;
        return new Response(JSON.stringify({ code: 0, msg: "ok", data: { messages } }), { status: 200 });
    }) as typeof fetch;
    try {
        await runWorkbuddyTurn("draw a city", (type, payload) => {
            events.push({ type, payload: payload as Record<string, unknown> });
        }, { threadId: "thread-1", sourceClientId: "client-1", intervalMs: 0, maxPolls: 8, accessToken: "token", baseUrl: "https://workbuddy.test" });
    } finally {
        globalThis.fetch = original;
        resetWorkbuddyTurnState();
    }
    const updates = events.filter((event) => event.type === "agent_event" && event.payload.type === "item.updated");
    const permissions = events.filter((event) => event.type === "agent_event" && event.payload.type === "permission.requested");
    const completed = events.filter((event) => event.type === "agent_event" && event.payload.type === "turn.completed");
    assert.equal(updates.length >= 1, true);
    assert.equal(new Set(updates.map((event) => (event.payload.item as { id: string }).id)).size, 1);
    assert.equal(permissions.length, 1);
    assert.equal(completed.length, 1);
});

test("aborting a WorkBuddy turn completes it", async () => {
    resetWorkbuddyTurnState();
    const events: string[] = [];
    let polls = 0;
    const controller = new AbortController();
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") return new Response(JSON.stringify({ code: 0, data: { message_id: "user-2" } }), { status: 200 });
        polls += 1;
        if (polls === 1) {
            return new Response(
                JSON.stringify({
                    code: 0,
                    data: { messages: [{ message_id: "a2", role: "assistant", msg_type: "text", content: ["partial reply"], metadata: {} }] },
                }),
                { status: 200 },
            );
        }
        controller.abort();
        return new Response(JSON.stringify({ code: 0, data: { messages: [] } }), { status: 200 });
    }) as typeof fetch;
    try {
        await runWorkbuddyTurn("stop", (type, payload) => {
            const value = payload as { type?: string };
            if (type === "agent_event" && value.type) events.push(value.type);
        }, { threadId: "thread-1", intervalMs: 0, maxPolls: 5, signal: controller.signal, accessToken: "token", baseUrl: "https://workbuddy.test" });
    } finally {
        globalThis.fetch = original;
        resetWorkbuddyTurnState();
    }
    assert.equal(events.includes("item.updated"), true);
    assert.equal(events.includes("item.completed"), true);
    assert.equal(events.includes("turn.completed"), true);
    assert.equal(events.includes("agent_error"), false);
});