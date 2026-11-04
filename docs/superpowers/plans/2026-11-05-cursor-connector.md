# Cursor Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Cursor Agent operate Infinite Canvas via the existing `@zhuyichuan/canvas-agent` MCP, with a connector pack, docs, and Agent connect-panel guidance.

**Architecture:** Mirror `plugins/workbuddy-connector/`: ship Cursor-ready `mcp.json` + Skill + README; document install on the docs site; add a Cursor card on `AgentConnectView` that copies the same MCP JSON and links to docs. No changes to `canvas-agent` protocol or sidebar chat routing.

**Tech Stack:** Existing Vite/React web app, i18n (`zh-CN.ts` / `en-US.ts`), Fumadocs MDX docs, npm package `@zhuyichuan/canvas-agent`.

**Spec:** `docs/superpowers/specs/2026-11-05-cursor-connector-design.md`

## Global Constraints

- Reuse `@zhuyichuan/canvas-agent` MCP; do not invent Cursor-specific RPC.
- Do not commit repo-root `.cursor/mcp.json`.
- Do not detect Cursor online status or wire sidebar chat to Cursor.
- MCP JSON copied in UI must match `plugins/cursor-connector/mcp.json` exactly.
- Docs link base: `DOCS_URL` from `web/src/constant/env.ts` (default `https://docs.canvas.imihoo.com`).
- Branch: `pre/1.1.0`.

## File Map

| Path | Responsibility |
| --- | --- |
| `plugins/cursor-connector/mcp.json` | Canonical Cursor MCP config |
| `plugins/cursor-connector/mcp.project.example.json` | Same JSON; named for `.cursor/mcp.json` copy |
| `plugins/cursor-connector/skills/canvas/SKILL.md` | Agent instructions (Cursor-oriented) |
| `plugins/cursor-connector/README.md` | Install / verify / FAQ |
| `docs/content/docs/overview/cursor-connector.zh-CN.mdx` | Chinese docs page |
| `docs/content/docs/overview/cursor-connector.mdx` | English docs page |
| `docs/content/docs/overview/meta.zh-CN.json` | Nav entry |
| `docs/content/docs/overview/meta.json` | Nav entry |
| `docs/content/docs/overview/features.zh-CN.mdx` | Feature blurb + link |
| `docs/content/docs/overview/features.mdx` | Feature blurb + link |
| `web/src/components/agent/agent-connect-view.tsx` | Cursor connect card UI |
| `web/src/i18n/locales/zh-CN.ts` | Chinese strings |
| `web/src/i18n/locales/en-US.ts` | English strings |

---

### Task 1: Cursor connector pack

**Files:**
- Create: `plugins/cursor-connector/mcp.json`
- Create: `plugins/cursor-connector/mcp.project.example.json`
- Create: `plugins/cursor-connector/skills/canvas/SKILL.md`
- Create: `plugins/cursor-connector/README.md`

**Interfaces:**
- Produces: MCP JSON object with server key `infinite-canvas` and args `["-y", "@zhuyichuan/canvas-agent", "mcp"]` (no WorkBuddy `runtime` / `npmRegistry` fields unless Cursor docs require them — keep Cursor config minimal as in the design spec).

- [ ] **Step 1: Create `mcp.json` and `mcp.project.example.json`**

Both files must contain identical content:

```json
{
  "mcpServers": {
    "infinite-canvas": {
      "command": "npx",
      "args": ["-y", "@zhuyichuan/canvas-agent", "mcp"]
    }
  }
}
```

- [ ] **Step 2: Create `skills/canvas/SKILL.md`**

Base on `plugins/workbuddy-connector/skills/canvas/SKILL.md`, but:
- Title/description may say Cursor / Infinite Canvas (not WorkBuddy).
- Keep the same tool workflow (`canvas_open`, `canvas_get_state`, generation tools, `canvas_apply_ops`).
- Add one note: user should have the canvas open in a browser with local Agent connected when tools need live canvas state.

Frontmatter example:

```markdown
---
name: canvas
description: Operate Infinite Canvas from Cursor via MCP — open canvas, read nodes, create text, run image/video generation flows, connect and layout nodes.
---
```

- [ ] **Step 3: Create `README.md`**

