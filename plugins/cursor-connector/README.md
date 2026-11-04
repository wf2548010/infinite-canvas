# Infinite Canvas — Cursor connector

This pack lets **Cursor Agent** drive Infinite Canvas through the existing `@zhuyichuan/canvas-agent` MCP server (stdio). Cursor does not talk to the browser directly; the agent process connects to the canvas that is already open and linked via the local Canvas Agent.

```text
Cursor Agent  →  MCP (your mcp.json)  →  npx @zhuyichuan/canvas-agent mcp  →  browser canvas
```

## What you get

| File | Purpose |
| --- | --- |
| `mcp.json` | Canonical MCP config to merge into Cursor |
| `mcp.project.example.json` | Same content; copy to a project as `.cursor/mcp.json` |
| `skills/canvas/SKILL.md` | Agent instructions for canvas tools (optional: add to Cursor skills) |

The MCP server key is `infinite-canvas`. It runs:

```bash
npx -y @zhuyichuan/canvas-agent mcp
```

This connector shares the same tool set as the WorkBuddy connector; only the client (Cursor) and install path differ.

## Prerequisites

- **Node.js 20+** on your machine, with working `npx` (network to fetch `@zhuyichuan/canvas-agent` on first run).
- **Infinite Canvas** open in a browser for the canvas you want to control.
- **Local Canvas Agent connected** in the canvas UI (Agent → Connect). Many tools need an active session to read or mutate live state.
- **MCP enabled in Cursor** after you save config (refresh MCP or restart Cursor if tools do not appear).

## Install

### Global (all projects)

1. Open or create `~/.cursor/mcp.json`.
2. Merge the contents of `mcp.json` from this directory into the top-level `mcpServers` object (keep your other servers).
3. Save the file.

### Project-only

1. Copy `mcp.project.example.json` to your project as `.cursor/mcp.json`.
2. Or merge the `infinite-canvas` entry from `mcp.json` into an existing project `.cursor/mcp.json`.

**Do not commit secrets in MCP config.** This MCP config has **no API key**; still avoid committing local paths or private tokens if you add custom env elsewhere.

This repository does **not** ship a root `.cursor/mcp.json`; use the example files here locally.

### Enable in Cursor

1. Open Cursor **Settings** / **Customize** → MCP (wording may vary by version).
2. Ensure the `infinite-canvas` server is enabled.
3. If the server stays red or tools are missing, reload MCP or restart Cursor after editing `mcp.json`.

## Verify

With the canvas open and Agent connected, in Cursor chat try:

- 读取当前画布状态
- Read the current canvas state

You should get a summary of nodes/viewport, not a persistent “not connected” error.

Optional: install `skills/canvas/SKILL.md` into your Cursor skills path so the agent follows the same tool workflow.

## FAQ

### “No canvas connected” / tools fail with connection errors

Open Infinite Canvas in the browser, go to Agent → Connect, and connect the local Agent. Then retry. You can also ask the agent to call `canvas_open` to launch the browser with credentials.

### `npx` fails (network, timeout, registry)

- Check network and proxy settings.
- Run manually: `npx -y @zhuyichuan/canvas-agent mcp` and fix npm registry mirrors if needed.
- Ensure Node 20+ is on PATH in the environment Cursor uses to spawn MCP.

### MCP disabled or tools not listed

Confirm `~/.cursor/mcp.json` or project `.cursor/mcp.json` is valid JSON, server name is `infinite-canvas`, and MCP is toggled on in Cursor. Refresh MCP after changes.

## Source

Canonical config lives in this directory under `plugins/cursor-connector/`. Docs: `/docs/overview/cursor-connector` and `/zh-CN/docs/overview/cursor-connector`.
