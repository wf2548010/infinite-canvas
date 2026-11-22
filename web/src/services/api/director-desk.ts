import { uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveModelChannel, type AiConfig } from "@/stores/use-config-store";

import {
    JOB_TIMEOUT_MS,
    collectVideoAssetIds,
    downloadComfyuiVideo,
    generateRandomSeed,
    pollJob,
    submitJob,
    uploadComfyuiAsset,
} from "./comfyui";
import {
    activeShots,
    buildDirectorTimeline,
    buildDirectorWorkflow,
    mediaReady,
    planDirectorUploads,
    type DirectorFileMap,
    type DirectorMedia,
    type DirectorProject,
    type DirectorShot,
} from "@/lib/canvas/director-desk";

async function uploadDirectorMedia(baseUrl: string, token: string | undefined, media: DirectorMedia | undefined, filename: string, signal?: AbortSignal) {
    if (!media || !mediaReady(media)) return undefined;
    const url = await resolveImageUrl(media.storageKey, media.url || "");
    if (!url) throw new Error(`素材「${media.name || filename}」读不到文件，请重新挂上后再生成。`);
    return uploadComfyuiAsset(baseUrl, token, url, filename, signal);
}

export async function runDirectorProject(options: {
    config: AiConfig;
    project: DirectorProject;
    linked?: DirectorMedia[];
    signal?: AbortSignal;
    onProgress?: (text: string) => void;
}): Promise<DirectorProject> {
    const channel = resolveModelChannel(options.config, options.config.videoModel || options.config.model || "");
    const baseUrl = (channel.comfyuiProxyUrl || "").trim();
    if (!baseUrl) throw new Error("请先在设置里填写 ComfyUI 地址。导演台会把勾选的分段交给本机 MiniMax H3 Director。");
    const token = channel.comfyuiProxyToken;
    const planned = planDirectorUploads(options.project, options.linked || []);
    options.onProgress?.("正在上传素材");

    const common: Array<string | undefined> = [];
    for (let index = 0; index < planned.common.length; index += 1) {
        common.push(await uploadDirectorMedia(baseUrl, token, planned.common[index], `picture_${index + 1}.png`, options.signal));
    }
    const byShot: DirectorFileMap["byShot"] = {};
    for (const shot of planned.shots) {
        byShot[shot.id] = {
            extra: await uploadDirectorMedia(baseUrl, token, shot.extra, `${shot.id}_extra.png`, options.signal),
            start: await uploadDirectorMedia(baseUrl, token, shot.start, `${shot.id}_start.png`, options.signal),
            end: await uploadDirectorMedia(baseUrl, token, shot.end, `${shot.id}_end.png`, options.signal),
        };
    }

    const timeline = buildDirectorTimeline(options.project, { common, byShot });
    const seed = generateRandomSeed() % 1_000_000_000;
    const workflow = buildDirectorWorkflow(options.project, timeline, seed);
    options.onProgress?.("正在提交导演台");
    const jobId = await submitJob(workflow, baseUrl, token);
    options.onProgress?.("导演台生成中");
    const assetIds = await pollJob(jobId, baseUrl, token, options.signal, Date.now() + JOB_TIMEOUT_MS, collectVideoAssetIds, (status) => options.onProgress?.(status));
    if (!assetIds) throw new Error("导演台生成已取消。");
    if (assetIds.length === 0) throw new Error("导演台没有返回成片。请确认 ComfyUI 已安装 MiniMax H3 Director 和 Video Helper Suite。");

    const runShots = activeShots(options.project).filter((shot) => shot.run);
    const videos = await Promise.all(assetIds.map((assetId) => downloadComfyuiVideo(assetId, baseUrl, token)));
    const stored = await Promise.all(videos.map((video) => uploadMediaFile(video.dataUrl, "director")));
    const byId = new Map<string, { storageKey: string; url: string }>();
    runShots.forEach((shot, index) => {
        const file = stored[index];
        if (file) byId.set(shot.id, { storageKey: file.storageKey, url: file.url });
    });
    const key = options.project.mode === "r2v" ? "r2v" : "fl2v";
    const shots = options.project[key].map((shot) => applyVideo(shot, byId.get(shot.id)));
    const titled = runShots.map((shot) => shot.title).filter(Boolean).join("、");
    const missing = Math.max(0, runShots.length - stored.length);
    return {
        ...options.project,
        busy: false,
        [key]: shots,
        receipt: missing
            ? `已回到时间轴 ${stored.length} 段。还有 ${missing} 段没有成片。`
            : `已提交 ${titled}。成片按段回到时间轴。`,
    };
}

function applyVideo(shot: DirectorShot, video?: { storageKey: string; url: string }): DirectorShot {
    if (!shot.run) return shot;
    if (!video) return { ...shot, status: "idle" };
    return { ...shot, status: "generated", videoStorageKey: video.storageKey, videoUrl: video.url };
}