Must include:
1. What this connector does (Cursor → MCP → canvas-agent → browser canvas).
2. Prerequisites (Node 20+, canvas open, Agent connected).
3. Global install: merge into `~/.cursor/mcp.json`.
4. Project install: copy `mcp.project.example.json` to `.cursor/mcp.json`.
5. Enable MCP in Cursor Customize / Settings, refresh if needed.
6. Verify prompt:「读取当前画布状态」/ "Read the current canvas state".
7. FAQ: no canvas connected; npx network failures; MCP disabled.
8. Note: do not commit secrets; this MCP has no API key in config.

- [ ] **Step 4: Commit**

```bash
git add plugins/cursor-connector
git commit -m "$(cat <<'EOF'
feat(plugins): add Cursor MCP connector pack

Ship mcp.json, project example, Skill, and README so Cursor can drive Infinite Canvas via canvas-agent.
EOF
)"
```

---

### Task 2: Docs site pages and navigation

**Files:**
- Create: `docs/content/docs/overview/cursor-connector.zh-CN.mdx`
- Create: `docs/content/docs/overview/cursor-connector.mdx`
- Modify: `docs/content/docs/overview/meta.zh-CN.json`
- Modify: `docs/content/docs/overview/meta.json`
- Modify: `docs/content/docs/overview/features.zh-CN.mdx`
- Modify: `docs/content/docs/overview/features.mdx`

**Interfaces:**
- Consumes: MCP JSON and install steps from Task 1.
- Produces: Doc routes `/zh-CN/docs/overview/cursor-connector` and `/docs/overview/cursor-connector` (Fumadocs path convention matching WorkBuddy pages).

- [ ] **Step 1: Add Chinese page `cursor-connector.zh-CN.mdx`**

Mirror structure of `workbuddy-connector.zh-CN.mdx` but Cursor-specific. Frontmatter:

```yaml
---
title: Cursor 连接器
description: 在 Cursor 中通过 MCP 连接并操作 Infinite Canvas
---
```

Sections: intro, prerequisites, global/project config (embed the mcp.json), verification examples, relationship to WorkBuddy (shared canvas-agent), FAQ. Point source files to `plugins/cursor-connector/`.

- [ ] **Step 2: Add English page `cursor-connector.mdx`**

Same structure in English; title `Cursor Connector`.

- [ ] **Step 3: Register nav**

In both `meta.zh-CN.json` and `meta.json`, insert `"cursor-connector"` immediately after `"workbuddy-connector"` in `pages`.

- [ ] **Step 4: Link from features**

In `features.zh-CN.mdx`, near the WorkBuddy sentence, add:

```markdown
Cursor 可通过 MCP 操作画布，见 [Cursor 连接器](/zh-CN/docs/overview/cursor-connector)。
```

In `features.mdx`, add the English equivalent linking to `/docs/overview/cursor-connector`.

- [ ] **Step 5: Commit**

```bash
git add docs/content/docs/overview/cursor-connector.zh-CN.mdx docs/content/docs/overview/cursor-connector.mdx docs/content/docs/overview/meta.zh-CN.json docs/content/docs/overview/meta.json docs/content/docs/overview/features.zh-CN.mdx docs/content/docs/overview/features.mdx
git commit -m "$(cat <<'EOF'
docs: add Cursor connector guide and nav links

Document MCP setup for Cursor and link it from overview features.
EOF
)"
```

---

### Task 3: Agent connect panel Cursor card + i18n

**Files:**
- Modify: `web/src/i18n/locales/zh-CN.ts` (`agent.connect` block ~1507–1522)
- Modify: `web/src/i18n/locales/en-US.ts` (same keys)
- Modify: `web/src/components/agent/agent-connect-view.tsx`

**Interfaces:**
- Consumes: Canonical MCP JSON string matching Task 1 `mcp.json`.
- Consumes: `DOCS_URL` from `@/constant/env`.
- Produces: UI actions `copyCommand(mcpJson)` and `window.open` docs URL.

- [ ] **Step 1: Add i18n keys**

Under `agent.connect` in `zh-CN.ts`:

