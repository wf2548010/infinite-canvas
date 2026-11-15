# 侧边栏助手与外部 MCP 客户端设计

日期：2026-11-15  
分支：`pre/1.1.0`  
状态：待用户审阅规格后进入实现计划

## 背景与目标

画布右侧助手目前把 Codex 启动和 WorkBuddy 轮询叠在一起：连上后会创建 Codex 线程并等待 MCP 预热，输入框才可用；发出去的消息却走 WorkBuddy 本地接口。该轮询把第一条助理消息当成结束，且 `turn.completed` 不解除等待。连接器探活请求不存在的 `/api/session`。

本设计让外部助手和侧边栏各做各的事，并共用本机 `canvas-agent`：

1. WorkBuddy、Cursor 以及其他 MCP 客户端继续通过 `npx -y @zhuyichuan/canvas-agent mcp` 操作当前已连接的画布。
2. 侧边栏可以在 WorkBuddy 与 Cursor 之间切换。WorkBuddy 在侧边栏里对话，对话进入桌面端同一个助理，再由该助理通过 MCP 改画布。Cursor 在侧边栏只提供 MCP 配置，对话发生在 Cursor 里。
3. 连上画布后不再自动启动 Codex，侧边栏不再提供 Codex 对话，输入框不再等待 Codex 预热。

成功标准：

1. 选择 WorkBuddy 时，本机 Agent 已连接即可发送；请求发往 `/agent/workbuddy/turn`。
2. 选择 Cursor 时，侧边栏只显示 MCP 配置，没有聊天输入框。
3. 连接成功后不请求 `/agent/codex/threads/reset`，Codex 会话仍为 `preparing` 时 WorkBuddy 输入框仍可用。
4. WorkBuddy 一轮回复按消息 ID 更新；内容连续两次轮询不变且没有待确认权限时结束，侧边栏解除等待。停止和 3 分钟超时也会解除等待。
5. 没 Token、桌面端离线、权限回复失败时，对话里有原因，等待解除。
6. 连接器探活请求 `/health`。页面未连接时工具返回「当前没有已连接画布」。SSE 短暂出错时，正在执行的工具调用保留。

## 非目标

- 在侧边栏里直接与 Cursor 对话，或检测 Cursor 是否在线。
- 删除 `canvas-agent` 里已有的 Codex / Claude 适配器和 HTTP 路由。这轮只是侧边栏和启动路径不再调用它们。
- 修改画布节点的生成工作流、文本模型 Profile，或把侧边栏换成项目自建文本大模型。
- 调整 `AGENT_PROTOCOL_VERSION`（当前为 6）。新增字段对旧客户端可选。
- 修改画布工具 30 秒超时。页面真正断开后，未完成的工具请求仍在 30 秒后以「画布操作超时」失败。

## 架构

```text
WorkBuddy 桌面端 ──MCP──┐
Cursor          ──MCP──┼── canvas-agent ──► 当前浏览器里的画布
其他 MCP 客户端 ──MCP──┘

侧边栏「WorkBuddy」── 本地对话接口 ──► 同一个 WorkBuddy 助理 ──MCP──► 画布
侧边栏「Cursor」   ── 配置入口，对话在 Cursor 里进行
```

浏览器中必须开着目标画布，并且本地 Canvas Agent 保持连接。外部工具和 WorkBuddy 助理的画布操作都落到这个页面。

## 侧边栏

选择记在 `localStorage` 键 `canvas-agent-provider`，取值为 `workbuddy` 或 `cursor`，默认 `workbuddy`。刷新后保持。顶栏标题随当前选项显示 WorkBuddy 或 Cursor。

### WorkBuddy

