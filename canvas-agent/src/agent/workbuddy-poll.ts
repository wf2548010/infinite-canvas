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