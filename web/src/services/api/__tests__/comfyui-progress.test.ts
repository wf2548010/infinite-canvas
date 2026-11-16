import { afterEach, describe, expect, it, vi } from "vitest";

import { readComfyuiProgressEvent, watchComfyuiJobProgress } from "@/services/api/comfyui-progress";
import { requestComfyuiVideo, resetComfyuiBatchPollers } from "@/services/api/comfyui";
import type { ComfyuiWorkflowJson } from "@/services/api/comfyui";
import { defaultConfig, type AiConfig, type ModelChannel } from "@/stores/use-config-store";

describe("readComfyuiProgressEvent", () => {
    it("reads a sampler progress message as a percentage and step count", () => {
        expect(readComfyuiProgressEvent({ type: "progress", data: { value: 3, max: 10, prompt_id: "job_1", node: "12" } })).toEqual({
            progressPct: 30,
            value: 3,
            max: 10,
        });
    });

    it("reads the running node from a progress_state snapshot", () => {
        expect(
            readComfyuiProgressEvent({
                type: "progress_state",
                data: {
                    nodes: {
                        "3": { value: 10, max: 10, state: "finished" },
                        "8": { value: 4, max: 20, state: "running" },
                    },
                },
            }),
        ).toEqual({ progressPct: 20, value: 4, max: 20 });
    });

    it("ignores unrelated messages and progress without a positive max", () => {
        expect(readComfyuiProgressEvent({ type: "executing", data: { node: "1" } })).toBeNull();
        expect(readComfyuiProgressEvent({ type: "progress", data: { value: 1, max: 0 } })).toBeNull();
        expect(readComfyuiProgressEvent("not-json")).toBeNull();
    });
});

describe("watchComfyuiJobProgress", () => {
    it("connects with the submit client id and forwards sampling progress", () => {
        const sockets: FakeSocket[] = [];
        const onProgress = vi.fn();
        const stop = watchComfyuiJobProgress({
            baseUrl: "http://10.7.8.12:8188/",
            clientId: "client-a",
            token: "tok",
            onProgress,
            connect: (url) => {
                const socket = new FakeSocket(url);
                sockets.push(socket);
                return socket;
            },
        });

        expect(sockets[0]?.url).toBe("ws://10.7.8.12:8188/ws?clientId=client-a&token=tok");
        sockets[0]?.emit({ type: "progress", data: { value: 3, max: 10 } });
        expect(onProgress).toHaveBeenCalledWith("running", { progressPct: 30, value: 3, max: 10 });
        stop();
        expect(sockets[0]?.closed).toBe(true);
    });
});

describe("requestComfyuiVideo progress", () => {
    afterEach(() => {
        resetComfyuiBatchPollers();
        vi.unstubAllGlobals();
    });

    it("opens the progress socket with the same client id used to submit, before the prompt returns", async () => {
        const sockets: FakeSocket[] = [];
        vi.stubGlobal("WebSocket", class extends FakeSocket {
            constructor(url: string) {
                super(url);
                sockets.push(this);
            }
        });
        const onProgress = vi.fn();
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if ((init?.method || "GET") === "POST" && url.endsWith("/prompt")) {
                sockets[0]?.emit({ type: "progress", data: { value: 3, max: 10, prompt_id: "job_video" } });
                return { ok: true, status: 200, json: async () => ({ prompt_id: "job_video" }) };
            }
            if (url.includes("/queue")) return { ok: true, status: 200, json: async () => ({ queue_running: [], queue_pending: [] }) };
            if (url.includes("/history/job_video")) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        job_video: {
                            status: { status_str: "success", completed: true },
                            outputs: { "4": { videos: [{ filename: "out.mp4", subfolder: "", type: "output" }] } },
                        },
                    }),
                };
            }
            if (url.includes("/view")) return { ok: true, status: 200, blob: async () => new Blob(["video"], { type: "video/mp4" }) };
            return { ok: true, status: 200, json: async () => ({}) };
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await requestComfyuiVideo({
            config: videoConfig(),
            prompt: "一段动画",
            model: "omni-video-minimax-h3-fp8-4step-pdmd",
            videoMode: "omni",
            onProgress,
        });

        expect(result.jobId).toBe("job_video");
        const promptBody = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).endsWith("/prompt"))?.[1]?.body)) as { client_id: string };
        expect(sockets[0]?.url).toContain(`clientId=${promptBody.client_id}`);
        expect(onProgress).toHaveBeenCalledWith("running", { progressPct: 30, value: 3, max: 10 });
        expect(sockets[0]?.closed).toBe(true);
    });
});

class FakeSocket {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    closed = false;
    constructor(readonly url: string) {}
    emit(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }
    close() {
        this.closed = true;
    }
}

function videoConfig(): AiConfig {
    const workflow: ComfyuiWorkflowJson = {
        "1": { inputs: { text: "" }, class_type: "PrimitiveStringMultiline", _meta: { title: "prompt" } },
    };
    const channel: ModelChannel = {
        id: "comfy",
        name: "ComfyUI channel",
        baseUrl: "",
        apiKey: "",
        apiFormat: "comfyui",
        models: [{ name: "ComfyUI Video", capability: "video", comfyuiWorkflow: { name: "omni", json: workflow, createdAt: 0 } }],
        comfyuiProxyUrl: "http://10.7.8.12:8188",
        comfyuiProxyToken: "tok",
    };
    return {
        ...defaultConfig,
        size: "1280x736",
        channels: [channel],
        model: "omni-video-minimax-h3-fp8-4step-pdmd",
        videoModel: "omni-video-minimax-h3-fp8-4step-pdmd",
    };
}
