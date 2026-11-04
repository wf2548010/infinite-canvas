# Cursor 连接器设计

日期：2026-11-05  
分支：`pre/1.1.0`  
状态：待用户审阅规格后进入实现计划

## 背景与目标

Infinite Canvas 已通过本地 `@zhuyichuan/canvas-agent` 的 MCP，支持 WorkBuddy / Codex / Claude Code 操作画布。用户希望 **Cursor Agent 也能通过 MCP 读写与操作当前画布**，并在画布侧提供安装指引。

成功标准：

1. 用户可按文档将 `infinite-canvas` MCP 配进 Cursor（全局或项目级）。
2. Cursor 对话能调用现有画布 MCP 工具（如 `canvas_get_state`、`canvas_open`、生成与排版类工具）。
3. 画布右侧 Agent「连接」页有 Cursor 配置卡片（复制 MCP JSON、路径提示、文档链接）。
4. 不改造 Cursor 与网页侧边栏的对话通道；不改 `canvas-agent` 内核协议。

## 非目标

- 网页侧边栏直接「用 Cursor 聊天」或检测 Cursor 在线状态。
- 修改 `canvas-agent` 为 Cursor 专属协议 / deeplink。
- 强制在仓库根目录提交 `.cursor/mcp.json`（仅提供示例与复制指引）。
- 上架 Cursor Marketplace（可后续迭代）。

## 架构

```text
Cursor Agent
    │  stdio MCP（用户 mcp.json）
    ▼
npx -y @zhuyichuan/canvas-agent mcp
    │  本机 HTTP + token（默认 127.0.0.1:17371）
    ▼
浏览器中已打开并已连接 Agent 的无限画布
```

原则：复用现有 MCP 工具集与 WorkBuddy 连接器模式；Cursor 只作为又一 MCP 客户端。

前置条件（文档与 UI 需写明）：

- 本机可运行 Node（建议 20+），能执行 `npx`。
- 浏览器已打开目标画布，且本地 Canvas Agent 已连接（或由 MCP 进程按现有逻辑拉起守护）。
- Cursor 已启用该 MCP 服务（保存配置后按 Cursor 习惯刷新/重启 MCP）。

## 交付物

### 1. `plugins/cursor-connector/`

| 文件 | 用途 |
| --- | --- |
| `README.md` | 安装、验证、FAQ |
| `mcp.json` | 可复制到 Cursor 的 MCP 配置 |
| `mcp.project.example.json` | 标明可复制为项目 `.cursor/mcp.json` 的同内容示例 |
| `skills/canvas/SKILL.md` | 给 Cursor Agent 的操作说明（基于 WorkBuddy skill，去掉 WorkBuddy 专属表述） |

`mcp.json` 约定：

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

用户可将该段合并进：

- 全局：`~/.cursor/mcp.json`
- 或任意项目：`.cursor/mcp.json`

本仓库默认 **不** 提交根目录 `.cursor/mcp.json`；README 说明开发者可自行复制示例启用。

### 2. 文档站

- 新增：`docs/content/docs/overview/cursor-connector.zh-CN.mdx`、`cursor-connector.mdx`
- 导航：`docs/content/docs/overview/meta.zh-CN.json`、`meta.json` 增加条目
- `features` 中英文档各加一句 Cursor MCP 能力说明并链到上述页面

文档结构：

1. 简介与架构示意（简短）
2. 前置条件
3. 配置步骤（全局 / 项目级）
4. 验证话术示例
5. 与 WorkBuddy 连接器的关系（共用 `canvas-agent` MCP）
6. 常见问题

### 3. 画布连接页 UI

文件：`web/src/components/agent/agent-connect-view.tsx`

在「启动本地 Agent」卡片下方新增 Cursor 卡片：

- 标题 / 简述（i18n）
- **复制 MCP JSON**
- 提示配置路径：`~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`
- 文档链接（与现有文档站 WorkBuddy 页同一套链接策略）

i18n：在 `web/src/i18n/locales/zh-CN.ts` 与 `en-US.ts` 增加 `agent.connect.cursor*` 键。

不做：Cursor 在线检测、OAuth、改聊天发送路径。

## 错误处理与用户可见失败

| 场景 | 期望 |
| --- | --- |
| 未开画布 / Agent 未连 | Cursor 调工具失败；文档 FAQ 说明需先打开画布并连接 |
| `npx` 拉包失败 | README/FAQ 给出网络与镜像建议 |
| MCP 未启用 | 文档说明在 Cursor Customize / MCP 中启用并刷新 |

## 测试计划

1. 按文档配置 MCP 后，Cursor 工具列表出现 `infinite-canvas` 相关工具。
2. 画布已连接 Agent 时，Cursor 执行「读取当前画布状态」能返回节点摘要。
3. 连接页「复制 MCP JSON」内容与 `plugins/cursor-connector/mcp.json` 一致。
4. 中英文切换下 Cursor 卡片文案正常。
5. 不回归：现有本地 Agent 连接 / 启动命令复制仍可用。

## 实现顺序

1. 落地 `plugins/cursor-connector/` 文件
2. 文档站页面与导航 / features 链接
3. `AgentConnectView` + i18n
4. 手动按测试计划验证

## 开放决定（已拍板）

- 范围：接入包 + 文档 + 连接页指引（用户选项 2）
- 做法：镜像 WorkBuddy 连接器（方案 A）
- 不提交仓库根 `.cursor/mcp.json`
