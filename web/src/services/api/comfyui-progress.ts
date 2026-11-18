export type ComfyuiSamplingProgress = {
    progressPct: number;
    value: number;
    max: number;
};

export type ComfyProgressSocket = {
    onmessage: ((event: { data: unknown }) => void) | null;
    close: () => void;
};

export function readComfyuiProgressEvent(payload: unknown): ComfyuiSamplingProgress | null {
    const message = typeof payload === "string" ? parseJson(payload) : payload;
    if (!message || typeof message !== "object") return null;
    const record = message as { type?: unknown; data?: unknown };
    if (record.type === "progress") return normalizeProgress(record.data);
    if (record.type === "progress_state") return readRunningProgress(record.data);
    return null;
}

export function comfyuiProgressSocketUrl(baseUrl: string, clientId: string, token?: string): string {
    const wsBase = baseUrl.trim().replace(/\/+$/, "").replace(/^http/i, "ws");
    const params = new URLSearchParams({ clientId });
    if (token) params.set("token", token);
    return `${wsBase}/ws?${params}`;
}

export function watchComfyuiJobProgress(options: {
    baseUrl: string;
    clientId: string;
    token?: string;
    signal?: AbortSignal;
    onProgress?: (status: string, detail?: ComfyuiSamplingProgress) => void;
    connect?: (url: string) => ComfyProgressSocket;
}): () => void {
    if (options.signal?.aborted) return () => undefined;
    const connect = options.connect ?? ((url: string) => new WebSocket(url) as unknown as ComfyProgressSocket);
    const socket = connect(comfyuiProgressSocketUrl(options.baseUrl, options.clientId, options.token));
    socket.onmessage = (event) => {
        const progress = readComfyuiProgressEvent(event.data);
        if (!progress) return;
        options.onProgress?.("running", progress);
    };
    const stop = () => {
        socket.onmessage = null;
        try {
            socket.close();
        } catch {
            // The socket may already be closed when polling finishes.
        }
    };
    options.signal?.addEventListener("abort", stop, { once: true });
    return () => {
        options.signal?.removeEventListener("abort", stop);
        stop();
    };
}

function readRunningProgress(data: unknown): ComfyuiSamplingProgress | null {
    const nodes = data && typeof data === "object" ? (data as { nodes?: Record<string, unknown> }).nodes : undefined;
    if (!nodes) return null;
    const running = Object.values(nodes)
        .map((node) => {
            if (!node || typeof node !== "object" || (node as { state?: unknown }).state !== "running") return null;
            return normalizeProgress(node);
        })
        .filter((item): item is ComfyuiSamplingProgress => Boolean(item));
    if (!running.length) return null;
    return running.sort((left, right) => right.max - left.max)[0];
}

function normalizeProgress(data: unknown): ComfyuiSamplingProgress | null {
    if (!data || typeof data !== "object") return null;
    const value = (data as { value?: unknown }).value;
    const max = (data as { max?: unknown }).max;
    if (typeof value !== "number" || !Number.isFinite(value) || typeof max !== "number" || !Number.isFinite(max) || max <= 0) return null;
    return { progressPct: Math.max(0, Math.min(100, Math.round((value / max) * 100))), value, max };
}

function parseJson(payload: string): unknown {
    try {
        return JSON.parse(payload);
    } catch {
        return null;
    }
}
