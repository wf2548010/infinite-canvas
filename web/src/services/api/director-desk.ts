import { uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";

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
    mapSegmentExportsToShots,
    mediaReady,
    parseSegmentExportName,
    planDirectorUploads,
    resolveDirectorComfyui,
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
    const { baseUrl, token } = resolveDirectorComfyui(options.config);
    if (!baseUrl) throw new Error("请先在设置里填写 ComfyUI 地址。导演台使用全局配置里的 ComfyUI 地址。");
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
    const startedAt = Date.now() / 1000;
    options.onProgress?.("正在提交导演台");
    const jobId = await submitJob(workflow, baseUrl, token);
    options.onProgress?.("导演台生成中");
    const assetIds = await pollJob(jobId, baseUrl, token, options.signal, Date.now() + JOB_TIMEOUT_MS, collectVideoAssetIds, (status) => options.onProgress?.(status));
    if (!assetIds) throw new Error("导演台生成已取消。");

    const runShots = activeShots(options.project).filter((shot) => shot.run);
    const segmentFiles = await listDirectorSegmentExports(baseUrl, token, startedAt, options.signal);
    const mapped = mapSegmentExportsToShots(activeShots(options.project), segmentFiles);
    const segmentIds = runShots.flatMap((shot) => {
        const file = mapped.find((item) => item.id === shot.id)?.file;
        return file ? [`/view?filename=${encodeURIComponent(file.filename)}&type=output&subfolder=${encodeURIComponent(file.subfolder)}`] : [];
    });
    const usedSegments = segmentIds.length === runShots.length && runShots.length > 0;
    const outputIds = usedSegments ? segmentIds : assetIds;
    if (outputIds.length === 0) throw new Error("导演台没有返回成片。请确认 ComfyUI 已安装 MiniMax H3 Director 和 Video Helper Suite。");
    const videos = await Promise.all(outputIds.map((assetId) => downloadComfyuiVideo(assetId, baseUrl, token)));
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
    const dropped = !usedSegments && missing > 0
        ? "导演节点分段导出时只把最后一段留在工作流输出里，其余成片写在 ComfyUI 的 output/minimax_seg_export。请重启已更新的 MiniMax H3 Director 后再生成。"
        : "";
    return {
        ...options.project,
        busy: false,
        [key]: shots,
        receipt: missing
            ? `已回到时间轴 ${stored.length} 段。还有 ${missing} 段没有成片。${dropped}`
            : `已提交 ${titled}。成片按段回到时间轴。`,
    };
}

async function listDirectorSegmentExports(baseUrl: string, token: string | undefined, startedAt: number, signal?: AbortSignal) {
    try {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/minimax/director/latest_segment_exports?since=${encodeURIComponent(String(startedAt))}`, { headers, signal });
        if (!response.ok) return [];
        const body = await response.json() as { files?: Array<{ index?: unknown; filename?: unknown; subfolder?: unknown }> };
        return (body.files || []).flatMap((file) => {
            const filename = typeof file.filename === "string" ? file.filename : "";
            const index = typeof file.index === "number" ? file.index : parseSegmentExportName(filename);
            const subfolder = typeof file.subfolder === "string" ? file.subfolder : "";
            return index === null || !filename ? [] : [{ index, filename, subfolder }];
        });
    } catch {
        return [];
    }
}

function applyVideo(shot: DirectorShot, video?: { storageKey: string; url: string }): DirectorShot {
    if (!shot.run) return shot;
    if (!video) return { ...shot, status: "idle" };
    return { ...shot, status: "generated", videoStorageKey: video.storageKey, videoUrl: video.url };
}
