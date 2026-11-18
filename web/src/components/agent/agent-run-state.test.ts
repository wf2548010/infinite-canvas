import { describe, expect, it } from "vitest";

import { acceptsSidebarAgentEvent, canSendAgentPrompt, nextAgentRunState, readAgentProvider, sseErrorDisposition } from "./agent-run-state";

describe("agent run state", () => {
    it("lets a connected WorkBuddy sidebar send while Codex is still preparing", () => {
        expect(canSendAgentPrompt({ provider: "workbuddy", connected: true, sending: false, waiting: false })).toBe(true);
    });

    it("blocks Cursor, a disconnected page, and an in-flight wait", () => {
        expect(canSendAgentPrompt({ provider: "cursor", connected: true, sending: false, waiting: false })).toBe(false);
        expect(canSendAgentPrompt({ provider: "workbuddy", connected: false, sending: false, waiting: false })).toBe(false);
        expect(canSendAgentPrompt({ provider: "workbuddy", connected: true, sending: false, waiting: true })).toBe(false);
    });

    it("reads only workbuddy or cursor", () => {
        expect(readAgentProvider(null)).toBe("workbuddy");
        expect(readAgentProvider("cursor")).toBe("cursor");
        expect(readAgentProvider("codex")).toBe("workbuddy");
    });

    it("clears waiting after completion or error", () => {
        expect(nextAgentRunState()).toEqual({ waiting: false, sending: false });
    });

    it("accepts WorkBuddy events without a saved Codex thread but still filters Codex threads", () => {
        expect(acceptsSidebarAgentEvent({ agent: "workbuddy", threadId: "workbuddy-session" }, "")).toBe(true);
        expect(acceptsSidebarAgentEvent({ agent: "codex", threadId: "other" }, "thread-1")).toBe(false);
        expect(acceptsSidebarAgentEvent({ threadId: "" }, "")).toBe(false);
        expect(acceptsSidebarAgentEvent({ thread_id: "thread-1" }, "thread-1")).toBe(true);
    });

    it("keeps an established SSE connection open", () => {
        expect(sseErrorDisposition(true)).toBe("reconnect");
        expect(sseErrorDisposition(false)).toBe("close");
    });
});
