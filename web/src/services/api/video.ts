import i18n from "@/i18n";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { resolveModelChannel, type AiConfig } from "@/stores/use-config-store";
import { pollComfyuiVideoJob, requestComfyuiVideo, submitComfyuiVideoJob } from "./comfyui";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export type VideoRequestOptions = {
    signal?: AbortSignal;
    referenceVideos?: ReferenceVideo[];
    referenceAudios?: ReferenceAudio[];
    firstFrame?: ReferenceImage;
    lastFrame?: ReferenceImage;
    videoMode?: "omni" | "frame";
    model?: string;
    channelId?: string;
    workflowId?: string;
    seed?: number;
    jobId?: string;
    onProgress?: (status: string, detail?: { jobId?: string }) => void;
};

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "comfyui"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoRequestOptions): Promise<VideoGenerationResult> {
    const rawModel = options?.model || config.videoModel || config.model;
    const res = await requestComfyuiVideo({
        config,
        model: rawModel,
        prompt,
        references,
        referenceVideos: options?.referenceVideos,
        referenceAudios: options?.referenceAudios,
        firstFrame: options?.firstFrame,
        lastFrame: options?.lastFrame,
        videoMode: options?.videoMode || (config.videoMode === "frame" ? "frame" : "omni"),
        channelId: options?.channelId || config.channelId,
        workflowId: options?.workflowId || config.workflowId,
        seed: options?.seed,
        signal: options?.signal,
        jobId: options?.jobId,
        onProgress: options?.onProgress,
    });
    return { url: res.url, mimeType: res.mimeType };
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: VideoRequestOptions): Promise<VideoGenerationTask> {
    const rawModel = options?.model || config.videoModel || config.model;
    const { jobId } = await submitComfyuiVideoJob({
        config,
        model: rawModel,
        prompt,
        references,
        referenceVideos: options?.referenceVideos,
        referenceAudios: options?.referenceAudios,
        channelId: options?.channelId || config.channelId,
        workflowId: options?.workflowId || config.workflowId,
        seed: options?.seed,
        signal: options?.signal,
    });
    return { id: jobId, provider: "comfyui", model: rawModel || "ComfyUI Video" };
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: VideoRequestOptions): Promise<VideoGenerationTaskState> {
    const channel = resolveModelChannel(config, task.model || config.videoModel || config.model);
    const baseUrl = (channel.comfyuiProxyUrl || "").trim();
    const token = channel.comfyuiProxyToken;
    try {
        const result = await pollComfyuiVideoJob(task.id, baseUrl, token, options?.signal, options?.onProgress);
        return { status: "completed", result };
    } catch (error) {
        return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) return uploadMediaFile(result.url, "video");
    throw new Error(i18n.t("apiErrors.noPlayableVideo"));
}