- 主区域是聊天记录和输入框，另保留日志标签。去掉 Codex 历史会话标签。
- 本机 Agent 已连接、当前没有进行中的发送或等待时可以输入。不读取 Codex `conversation.status`，也不等待线程列表加载。
- 连接成功后不请求 `/agent/codex/threads`。
- 发送只调用 `POST /agent/workbuddy/turn`。
- 连接页恢复 WorkBuddy Access Token 配置（当前在 `agent-connect-view.tsx` 中被注释）。可见文案走 `zh-CN` / `en-US`。
- 停止调用 `POST /agent/workbuddy/interrupt`，不再调用 `interruptCodexTurn`。

### Cursor

- 主区域只渲染 Cursor MCP 卡片：配置 JSON、`~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`、文档链接。
- 不渲染聊天时间线和输入框，不发送对话请求。
- 连接设置仍可从顶栏进入。

### 连接页

保留本机 Agent 地址、Token 和启动命令。保留 Cursor 卡片。增加一张其他 MCP 客户端卡片，JSON 与 Cursor 相同：

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

## 数据流

### 不再启动 Codex

- `local-agent-panel.tsx` 的 SSE `hello` 处理不再请求 `/agent/codex/threads/reset`。
- `startHttpServer` 监听成功后不再调用 `prepareExistingThread` 或 `prepareDraftThread`。
- Codex 的 HTTP 路由保留，侧边栏没有入口触发它们。

### WorkBuddy 一轮对话

同一时间只允许一轮。进行中的轮次用 `AbortController` 挂在服务进程内。

1. 侧边栏提交后进入等待。
2. `canvas-agent` 把文本 `POST` 到桌面端 `/openapi/v2/localassistant/message`，`msg_type` 为 `text`。
3. 按返回的 `message_id` 每 1500ms 轮询，最多 120 次（3 分钟）。
4. 助理文本按消息 ID 就地更新：内容变化时发 `agent_event` `item.updated`，同一 ID 不另起一条消息。
5. 助理通过 MCP 改画布时，沿用现有路径：`/api/tools` → SSE `tool_call` → 页面执行 → `/canvas/result`。
6. 结束条件由纯函数判断，见下文。结束时发 `item.completed` 与 `turn.completed`。
7. 侧边栏收到 `turn.completed` 或 `agent_error` 后，把 `waiting` 和 `sending` 设为 false。

进行中的轮次同时写入 `CanvasSession`。`openEvents` 发送的 `hello` 读取这份状态，避免只存在 HTTP 路由闭包里、重连时丢失。

`hello` 增加可选字段，协议版本保持 6：

```ts
providerRun?: { provider: "workbuddy"; busy: boolean; turnId: string } | null
```

重连后的 `hello` 若 `providerRun.busy === true`，侧边栏恢复等待，避免用户在旧轮询还在跑时再发一条。

### 轮询结束判断

导出纯函数 `(previous, current) => boolean`。快照是按 `message_id` 排序后的 `{ messageId, role, msgType, text }[]`。函数在两次传入的快照上判断，调用方不另传相等标记。

- 权限请求：`msg_type` 为 `permission` 或 `permission_request`。`requestId` 取 `metadata.requestId`，没有则用 `message_id`。
- 存在未回复的权限请求时，不结束。侧边栏展示该消息内容并等待确认。
- 确认后调用已有 `replyWorkbuddyPermission`，`msg_type` 为 `permission_response`，然后继续轮询。
- 取消权限等于停止本轮：中断轮询，不提交 `permission_response`。
- 至少已经出现一条 `role === "assistant"` 且 `msg_type === "text"` 的消息，并且连续两次轮询的快照相同、没有未回复权限时，结束。
- 第一条助理文本只更新界面，不结束本轮。
- 满 120 次仍未结束：发出超时说明和 `turn.completed`，解除等待，不再轮询。

### 停止与并发

- `POST /agent/workbuddy/interrupt` 中断当前轮询，发出 `turn.completed`，返回 `{ ok: true }`。没有进行中的轮次时返回 409。
- 已有一轮在跑时，再次 `POST /agent/workbuddy/turn` 返回 409，错误文案为「WorkBuddy 正在回复上一条消息」，不取消已有轮次。侧边栏若因此次 409 失败，保留原轮次的等待状态。

