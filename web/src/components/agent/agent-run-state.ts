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