```ts
cursorTitle: "在 Cursor 中连接无限画布",
cursorText: "将 MCP 配置写入 Cursor 后，可在 Cursor 对话里读取和操作当前已连接的画布。",
cursorCopyJson: "复制 MCP JSON",
cursorJsonCopied: "MCP JSON 已复制",
cursorPathHint: "合并到 ~/.cursor/mcp.json，或复制为项目内 .cursor/mcp.json",
cursorDocs: "查看 Cursor 连接文档",
```

Under `agent.connect` in `en-US.ts`:

```ts
cursorTitle: "Connect Infinite Canvas in Cursor",
cursorText: "Add the MCP config in Cursor to read and operate the canvas that is already connected in the browser.",
cursorCopyJson: "Copy MCP JSON",
cursorJsonCopied: "MCP JSON copied",
cursorPathHint: "Merge into ~/.cursor/mcp.json, or save as .cursor/mcp.json in a project",
cursorDocs: "Open Cursor connector docs",
```

- [ ] **Step 2: Update `agent-connect-view.tsx`**

1. Import `DOCS_URL` from `@/constant/env`.
2. Define constant (keep in sync with connector pack):

```ts
const CURSOR_MCP_JSON = `{
  "mcpServers": {
    "infinite-canvas": {
      "command": "npx",
      "args": ["-y", "@zhuyichuan/canvas-agent", "mcp"]
    }
  }
}`;
```

3. After the「启动本地 Agent」card (the block using `LOCAL_AGENT_COMMAND`), add a Cursor card:
   - Icon: can reuse `Bot` or `Terminal` (or `PlugZap`); keep visual style of existing cards (`rounded-lg border p-3.5`).
   - Title: `t("agent.connect.cursorTitle")`
   - Body: `t("agent.connect.cursorText")`
   - Path hint: `t("agent.connect.cursorPathHint")`
   - Button: copy `CURSOR_MCP_JSON` via existing `copyCommand`, success toast `t("agent.connect.cursorJsonCopied")` (extend `copyCommand` to accept optional success key, or inline `message.success`).
   - Link/button: open `${DOCS_URL}/zh-CN/docs/overview/cursor-connector` when locale is zh, else `${DOCS_URL}/docs/overview/cursor-connector`. Use `i18n.language` from `useTranslation()` (starts with `zh` → Chinese path).

Also update the small tip under local agent command if needed so it does not imply only WorkBuddy — optional one-line mention that Cursor uses the same Agent via MCP (keep minimal).

- [ ] **Step 3: Smoke-check UI**

```bash
cd web
# ensure Node 20+ on PATH
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
bun run typecheck
```

Expected: no new type errors in touched files.

Manually open Agent panel → Connect: Cursor card visible; copy produces valid JSON; docs link opens.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/agent/agent-connect-view.tsx web/src/i18n/locales/zh-CN.ts web/src/i18n/locales/en-US.ts
git commit -m "$(cat <<'EOF'
feat(agent): add Cursor MCP setup card on connect panel

Guide users to copy Cursor mcp.json and open the Cursor connector docs.
EOF
)"
```

---

### Task 4: End-to-end verification checklist

**Files:** none required (manual)

- [ ] **Step 1: Pack consistency**

```bash
diff -u plugins/cursor-connector/mcp.json plugins/cursor-connector/mcp.project.example.json
# expect empty diff
```

Confirm UI `CURSOR_MCP_JSON` parses to the same object as `mcp.json`.

- [ ] **Step 2: Optional live MCP check (if environment allows)**

1. Ensure canvas page open and local Agent connected.
2. Merge `plugins/cursor-connector/mcp.json` into `~/.cursor/mcp.json`.
3. In Cursor, enable `infinite-canvas` MCP.
4. Ask:「读取当前画布状态」— expect a state summary, not a connection error.

If network/`npx` cannot pull the package in this environment, record that manual step as pending for the user and still ship the pack/docs/UI.

- [ ] **Step 3: Final commit only if verification fixed anything**; otherwise done.

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| `plugins/cursor-connector/` pack | Task 1 |
| Docs + nav + features link | Task 2 |
| Connect panel Cursor card + i18n | Task 3 |
| No root `.cursor/mcp.json` | Global Constraints + Task 1 README |
| No canvas-agent protocol change | Global Constraints |
| Test plan | Task 4 |