## 错误处理

| 场景 | 行为 |
| --- | --- |
| 本机 Agent 未连接 | 输入框不可用，不发送 |
| 未配置 WorkBuddy Token，或桌面端离线 / 发送失败 | 对话中显示原因，发出 `agent_error`，解除等待 |
| 轮询满 3 分钟 | 显示超时，发出 `turn.completed`，解除等待 |
| 用户点停止，或取消权限 | 中断轮询，解除等待；已经落到画布上的操作保留 |
| 权限回复失败或请求已失效 | 显示原因，解除等待，不自动重试 |
| 画布页面未打开或 Agent 未连接 | 工具调用返回「当前没有已连接画布」 |
| SSE 出错且此前已经连接成功 | 保持 EventSource 重连；不清除 `pendingTool`；进行中的 WorkBuddy 轮次保持 `waiting`。随后 `hello.providerRun.busy` 为 true 时继续等待 |
| SSE 出错且从未连接成功 | 沿用现有行为：关闭连接并停用 |
| 连接器探活 | `GET {baseUrl}/health`。该路由在鉴权之前，返回 `ok: true` 即视为在线 |

## 测试

用假的轮询响应和纯函数断言，不连接真实 WorkBuddy 或 Cursor。

`canvas-agent`：

- 导出轮询结束判断。第一条助理文本返回未结束；同一快照连续两次且无权限请求时结束；存在未回复权限时即使快照相同也不结束；权限回复后快照再稳定两次则结束。
- 导出探活 URL 函数，断言结果为 `{baseUrl}/health`，路径不是 `/api/session`。

`web`：

- 导出发送条件：`provider === "workbuddy"`、已连接、非 sending、非 waiting 时可以发送。`conversation.status === "preparing"` 和线程列表仍在加载时都可以发送。`provider === "cursor"` 时不可发送。
- 导出运行状态迁移：`turn.completed` 与 `agent_error` 都得到 `waiting: false` 且 `sending: false`。
- 导出 SSE 错误决策：此前已连接时保留进行中的工具调用和等待；从未连接成功时关闭。

手动验收留到实现完成后写入 `pending-test`：切换两个选项、WorkBuddy 发一条并看到等待解除、Cursor 卡片可复制 JSON、页面未连接时工具失败文案正确。

## 实现时同步的文档

- `CHANGELOG.md` 的 `Unreleased` 用一条 `[调整]` 说明侧边栏改为切换 WorkBuddy 对话与 Cursor 配置，外部助手继续通过 MCP 操作画布。
- `docs/content/docs/progress/pending-test.mdx` 与中文版记录上面的手动验收项。
- WorkBuddy 连接器文档补一句：侧边栏 WorkBuddy 对话与桌面端使用同一个助理。Cursor 连接器文档已说明对话在 Cursor 内进行，不必改通道描述。

## 主要改动位置

- `web/src/components/agent/local-agent-panel.tsx`：选项、发送门闩、停止、`hello` 不再重置 Codex、`turn.completed` / `agent_error` 解除等待、SSE 错误保留进行中的调用。
- `web/src/components/agent/agent-connect-view.tsx`：恢复 Token 卡片，增加通用 MCP 卡片；Cursor 模式复用 Cursor 卡片。
- `web/src/i18n/locales/zh-CN.ts` 与 `en-US.ts`：新增和恢复的连接文案。
- `canvas-agent/src/agent/workbuddy.ts`：轮询更新、结束判断、超时、中断。
- `canvas-agent/src/server/http.ts`：去掉启动时的 Codex 预热；增加 `/agent/workbuddy/interrupt`；拒绝重叠轮次；`hello` 携带 `providerRun`。
- `canvas-agent/src/server/mcp.ts`：探活改为 `/health`。
