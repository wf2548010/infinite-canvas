# Sidebar External Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let WorkBuddy, Cursor, and other MCP clients operate the open canvas, while the sidebar chats with WorkBuddy and only shows Cursor setup.

**Architecture:** Keep one local `canvas-agent` MCP bridge. The sidebar stores `workbuddy` or `cursor` and never starts Codex. WorkBuddy turns poll the desktop assistant until a pure function says the snapshot is stable, then `turn.completed` clears the sidebar wait. Cursor mode renders the existing MCP card and does not send chat.

**Tech Stack:** `canvas-agent` Node test runner (`node:test` via `tsx`), Vite/React sidebar, Vitest, i18n `zh-CN` / `en-US`.

**Spec:** `docs/superpowers/specs/2026-11-15-sidebar-external-agents-design.md`

## Global Constraints

- `AGENT_PROTOCOL_VERSION` stays `6`. `hello.providerRun` is optional.
- Do not delete Codex or Claude adapters or their HTTP routes.
- Do not add Cursor chat or Cursor online detection.
- Do not change canvas generation workflows, text model profiles, or the 30 second canvas tool timeout.
- Page copy goes through `web/src/i18n/locales/zh-CN.ts` and `en-US.ts`.
- Provider storage key is `canvas-agent-provider`. Values are `workbuddy` and `cursor`. Default is `workbuddy`.
- MCP JSON for Cursor and other clients is exactly the object in the spec.
- Poll interval is 1500ms. Maximum polls is 120.
- Overlapping WorkBuddy turn error text is exactly `WorkBuddy 正在回复上一条消息`.
- Missing canvas tool error stays `当前没有已连接画布`.
- Do not run a production build. Run only the test commands named in each task.

## File Map

| Path | Responsibility |
| --- | --- |
| `canvas-agent/src/agent/workbuddy-poll.ts` | Snapshot sorting, permission ids, finish decision |
| `canvas-agent/src/agent/workbuddy-poll.test.ts` | Finish and visibility tests |
| `canvas-agent/src/agent/workbuddy.ts` | Poll loop, updates, timeout, abort |
| `canvas-agent/src/agent/workbuddy.test.ts` | Fake-fetch turn test |
| `canvas-agent/src/server/mcp.ts` | Health URL used by liveness check |
| `canvas-agent/src/server/mcp-health.test.ts` | Health URL test |
| `canvas-agent/src/canvas/session.ts` | `providerRun` on hello |
| `canvas-agent/src/canvas/session.test.ts` | Hello field and missing-canvas error |
| `canvas-agent/src/server/http.ts` | No Codex boot, interrupt, overlap rejection |
| `canvas-agent/package.json` | Register the new test files |
| `web/src/components/agent/agent-run-state.ts` | Send gate, wait reset, SSE decision, provider parse |
| `web/src/components/agent/agent-run-state.test.ts` | Those decisions |
| `web/src/stores/use-agent-store.ts` | Initial provider from localStorage |
| `web/src/components/agent/local-agent-panel.tsx` | Switch, send, stop, hello, SSE |
| `web/src/components/agent/agent-connect-view.tsx` | Token card, generic MCP card, Cursor-only section |
| `web/src/services/api/canvas-agent.ts` | Interrupt request helper |
| `web/src/i18n/locales/zh-CN.ts` | New connect strings |
| `web/src/i18n/locales/en-US.ts` | New connect strings |
| `CHANGELOG.md` | Unreleased summary |
| `docs/content/docs/progress/pending-test.mdx` | Manual checks |
| `docs/content/docs/progress/pending-test.zh-CN.mdx` | Manual checks |
| `docs/content/docs/overview/workbuddy-connector.mdx` | Same-assistant sentence |
| `docs/content/docs/overview/workbuddy-connector.zh-CN.mdx` | Same-assistant sentence |

---

### Task 1: WorkBuddy poll decision

**Files:**
- Create: `canvas-agent/src/agent/workbuddy-poll.ts`
- Create: `canvas-agent/src/agent/workbuddy-poll.test.ts`
- Modify: `canvas-agent/package.json` scripts.test

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type WorkbuddyPollMessage = { messageId: string; role: "user" | "assistant"; msgType: string; text: string; requestId: string }`
  - `export function workbuddyPermissionRequestId(message: { messageId: string; metadata?: { requestId?: string } }): string`
  - `export function visibleWorkbuddyMessages(messages: WorkbuddyPollMessage[], repliedIds: ReadonlySet<string>): WorkbuddyPollMessage[]`
  - `export function shouldFinishWorkbuddyPoll(previous: WorkbuddyPollMessage[], current: WorkbuddyPollMessage[]): boolean`

- [ ] **Step 1: Write the failing test**

Create `canvas-agent/src/agent/workbuddy-poll.test.ts`:

```ts
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
```

Add `src/agent/workbuddy-poll.test.ts` to the `test` script in `canvas-agent/package.json`, after `src/agent/codex-history.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd canvas-agent && npx tsx --test src/agent/workbuddy-poll.test.ts`

Expected: FAIL because `./workbuddy-poll.js` cannot be resolved.

- [ ] **Step 3: Write the minimal implementation**

Create `canvas-agent/src/agent/workbuddy-poll.ts`:

```ts
export type WorkbuddyPollMessage = {
    messageId: string;
    role: "user" | "assistant";
    msgType: string;
    text: string;
    requestId: string;
};

