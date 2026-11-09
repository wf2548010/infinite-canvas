import { audioMimeType } from "@/lib/audio-generation";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { requestComfyuiAudio, type ComfyuiAudioRequest } from "./comfyui";

export type AudioRequestOptions = {
    signal?: AbortSignal;
    jobId?: string;
    onProgress?: ComfyuiAudioRequest["onProgress"];
    duration?: number;
    seed?: number;
    channelId?: string;
    workflowId?: string;
    model?: string;
};

export async function requestAudioGeneration(
    config: AiConfig,
    prompt: string,
    options?: AudioRequestOptions,
): Promise<{ blob: Blob; seed: number; jobId: string }> {
    const res = await requestComfyuiAudio({
        config,
        prompt,
        model: options?.model,
        channelId: options?.channelId,
        duration: options?.duration,
        seed: options?.seed,
        workflowId: options?.workflowId,
        signal: options?.signal,
        jobId: options?.jobId,
        onProgress: options?.onProgress,
    });
    return { blob: res.blob, seed: res.seed, jobId: res.jobId };
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
    const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
    return uploadMediaFile(audio, "audio");
}
