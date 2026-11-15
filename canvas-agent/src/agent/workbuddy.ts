import crypto from "node:crypto";

import { getWorkbuddyConfig, loadConfig, saveConfig, type CanvasAgentConfig, type WorkbuddyConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import {
    shouldFinishWorkbuddyPoll,
    visibleWorkbuddyMessages,
    workbuddyPermissionRequestId,
    type WorkbuddyPollMessage,
} from "./workbuddy-poll.js";
import type { AgentEmit } from "./types.js";

const repliedPermissionIds = new Set<string>();
const announcedPermissionIds = new Set<string>();

export function resetWorkbuddyTurnState() {
    repliedPermissionIds.clear();
    announcedPermissionIds.clear();
}

export function acknowledgeWorkbuddyPermission(requestId: string) {
    if (requestId) repliedPermissionIds.add(requestId);
}

function toPollMessage(message: WorkbuddyMessage): WorkbuddyPollMessage {
    return {
        messageId: message.message_id,
        role: message.role,
        msgType: message.msg_type,
        text: (message.content || []).join("\n"),
        requestId: workbuddyPermissionRequestId({
            messageId: message.message_id,
            metadata: message.metadata as { requestId?: string } | undefined,
        }),
    };
}

type WorkbuddyMessage = {
    message_id: string;
    role: "user" | "assistant";
    content: string[];
    msg_type: string;
    created_at: string;
    attachments?: unknown[];
    metadata?: Record<string, unknown>;
};

type WorkbuddyStatusResponse = {
    code: number;
    msg: string;
    data?: { online: boolean };
};

type WorkbuddySendMessageResponse = {
    code: number;
    msg: string;
    data?: { message_id: string };
};

type WorkbuddyMessagesResponse = {
    code: number;
    msg: string;
    data?: { messages: WorkbuddyMessage[] };
};

/** 检测当前 WorkBuddy PC 桌面端本地助理是否在线。 */
export async function checkWorkbuddyStatus(config?: CanvasAgentConfig) {
    const currentConfig = config || loadConfig(true);
    const { accessToken, baseUrl } = getWorkbuddyConfig(currentConfig);
    if (!accessToken) return { ok: false, online: false, error: "未配置 WorkBuddy Access Token" };

    try {
        const res = await fetch(`${baseUrl}/openapi/v2/localassistant`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(5000),
        });
        const body = (await res.json()) as WorkbuddyStatusResponse;
        if (body.code !== 0) return { ok: false, online: false, error: body.msg || "查询失败" };
        return { ok: true, online: Boolean(body.data?.online) };
    } catch (error) {
        logger.error("WorkBuddy status check failed", { error });
        return { ok: false, online: false, error: error instanceof Error ? error.message : "连接超时" };
    }
}

/** 保存 WorkBuddy 相关配置至用户配置目录。 */
export function updateWorkbuddyConfig(patch: Partial<WorkbuddyConfig>) {
    const config = loadConfig(true);
    config.workbuddy = { ...(config.workbuddy || {}), ...patch };
    saveConfig(config);
    return getWorkbuddyConfig(config);
}