export function workbuddyPermissionRequestId(message: { messageId: string; metadata?: { requestId?: string } }) {
    return message.metadata?.requestId || message.messageId;
}

function isPermission(message: WorkbuddyPollMessage) {
    return message.msgType === "permission" || message.msgType === "permission_request";
}

export function visibleWorkbuddyMessages(messages: WorkbuddyPollMessage[], repliedIds: ReadonlySet<string>) {
    return messages
        .filter((message) => !(isPermission(message) && repliedIds.has(message.requestId)))
        .sort((left, right) => left.messageId.localeCompare(right.messageId));
}

export function shouldFinishWorkbuddyPoll(previous: WorkbuddyPollMessage[], current: WorkbuddyPollMessage[]) {
    if (current.some(isPermission)) return false;
    const hasAssistantText = current.some((message) => message.role === "assistant" && message.msgType === "text");
    if (!hasAssistantText) return false;
    return JSON.stringify(previous) === JSON.stringify(current);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd canvas-agent && npx tsx --test src/agent/workbuddy-poll.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add canvas-agent/src/agent/workbuddy-poll.ts canvas-agent/src/agent/workbuddy-poll.test.ts canvas-agent/package.json
git commit -m "test(agent): decide when a WorkBuddy poll is finished"
```

---

### Task 2: Health check URL

**Files:**
- Create: `canvas-agent/src/server/mcp-health.test.ts`
- Modify: `canvas-agent/src/server/mcp.ts`
- Modify: `canvas-agent/package.json` scripts.test

**Interfaces:**
- Consumes: nothing
- Produces: `export function canvasAgentHealthUrl(baseUrl: string): string`

- [ ] **Step 1: Write the failing test**

Create `canvas-agent/src/server/mcp-health.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { canvasAgentHealthUrl } from "./mcp.js";

test("canvas agent liveness uses /health", () => {
    assert.equal(canvasAgentHealthUrl("http://127.0.0.1:17371"), "http://127.0.0.1:17371/health");
    assert.equal(canvasAgentHealthUrl("http://127.0.0.1:17371/"), "http://127.0.0.1:17371/health");
    assert.equal(canvasAgentHealthUrl("http://127.0.0.1:17371").endsWith("/api/session"), false);
});
```

Add `src/server/mcp-health.test.ts` to `canvas-agent/package.json` `scripts.test`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd canvas-agent && npx tsx --test src/server/mcp-health.test.ts`

Expected: FAIL because `canvasAgentHealthUrl` is not exported.

- [ ] **Step 3: Write the minimal implementation**

In `canvas-agent/src/server/mcp.ts`, add and use:

```ts
export function canvasAgentHealthUrl(baseUrl: string) {
    return `${baseUrl.replace(/\/$/, "")}/health`;
}

async function isServerAlive(url: string) {
    try {
        const res = await fetch(canvasAgentHealthUrl(url), { method: "GET", signal: AbortSignal.timeout(1000) });
        return res.ok;
    } catch {
        return false;
    }
}
```

Replace the existing `isServerAlive` body. Leave the rest of `mcp.ts` unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd canvas-agent && npx tsx --test src/server/mcp-health.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add canvas-agent/src/server/mcp.ts canvas-agent/src/server/mcp-health.test.ts canvas-agent/package.json
git commit -m "fix(agent): probe canvas-agent health instead of /api/session"
```

---

### Task 3: Session provider run on hello

**Files:**
- Modify: `canvas-agent/src/canvas/session.ts`
- Modify: `canvas-agent/src/canvas/session.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type ProviderRunState = { provider: "workbuddy"; busy: boolean; turnId: string } | null`
  - `session.setProviderRun(run: ProviderRunState): void`
  - `session.providerRunSnapshot: ProviderRunState`
  - `hello.providerRun` and `hello.protocolVersion === 6`

- [ ] **Step 1: Write the failing test**

Append to `canvas-agent/src/canvas/session.test.ts`:

```ts
test("hello keeps protocol 6 and reports the WorkBuddy run", () => {
    const session = new CanvasSession();
    session.setProviderRun({ provider: "workbuddy", busy: true, turnId: "wb-turn-1" });
    const client = connect(session, "client-1");
    const hello = client.event("hello") as { protocolVersion?: number; providerRun?: { provider: string; busy: boolean; turnId: string } };
    assert.equal(hello.protocolVersion, 6);
    assert.deepEqual(hello.providerRun, { provider: "workbuddy", busy: true, turnId: "wb-turn-1" });
    client.close();
});

test("canvas_get_state without a page says the canvas is not connected", async () => {
    const session = new CanvasSession();
    await assert.rejects(() => session.callTool("canvas_get_state", {}), /当前没有已连接画布/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd canvas-agent && npx tsx --test src/canvas/session.test.ts`

Expected: FAIL because `setProviderRun` does not exist.

- [ ] **Step 3: Write the minimal implementation**

In `canvas-agent/src/canvas/session.ts`:

```ts
export type ProviderRunState = { provider: "workbuddy"; busy: boolean; turnId: string } | null;
```

Add a field and methods on `CanvasSession`:

```ts
private providerRun: ProviderRunState = null;

setProviderRun(run: ProviderRunState) {
    this.providerRun = run;
}

get providerRunSnapshot() {
    return this.providerRun;
}
```

Change the hello payload inside `openEvents` from the current object to include `providerRun: this.providerRun`. Do not change `AGENT_PROTOCOL_VERSION`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd canvas-agent && npx tsx --test src/canvas/session.test.ts`

Expected: PASS, including the previous session tests.

- [ ] **Step 5: Commit**

```bash
git add canvas-agent/src/canvas/session.ts canvas-agent/src/canvas/session.test.ts
git commit -m "feat(agent): report the active WorkBuddy run on hello"
```

---

### Task 4: WorkBuddy turn loop

**Files:**
- Modify: `canvas-agent/src/agent/workbuddy.ts`
- Create: `canvas-agent/src/agent/workbuddy.test.ts`
- Modify: `canvas-agent/package.json` scripts.test

**Interfaces:**
- Consumes: `visibleWorkbuddyMessages`, `shouldFinishWorkbuddyPoll`, `workbuddyPermissionRequestId`, `WorkbuddyPollMessage`
- Produces:
  - `runWorkbuddyTurn(prompt, emit, options)` honors `options.signal?: AbortSignal`
  - `acknowledgeWorkbuddyPermission(requestId: string): void`
  - `resetWorkbuddyTurnState(): void` for tests and for the start of each turn
  - Events: `item.updated` while text changes, one `permission.requested` per request id, `item.completed` then `turn.completed` when finished, aborted, or timed out
  - Timeout text: `WorkBuddy 回复超时`

- [ ] **Step 1: Write the failing test**

Create `canvas-agent/src/agent/workbuddy.test.ts`:

```ts
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
    const controller = new AbortController();
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") return new Response(JSON.stringify({ code: 0, data: { message_id: "user-2" } }), { status: 200 });
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
    assert.equal(events.includes("turn.completed"), true);
    assert.equal(events.includes("agent_error"), false);
});
```

Add `src/agent/workbuddy.test.ts` to `scripts.test`. The test imports `./workbuddy.js`, which today loads config from disk inside `runWorkbuddyTurn`. Step 3 must accept `accessToken` and `baseUrl` in options so the test does not read the user config.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd canvas-agent && npx tsx --test src/agent/workbuddy.test.ts`

Expected: FAIL because `resetWorkbuddyTurnState` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Rewrite the poll body of `runWorkbuddyTurn` in `canvas-agent/src/agent/workbuddy.ts`. Keep `checkWorkbuddyStatus`, `updateWorkbuddyConfig`, and `replyWorkbuddyPermission`.

Add module state and options:

```ts
const repliedPermissionIds = new Set<string>();
const announcedPermissionIds = new Set<string>();

export function resetWorkbuddyTurnState() {
    repliedPermissionIds.clear();
    announcedPermissionIds.clear();
}

export function acknowledgeWorkbuddyPermission(requestId: string) {
    if (requestId) repliedPermissionIds.add(requestId);
}
```

Extend the options argument:

```ts
options: {
    threadId?: string;
    sourceClientId?: string;
    signal?: AbortSignal;
    intervalMs?: number;
    maxPolls?: number;
    accessToken?: string;
    baseUrl?: string;
} = {}
```

Resolve token and base URL with `options.accessToken || getWorkbuddyConfig(config).accessToken` and the same pattern for `baseUrl`. Use `const turnId = options.turnId || \`wb-turn-${crypto.randomUUID().slice(0, 8)}\``. Call `resetWorkbuddyTurnState()` at the start of a turn after the token check. Add `turnId?: string` to the options type.

Replace the poll loop with this behavior:

```ts
const intervalMs = options.intervalMs ?? 1500;
const maxPolls = options.maxPolls ?? 120;
let previous: WorkbuddyPollMessage[] = [];
let latestText = new Map<string, string>();
let finished = false;

for (let i = 0; i < maxPolls; i++) {
    if (options.signal?.aborted) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (options.signal?.aborted) break;
    const pollRes = await fetch(`${baseUrl}/openapi/v2/localassistant/message?message_id=${encodeURIComponent(initialMessageId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
    });
    const pollBody = (await pollRes.json()) as WorkbuddyMessagesResponse;
    const raw = pollBody.code === 0 ? pollBody.data?.messages || [] : [];
    const visible = visibleWorkbuddyMessages(raw.map(toPollMessage), repliedPermissionIds);
    for (const message of visible) {
        if (message.msgType === "permission" || message.msgType === "permission_request") {
            if (!announcedPermissionIds.has(message.requestId)) {
                announcedPermissionIds.add(message.requestId);
                emit("agent_event", { agent: "workbuddy", type: "permission.requested", threadId, turnId, requestId: message.requestId, text: message.text });
            }
            continue;
        }
        if (message.role !== "assistant" || message.msgType !== "text") continue;
        if (latestText.get(message.messageId) === message.text) continue;
        latestText.set(message.messageId, message.text);
        emit("agent_event", {
            agent: "workbuddy",
            type: "item.updated",
            threadId,
            turnId,
            item: { id: message.messageId, type: "agent_message", text: message.text },
        });
    }
    if (shouldFinishWorkbuddyPoll(previous, visible)) {
        finished = true;
        for (const message of visible.filter((item) => item.role === "assistant" && item.msgType === "text")) {
            emit("agent_event", {
                agent: "workbuddy",
                type: "item.completed",
                threadId,
                turnId,
                item: { id: message.messageId, type: "agent_message", text: message.text },
            });
        }
        break;
    }
    previous = visible;
}
if (!finished && !options.signal?.aborted) {
    emit("agent_event", {
        agent: "workbuddy",
        type: "item.completed",
        threadId,
        turnId,
        item: { id: `wb-timeout-${turnId}`, type: "agent_message", text: "WorkBuddy 回复超时" },
    });
}
emit("agent_event", { agent: "workbuddy", type: "turn.completed", threadId, turnId });
emit("agent_done", { agent: "workbuddy", code: 0 });
```

`toPollMessage` sets `text` to `(message.content || []).join("\n")`, `msgType` to `message.msg_type`, and `requestId` through `workbuddyPermissionRequestId`. Do not emit `chat_message` on every poll. On `AbortError` from the timeout signal, treat it like the abort path: emit `turn.completed` and return. Token and network failures still emit `agent_error` and then `turn.completed`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd canvas-agent && npx tsx --test src/agent/workbuddy.test.ts src/agent/workbuddy-poll.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add canvas-agent/src/agent/workbuddy.ts canvas-agent/src/agent/workbuddy.test.ts canvas-agent/package.json
git commit -m "fix(agent): finish a WorkBuddy turn only after the reply settles"
```

---

### Task 5: HTTP run control

**Files:**
- Modify: `canvas-agent/src/server/http.ts`

**Interfaces:**
- Consumes: `session.setProviderRun`, `runWorkbuddyTurn` `signal`, `acknowledgeWorkbuddyPermission`
- Produces:
  - `POST /agent/workbuddy/turn` returns 409 `{ ok: false, code: "WORKBUDDY_BUSY", error: "WorkBuddy 正在回复上一条消息" }` when a run exists
  - `POST /agent/workbuddy/interrupt` aborts the run and returns `{ ok: true }`, or 409 when none exists
  - Successful permission reply calls `acknowledgeWorkbuddyPermission`
  - Process listen no longer calls `prepareExistingThread` or `prepareDraftThread`

- [ ] **Step 1: Write the failing test**

This route is closed over `startHttpServer` and is not imported as a handler. Cover it with a direct assertion file only where the behavior can be imported. Do not start Express here. Instead, add the run guard as an exported function and test that.

Create `canvas-agent/src/server/workbuddy-run.test.ts`:

```ts
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
```

Add `src/server/workbuddy-run.test.ts` to `scripts.test`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd canvas-agent && npx tsx --test src/server/workbuddy-run.test.ts`

Expected: FAIL because `./workbuddy-run.js` does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `canvas-agent/src/server/workbuddy-run.ts`:

```ts
let active: AbortController | null = null;

export function workbuddyHttpBusy() {
    return active !== null;
}

export function beginWorkbuddyHttpRun(): { ok: true; controller: AbortController } | { ok: false; code: "WORKBUDDY_BUSY"; error: "WorkBuddy 正在回复上一条消息" } {
    if (active) return { ok: false, code: "WORKBUDDY_BUSY", error: "WorkBuddy 正在回复上一条消息" };
    active = new AbortController();
    return { ok: true, controller: active };
}

export function interruptWorkbuddyHttpRun() {
    if (!active) return false;
    active.abort();
    return true;
}

export function endWorkbuddyHttpRun() {
    active = null;
}
```

In `canvas-agent/src/server/http.ts`:

- Import `acknowledgeWorkbuddyPermission` and `runWorkbuddyTurn` remains.
- Import `beginWorkbuddyHttpRun`, `endWorkbuddyHttpRun`, `interruptWorkbuddyHttpRun`.
- Replace `app.post("/agent/workbuddy/turn", ...)` with:

```ts
app.post("/agent/workbuddy/turn", route(async (req, res) => {
    const run = beginWorkbuddyHttpRun();
    if (!run.ok) return res.status(409).json(run);
    const threadId = req.body?.threadId ? String(req.body.threadId) : undefined;
    const turnId = `wb-turn-${crypto.randomUUID().slice(0, 8)}`;
    session.setProviderRun({ provider: "workbuddy", busy: true, turnId });
    res.json({ ok: true });
    try {
        await runWorkbuddyTurn(String(req.body?.prompt || ""), emit, {
            threadId,
            sourceClientId: req.body?.clientId ? String(req.body.clientId) : undefined,
            signal: run.controller.signal,
        });
    } finally {
        endWorkbuddyHttpRun();
        session.setProviderRun(null);
    }
}));
```

`runWorkbuddyTurn` currently creates its own `turnId`. Pass `turnId` through options and use that value inside `runWorkbuddyTurn` when provided, so hello and events share it. Add `turnId?: string` to the options type from Task 4.

- Add:

```ts
app.post("/agent/workbuddy/interrupt", route(async (_req, res) => {
    const ok = interruptWorkbuddyHttpRun();
    res.status(ok ? 200 : 409).json(ok ? { ok: true } : { ok: false, error: "当前没有可停止的 WorkBuddy 回复" });
}));
```

- In the existing `/agent/workbuddy/permission` handler, after a successful `replyWorkbuddyPermission`, call `acknowledgeWorkbuddyPermission(String(req.body?.requestId || ""))`.
- Delete the `activeThreadId && session.beginCodexMutation()` block inside `app.listen`. Leave the log lines above it. Do not delete `prepareExistingThread` or the Codex routes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd canvas-agent && npx tsx --test src/server/workbuddy-run.test.ts src/agent/workbuddy.test.ts src/canvas/session.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add canvas-agent/src/server/workbuddy-run.ts canvas-agent/src/server/workbuddy-run.test.ts canvas-agent/src/server/http.ts canvas-agent/src/agent/workbuddy.ts canvas-agent/package.json
git commit -m "fix(agent): stop Codex boot and guard one WorkBuddy turn"
```

---

### Task 6: Sidebar run decisions

**Files:**
- Create: `web/src/components/agent/agent-run-state.ts`
- Create: `web/src/components/agent/agent-run-state.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export const AGENT_PROVIDER_STORAGE_KEY = "canvas-agent-provider"`
  - `export type AgentPanelProvider = "workbuddy" | "cursor"`
  - `export function readAgentProvider(value: string | null): AgentPanelProvider`
  - `export function canSendAgentPrompt(input: { provider: AgentPanelProvider; connected: boolean; sending: boolean; waiting: boolean }): boolean`
  - `export function nextAgentRunState(): { waiting: false; sending: false }`
  - `export function sseErrorDisposition(wasConnected: boolean): "reconnect" | "close"`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/agent/agent-run-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { canSendAgentPrompt, nextAgentRunState, readAgentProvider, sseErrorDisposition } from "./agent-run-state";

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

    it("keeps an established SSE connection open", () => {
        expect(sseErrorDisposition(true)).toBe("reconnect");
        expect(sseErrorDisposition(false)).toBe("close");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && bun run test -- src/components/agent/agent-run-state.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/components/agent/agent-run-state.ts`:

```ts
export const AGENT_PROVIDER_STORAGE_KEY = "canvas-agent-provider";

export type AgentPanelProvider = "workbuddy" | "cursor";

export function readAgentProvider(value: string | null): AgentPanelProvider {
    return value === "cursor" ? "cursor" : "workbuddy";
}

export function canSendAgentPrompt(input: { provider: AgentPanelProvider; connected: boolean; sending: boolean; waiting: boolean }) {
    return input.provider === "workbuddy" && input.connected && !input.sending && !input.waiting;
}

export function nextAgentRunState() {
    return { waiting: false as const, sending: false as const };
}

export function sseErrorDisposition(wasConnected: boolean): "reconnect" | "close" {
    return wasConnected ? "reconnect" : "close";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && bun run test -- src/components/agent/agent-run-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/agent/agent-run-state.ts web/src/components/agent/agent-run-state.test.ts
git commit -m "test(agent): lock sidebar send, wait, and reconnect decisions"
```

---

### Task 7: Wire the sidebar

**Files:**
- Modify: `web/src/stores/use-agent-store.ts`
- Modify: `web/src/services/api/canvas-agent.ts`
- Modify: `web/src/components/agent/local-agent-panel.tsx`
- Modify: `web/src/components/agent/agent-connect-view.tsx`

**Interfaces:**
- Consumes: `readAgentProvider`, `AGENT_PROVIDER_STORAGE_KEY`, `canSendAgentPrompt`, `nextAgentRunState`, `sseErrorDisposition`, `replyWorkbuddyPermission`
- Produces: sidebar behavior described below

- [ ] **Step 1: Add the interrupt client**

In `web/src/services/api/canvas-agent.ts`, next to `runWorkbuddyTurn`:

```ts
export function interruptWorkbuddyTurn(endpoint: string, token: string) {
    return fetchAgentJson<{ ok?: boolean }>(endpoint, token, "/agent/workbuddy/interrupt", jsonPost({}));
}
```

- [ ] **Step 2: Initialize the provider from localStorage**

In `web/src/stores/use-agent-store.ts`, import `AGENT_PROVIDER_STORAGE_KEY` and `readAgentProvider`. Replace the `agentProvider: "workbuddy"` initial value with:

```ts
agentProvider: typeof window === "undefined" ? "workbuddy" : readAgentProvider(localStorage.getItem(AGENT_PROVIDER_STORAGE_KEY)),
```

- [ ] **Step 3: Accept a Cursor-only section**

Add `section = "all"` to `AgentConnectView`. When `section === "cursor"`, return the existing Cursor MCP card and skip the local Agent, start command, and later token cards. Task 8 adds those cards to the `all` section.

- [ ] **Step 4: Change the panel behavior**

In `web/src/components/agent/local-agent-panel.tsx`:

Import `canSendAgentPrompt`, `nextAgentRunState`, `readAgentProvider`, `AGENT_PROVIDER_STORAGE_KEY`, `sseErrorDisposition`, `interruptWorkbuddyTurn`, and `replyWorkbuddyPermission`.

Add local state:

```ts
const [pendingPermission, setPendingPermission] = useState<{ requestId: string; text: string } | null>(null);
```

Hello handler: delete the block that calls `/agent/codex/threads/reset`. After applying hello state, if `hello.providerRun?.busy` and `hello.providerRun.provider === "workbuddy"`, set `waiting: true` and `sending: false`.

SSE `onerror`: compute `sseErrorDisposition(wasConnected)`. On `"reconnect"`, do not set `pendingTool: null`, do not change `waiting`, do not call `pendingToolRef.current = null`, and do not close the source. On `"close"`, keep the current disable path.

`handleAgentEvent`: when `event.type === "permission.requested"`, `setPendingPermission({ requestId: String(event.requestId), text: String(event.text || "") })` and return. When `event.type === "turn.completed"`, call `setAgentState(nextAgentRunState())` in addition to the existing turn cleanup, and `setPendingPermission(null)`. `showAgentError` must also `setAgentState(nextAgentRunState())`.

`sendPrompt` gate becomes:

```ts
if (!canSendAgentPrompt({ provider: currentState.agentProvider, connected: currentState.connected, sending: currentState.sending, waiting: currentState.waiting })) return;
```

Remove `loadingThreads` and `conversation.status` from that condition. Keep the WorkBuddy `runWorkbuddyTurn` branch. Delete the `/agent/codex/turn` branch; if the provider is not `workbuddy`, return before adding a user message. In the catch, if `error instanceof AgentApiError` and the response code is `WORKBUDDY_BUSY`, `setAgentState({ waiting: true, sending: false })` and do not clear an older in-flight user message. Remove only the message whose `clientMessageId` is this attempt's `messageId`.

`stopTurn` calls `interruptWorkbuddyTurn(endpoint, token)` and then `setAgentState(nextAgentRunState())`.

Remove the effects that call `loadThreads`, `loadSkills`, and `/agent/codex/models` when connected. Remove the history tab and the new-thread button. The remaining tabs are chat and log.

Header title is `agentProvider === "cursor" ? "Cursor" : "WorkBuddy"`. Add two text buttons that call:

```ts
const selectProvider = (provider: "workbuddy" | "cursor") => {
    localStorage.setItem(AGENT_PROVIDER_STORAGE_KEY, provider);
    setAgentState({ agentProvider: provider });
};
```

When `agentProvider === "cursor"` and the chat tab is active, render `<AgentConnectView section="cursor" ...existing connection props />` and do not render `AgentChatTimeline` or `AgentChatComposer`.

When WorkBuddy chat is visible and `pendingPermission` is set, render the permission text with confirm and cancel. Confirm calls `replyWorkbuddyPermission(endpoint, token, { requestId: pendingPermission.requestId, answers: { allow: true } })`, then `setPendingPermission(null)`. On failure, `setAgentState(nextAgentRunState())` and append an error message with `error.message`. Cancel calls `stopTurn`.

Composer `disabled` is `!connected`. Composer `sending` stays `sending || waiting`. Placeholder is `t("agent.panel.placeholder")`, including when `conversation.status` is `preparing`.

- [ ] **Step 5: Run the sidebar decision test again**

Run: `cd web && bun run test -- src/components/agent/agent-run-state.test.ts`

Expected: PASS. This task does not add a component mount test.

- [ ] **Step 6: Commit**

```bash
git add web/src/stores/use-agent-store.ts web/src/services/api/canvas-agent.ts web/src/components/agent/local-agent-panel.tsx web/src/components/agent/agent-connect-view.tsx
git commit -m "feat(agent): switch the sidebar between WorkBuddy chat and Cursor setup"
```

---

### Task 8: Connection cards

**Files:**
- Modify: `web/src/components/agent/agent-connect-view.tsx`
- Modify: `web/src/i18n/locales/zh-CN.ts`
- Modify: `web/src/i18n/locales/en-US.ts`

**Interfaces:**
- Consumes: existing `CURSOR_MCP_JSON`, `fetchWorkbuddyConfig`, `saveWorkbuddyConfig`, `fetchWorkbuddyStatus`
- Produces: `AgentConnectView` prop `section?: "all" | "cursor"`

- [ ] **Step 1: Add the strings**

Inside `agent.connect` in both locale files, add:

`zh-CN.ts`:

```ts
"workbuddyTitle": "WorkBuddy 桌面助理",
"workbuddyText": "填入 Access Token 后，侧边栏对话会发给本机正在运行的 WorkBuddy 桌面助理。",
"workbuddyToken": "WorkBuddy Access Token",
"workbuddyTokenPlaceholder": "填入在 WorkBuddy 开放平台生成的 Access Token",
"workbuddyScopes": "权限需求：user.localassistant.readable, user.localassistant.invokable",
"workbuddySave": "保存配置",
"workbuddySaved": "WorkBuddy 配置已保存",
"workbuddySaveFailed": "保存配置失败",
"workbuddyOnline": "桌面助理在线",
"workbuddyOffline": "未检测到运行",
"workbuddyNeedsToken": "待配置",
"workbuddyChecking": "检测中...",
"workbuddyRefresh": "刷新状态",
"workbuddyConnectFirst": "请先连接本地 Canvas Agent",
"workbuddyCheckFailed": "检测失败，请确保本地 Agent 已连接",
"genericMcpTitle": "其他 MCP 客户端",
"genericMcpText": "把同一份 MCP 配置写入其他支持 stdio MCP 的客户端，即可操作当前已连接的画布。",
"providerWorkbuddy": "WorkBuddy",
"providerCursor": "Cursor"
```

`en-US.ts`:

```ts
"workbuddyTitle": "WorkBuddy desktop assistant",
"workbuddyText": "After you save an access token, sidebar chat goes to the WorkBuddy desktop assistant running on this computer.",
"workbuddyToken": "WorkBuddy Access Token",
"workbuddyTokenPlaceholder": "Paste the access token from the WorkBuddy open platform",
"workbuddyScopes": "Scopes: user.localassistant.readable, user.localassistant.invokable",
"workbuddySave": "Save",
"workbuddySaved": "WorkBuddy settings saved",
"workbuddySaveFailed": "Could not save WorkBuddy settings",
"workbuddyOnline": "Desktop assistant online",
"workbuddyOffline": "Desktop assistant not running",
"workbuddyNeedsToken": "Token required",
"workbuddyChecking": "Checking...",
"workbuddyRefresh": "Refresh",
"workbuddyConnectFirst": "Connect the local Canvas Agent first",
"workbuddyCheckFailed": "Check failed. Connect the local Agent and try again",
"genericMcpTitle": "Other MCP clients",
"genericMcpText": "Use the same MCP config in any stdio MCP client to operate the canvas that is already connected.",
"providerWorkbuddy": "WorkBuddy",
"providerCursor": "Cursor"
```

Use `providerWorkbuddy` and `providerCursor` for the sidebar switch labels from Task 7 if those buttons were hardcoded.

- [ ] **Step 2: Restore the token card and add the generic card**

Add `section = "all"` to `AgentConnectView` props. When `section === "cursor"`, return only the existing Cursor MCP card. When `section === "all"`, render, in order: local Agent connection, start command, WorkBuddy token card, Cursor card, generic MCP card.

Uncomment the WorkBuddy card and replace its Chinese literals with `t("agent.connect.workbuddy*")`. Keep the existing load, save, and status handlers. Save and status toasts use the new i18n keys.

Generic card copies `CURSOR_MCP_JSON` with the existing `cursorJsonCopied` toast. Title and body use `genericMcpTitle` and `genericMcpText`.

- [ ] **Step 3: Run the decision test**

Run: `cd web && bun run test -- src/components/agent/agent-run-state.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/agent/agent-connect-view.tsx web/src/components/agent/local-agent-panel.tsx web/src/i18n/locales/zh-CN.ts web/src/i18n/locales/en-US.ts
git commit -m "feat(agent): show WorkBuddy token setup and a shared MCP config"
```

---

### Task 9: Docs for the manual check

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `docs/content/docs/progress/pending-test.zh-CN.mdx`
- Modify: `docs/content/docs/overview/workbuddy-connector.mdx`
- Modify: `docs/content/docs/overview/workbuddy-connector.zh-CN.mdx`

**Interfaces:**
- Consumes: the behavior from Tasks 1–8
- Produces: release notes and manual test notes

- [ ] **Step 1: Update the changelog and connector docs**

At the top of `CHANGELOG.md` `Unreleased`, add:

```md
+ [调整] 侧边栏可在 WorkBuddy 对话和 Cursor 配置之间切换；WorkBuddy、Cursor 及其他 MCP 客户端继续通过本机 Canvas Agent 操作当前画布。
```

After the first paragraph of `docs/content/docs/overview/workbuddy-connector.zh-CN.mdx`, add:

```md
侧边栏里的 WorkBuddy 对话使用同一个桌面端助理。
```

After the first paragraph of `docs/content/docs/overview/workbuddy-connector.mdx`, add:

```md
The canvas sidebar WorkBuddy chat uses this same desktop assistant.
```

- [ ] **Step 2: Record the manual checks**

Insert this block at the top of the list in `docs/content/docs/progress/pending-test.zh-CN.mdx`:

```md
- 侧边栏助手切换：
  - 连接本地 Agent 后，不需要等待 Codex 初始化即可在 WorkBuddy 里发送。
  - 切到 Cursor 后只看到 MCP 配置，没有聊天输入框；复制出的 JSON 含 `npx` 与 `@zhuyichuan/canvas-agent`。
  - WorkBuddy 回复稳定、点停止、等待超时或发送失败后，输入框恢复可发送。
  - 画布页面未连接 Agent 时，外部 MCP 工具返回「当前没有已连接画布」。
```

Insert this block at the top of the list in `docs/content/docs/progress/pending-test.mdx`:

```md
- Sidebar assistant switch:
  - After the local Agent connects, WorkBuddy chat can send without waiting for Codex startup.
  - Cursor mode shows the MCP config and no chat composer. The copied JSON contains `npx` and `@zhuyichuan/canvas-agent`.
  - The composer accepts another message after a settled WorkBuddy reply, a stop, a timeout, or a send failure.
  - An external MCP tool reports that no canvas is connected when the page Agent is disconnected.
```

- [ ] **Step 3: Run the focused tests**

Run:

```bash
cd canvas-agent && npx tsx --test src/agent/workbuddy-poll.test.ts src/agent/workbuddy.test.ts src/server/mcp-health.test.ts src/server/workbuddy-run.test.ts src/canvas/session.test.ts
cd web && bun run test -- src/components/agent/agent-run-state.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/content/docs/progress/pending-test.mdx docs/content/docs/progress/pending-test.zh-CN.mdx docs/content/docs/overview/workbuddy-connector.mdx docs/content/docs/overview/workbuddy-connector.zh-CN.mdx
git commit -m "docs(agent): note the sidebar WorkBuddy and Cursor switch"
```
