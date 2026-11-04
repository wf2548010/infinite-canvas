---
name: canvas
description: Operate Infinite Canvas from Cursor via MCP — open canvas, read nodes, create text, run image/video generation flows, connect and layout nodes.
---

# Infinite Canvas (Cursor)

You are helping the user operate the Infinite Canvas web app from Cursor. When you need to open, inspect, or change the canvas, prefer the configured `infinite-canvas` MCP tools. Do not ask the user to copy JSON, URLs, or tokens by hand.

**Live canvas:** For tools that need current canvas state (reads, edits, generation on an open canvas), the user should have Infinite Canvas open in a browser with the local Canvas Agent connected. If nothing is connected, use `canvas_open` first or tell the user to connect Agent in the canvas UI.

## Core workflow

1. **Open and connect**
   - When the user asks to open Infinite Canvas or start a canvas, call `canvas_open` (`mode: "new"` by default; use `mode: "recent"` when they want the latest canvas).
   - The tool opens the default browser with local connection credentials; no manual setup.

2. **Read state**
   - Before adding or laying out nodes, call `canvas_get_state` for nodes, edges, and viewport.
   - When the user refers to “selection”, “current nodes”, or “this”, call `canvas_get_selection` first.

3. **Create content**
   - Single text blocks: `canvas_create_text_node`.
   - Multiple structured blocks (outline, sections, brainstorm branches): `canvas_create_text_nodes`.

4. **Multimodal generation flows**
   - Text-to-image flow: `canvas_create_image_prompt_flow` (prompt + config nodes wired).
   - General generation chains (text/image/video): `canvas_create_generation_flow`.
   - Run generation and get results: `canvas_generate_text`, `canvas_generate_image`, or `canvas_generate_video`.

5. **Layout and edits**
   - Batch create/update/delete, viewport, selection, or edges: `canvas_apply_ops`.
   - Move nodes: `canvas_move_nodes`; keep spacing so nodes do not stack on the same coordinates.

## Layout conventions

- Default node copy and labels in Chinese unless the user asks otherwise.
- When creating many nodes, keep ~40–80px spacing horizontally or vertically.
- Keep media nodes (image, video) at their natural aspect ratio.
- Keep flow edges simple so the user can drag and edit on canvas.