/** 执行一次 WorkBuddy 本地助理对话任务。 */
export async function runWorkbuddyTurn(
    prompt: string,
    emit: AgentEmit,
    options: {
        threadId?: string;
        sourceClientId?: string;
        turnId?: string;
        signal?: AbortSignal;
        intervalMs?: number;
        maxPolls?: number;
        accessToken?: string;
        baseUrl?: string;
    } = {},
) {
    const config = loadConfig(true);
    const accessToken = options.accessToken || getWorkbuddyConfig(config).accessToken;
    const baseUrl = options.baseUrl || getWorkbuddyConfig(config).baseUrl;
    const threadId = options.threadId || config.workspace?.activeThreadId || "workbuddy-session";
    const turnId = options.turnId || `wb-turn-${crypto.randomUUID().slice(0, 8)}`;

    if (!accessToken) {
        emit("agent_error", { message: "请先在 Agent 设置中配置 WorkBuddy Access Token。" });
        return;
    }

    resetWorkbuddyTurnState();

    emit("agent_event", {
        agent: "workbuddy",
        type: "turn.started",
        threadId,
        turnId,
        sourceClientId: options.sourceClientId,
    });

    try {
        const sendRes = await fetch(`${baseUrl}/openapi/v2/localassistant/message`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                content: prompt,
                msg_type: "text",
            }),
            signal: AbortSignal.timeout(10000),
        });

        const sendBody = (await sendRes.json()) as WorkbuddySendMessageResponse;
        if (sendBody.code !== 0 || !sendBody.data?.message_id) {
            throw new Error(sendBody.msg || "向 WorkBuddy 助理发送消息失败");
        }

        const initialMessageId = sendBody.data.message_id;
        logger.info("WorkBuddy message sent", { messageId: initialMessageId, threadId, turnId });

        const intervalMs = options.intervalMs ?? 1500;
        const maxPolls = options.maxPolls ?? 120;
        let previous: WorkbuddyPollMessage[] = [];
        let latestText = new Map<string, string>();
        let finished = false;

        for (let i = 0; i < maxPolls; i++) {
            if (options.signal?.aborted) break;
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
            if (options.signal?.aborted) break;

            let pollBody: WorkbuddyMessagesResponse;
            try {
                const pollRes = await fetch(
                    `${baseUrl}/openapi/v2/localassistant/message?message_id=${encodeURIComponent(initialMessageId)}`,
                    {
                        method: "GET",
                        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
                        signal: AbortSignal.timeout(5000),
                    },
                );
                pollBody = (await pollRes.json()) as WorkbuddyMessagesResponse;
            } catch (pollError) {
                if (pollError instanceof Error && pollError.name === "AbortError") {
                    emit("agent_event", { agent: "workbuddy", type: "turn.completed", threadId, turnId });
                    emit("agent_done", { agent: "workbuddy", code: 0 });
                    return;
                }
                throw pollError;
            }

            const raw = pollBody.code === 0 ? pollBody.data?.messages || [] : [];
            const visible = visibleWorkbuddyMessages(raw.map(toPollMessage), repliedPermissionIds);
            for (const message of visible) {
                if (message.msgType === "permission" || message.msgType === "permission_request") {
                    if (!announcedPermissionIds.has(message.requestId)) {
                        announcedPermissionIds.add(message.requestId);
                        emit("agent_event", {
                            agent: "workbuddy",
                            type: "permission.requested",
                            threadId,
                            turnId,
                            requestId: message.requestId,
                            text: message.text,
                        });
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
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            emit("agent_event", { agent: "workbuddy", type: "turn.completed", threadId, turnId });
            emit("agent_done", { agent: "workbuddy", code: 0 });
            return;
        }
        const text = error instanceof Error ? error.message : String(error);
        logger.error("WorkBuddy turn execution failed", { error: text });
        emit("agent_error", { message: text });
        emit("agent_event", {
            agent: "workbuddy",
            type: "turn.completed",
            threadId,
            turnId,
        });
        emit("agent_done", { agent: "workbuddy", code: 1 });
    }
}

/** 回复 WorkBuddy 助理的权限审批或问卷选择。 */
export async function replyWorkbuddyPermission(requestId: string, answers: Record<string, unknown>) {
    const config = loadConfig(true);
    const { accessToken, baseUrl } = getWorkbuddyConfig(config);
    if (!accessToken) throw new Error("未配置 WorkBuddy Access Token");

    const res = await fetch(`${baseUrl}/openapi/v2/localassistant/message`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            content: JSON.stringify({
                outcome: "selected",
                requestId,
                answers,
            }),
            msg_type: "permission_response",
        }),
    });

    const body = (await res.json()) as WorkbuddySendMessageResponse;
    if (body.code !== 0) throw new Error(body.msg || "提交审批回复失败");
    return { ok: true, messageId: body.data?.message_id };
}
