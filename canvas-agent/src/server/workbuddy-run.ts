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