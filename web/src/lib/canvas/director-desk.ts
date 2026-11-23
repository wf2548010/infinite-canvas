export type DirectorMode = "r2v" | "fl2v";
export type DirectorAspect = "16:9" | "9:16";
export type DirectorMegapixel = "0.4" | "0.5" | "0.98";
export type DirectorSeconds = 5 | 10 | 15;

export type DirectorMedia = {
    id: string;
    name: string;
    storageKey?: string;
    url?: string;
};

export type DirectorShot = {
    id: string;
    title: string;
    prompt: string;
    seconds: DirectorSeconds;
    run: boolean;
    status: "idle" | "generated";
    continuity: boolean;
    extra?: DirectorMedia;
    start?: DirectorMedia;
    end?: DirectorMedia;
    videoStorageKey?: string;
    videoUrl?: string;
};

export type DirectorProject = {
    title: string;
    mode: DirectorMode;
    aspect: DirectorAspect;
    megapixel: DirectorMegapixel;
    commonPrompt: string;
    commonAssets: DirectorMedia[];
    selectedR2v: string;
    selectedFl2v: string;
    r2v: DirectorShot[];
    fl2v: DirectorShot[];
    receipt?: string;
    busy?: boolean;
};

export const DIRECTOR_FPS = 24;
export const DIRECTOR_CONTINUITY_FRAMES = 22;
export const DIRECTOR_TASK_LABEL: Record<DirectorMode, string> = {
    r2v: "r2v \u2014 参考主体生视频(Reference to Video)",
    fl2v: "fl2v \u2014 首尾帧生视频(First-Last Frame)",
};

export const DIRECTOR_SIZES: Record<DirectorMegapixel, Record<DirectorAspect, { width: number; height: number }>> = {
    "0.4": { "16:9": { width: 864, height: 480 }, "9:16": { width: 480, height: 864 } },
    "0.5": { "16:9": { width: 960, height: 544 }, "9:16": { width: 544, height: 960 } },
    "0.98": { "16:9": { width: 1344, height: 768 }, "9:16": { width: 768, height: 1344 } },
};

const UNET_BY_MODE: Record<DirectorMode, string> = {
    r2v: "minimax_h3_ref2va_pruned_fp8_scaled.safetensors",
    fl2v: "minimax_h3_fl2va_pruned_fp8_scaled.safetensors",
};

export function minimaxFrames(seconds: number, fps = DIRECTOR_FPS) {
    const n = Math.max(5, Math.round(Math.max(0.1, seconds) * Math.max(1, fps)));
    const rem = (5 - (n % 17) + 17) % 17;
    return n + rem;
}

export function directorSize(project: Pick<DirectorProject, "megapixel" | "aspect">) {
    return DIRECTOR_SIZES[project.megapixel][project.aspect];
}

export function createDirectorProject(): DirectorProject {
    return {
        title: "雨夜重逢",
        mode: "r2v",
        aspect: "16:9",
        megapixel: "0.5",
        commonPrompt: "林夏，黑色长风衣，短发。雨夜街道，湿沥青反光。人物与场景在各段保持一致。",
        commonAssets: [
            { id: "cast", name: "林夏" },
            { id: "street", name: "雨夜街道" },
        ],
        selectedR2v: "s2",
        selectedFl2v: "f2",
        r2v: [
            { id: "s1", title: "撑伞入画", prompt: "林夏撑黑伞从画面左侧走进雨夜街道，步伐平稳，镜头跟随。", seconds: 5, run: true, status: "idle", continuity: false },
            { id: "s2", title: "路灯下回头", prompt: "她停在路灯下，回头看向来路。雨丝穿过灯光，伞沿滴水。", seconds: 5, run: true, status: "idle", continuity: true, extra: { id: "lamp", name: "路灯" } },
            { id: "s3", title: "伞沿特写", prompt: "镜头推近伞沿，雨水沿伞骨滑落，背景街道虚化。", seconds: 5, run: false, status: "idle", continuity: true },
        ],
        fl2v: [
            { id: "f1", title: "走向路灯", prompt: "从门口走到路灯下，保持撑伞，动作连续。", seconds: 5, run: true, status: "idle", continuity: false, start: { id: "door", name: "门口" }, end: { id: "lamp-end", name: "路灯下" } },
            { id: "f2", title: "回头", prompt: "接上一段末尾，她在路灯下慢慢回头。", seconds: 5, run: true, status: "idle", continuity: true },
            { id: "f3", title: "伞沿", prompt: "从人物中景推到伞沿特写，雨继续落下。", seconds: 10, run: true, status: "idle", continuity: true, start: { id: "lamp-start", name: "路灯下" }, end: { id: "close", name: "伞沿" } },
        ],
    };
}

export function readDirectorProject(raw: unknown): DirectorProject {
    const base = createDirectorProject();
    if (!raw || typeof raw !== "object") return base;
    const value = raw as Partial<DirectorProject>;
    const mode = value.mode === "fl2v" ? "fl2v" : "r2v";
    const aspect = value.aspect === "9:16" ? "9:16" : "16:9";
    const megapixel = value.megapixel === "0.4" || value.megapixel === "0.98" ? value.megapixel : "0.5";
    return {
        ...base,
        ...value,
        title: value.title?.trim() || base.title,
        mode,
        aspect,
        megapixel,
        commonPrompt: typeof value.commonPrompt === "string" ? value.commonPrompt : base.commonPrompt,
        commonAssets: Array.isArray(value.commonAssets) ? value.commonAssets.slice(0, 3) : base.commonAssets,
        r2v: normalizeShots(value.r2v, base.r2v),
        fl2v: normalizeShots(value.fl2v, base.fl2v),
        selectedR2v: value.selectedR2v || base.selectedR2v,
        selectedFl2v: value.selectedFl2v || base.selectedFl2v,
    };
}

function normalizeShots(raw: DirectorShot[] | undefined, fallback: DirectorShot[]): DirectorShot[] {
    if (!Array.isArray(raw) || raw.length === 0) return fallback;
    return raw.map((shot, index) => ({
        id: shot.id || `shot-${index + 1}`,
        title: shot.title || `分镜 ${index + 1}`,
        prompt: shot.prompt || "",
        seconds: (shot.seconds === 10 || shot.seconds === 15 ? shot.seconds : 5) as DirectorSeconds,
        run: shot.run !== false,
        status: shot.status === "generated" ? "generated" as const : "idle" as const,
        continuity: index > 0 && Boolean(shot.continuity),
        extra: shot.extra,
        start: shot.start,
        end: shot.end,
        videoStorageKey: shot.videoStorageKey,
        videoUrl: shot.videoUrl,
    }));
}

export function activeShots(project: DirectorProject) {
    return project.mode === "r2v" ? project.r2v : project.fl2v;
}

export type DirectorRunClip = {
    id: string;
    title: string;
    prompt: string;
    url: string;
    storageKey: string;
    width: number;
    height: number;
};

/** 只取出这次勾选并已经写回成片的分段，供画布预览和资产使用。 */
export function directorRunClips(project: DirectorProject): DirectorRunClip[] {
    const size = directorSize(project);
    return activeShots(project).flatMap((shot) => {
        if (!shot.run || !shot.videoStorageKey || !shot.videoUrl) return [];
        return [{
            id: shot.id,
            title: shot.title || shot.id,
            prompt: shot.prompt,
            url: shot.videoUrl,
            storageKey: shot.videoStorageKey,
            width: size.width,
            height: size.height,
        }];
    });
}

const SEGMENT_EXPORT_NAME = /^seg_(\d{4})\.mp4$/i;

export function parseSegmentExportName(filename: string) {
    const match = SEGMENT_EXPORT_NAME.exec(filename);
    return match ? Number(match[1]) : null;
}

export function mapSegmentExportsToShots(shots: DirectorShot[], files: Array<{ index: number; filename: string; subfolder: string }>) {
    const byIndex = new Map<number, { filename: string; subfolder: string }>();
    for (const file of files) {
        if (!byIndex.has(file.index)) byIndex.set(file.index, { filename: file.filename, subfolder: file.subfolder });
    }
    return shots.map((shot, index) => ({ id: shot.id, run: shot.run, file: shot.run ? byIndex.get(index) : undefined }));
}

export function withDirectorRunSelection(project: DirectorProject, shotIds?: string[]) {
    if (!shotIds?.length) return project;
    const key = project.mode === "r2v" ? "r2v" : "fl2v";
    const known = new Set(project[key].map((shot) => shot.id));
    const missing = shotIds.find((id) => !known.has(id));
    if (missing) throw new Error(`找不到分段 ${missing}`);
    const selected = new Set(shotIds);
    return { ...project, receipt: "", [key]: project[key].map((shot) => ({ ...shot, run: selected.has(shot.id) })) };
}

export function selectedShot(project: DirectorProject) {
    const shots = activeShots(project);
    const id = project.mode === "r2v" ? project.selectedR2v : project.selectedFl2v;
    return shots.find((shot) => shot.id === id) || shots[0];
}

export function shotRanges(shots: DirectorShot[]) {
    let cursor = 0;
    return shots.map((shot) => {
        const start = cursor;
        cursor += shot.seconds;
        return { start, end: cursor };
    });
}

export function formatTimecode(seconds: number) {
    const whole = Math.max(0, Math.round(seconds));
    return `00:${String(whole).padStart(2, "0")}`;
}

export type DirectorComfyConfig = {
    channelId?: string;
    channels?: Array<{
        id: string;
        comfyuiProxyUrl?: string;
        comfyuiProxyToken?: string;
        baseUrl?: string;
        apiKey?: string;
    }>;
};

/** 导演台只连全局配置里当前生效的渠道，不跟视频模型所在渠道走。 */
export function resolveDirectorComfyui(config: DirectorComfyConfig) {
    const channels = config.channels || [];
    const selected = config.channelId ? channels.find((item) => item.id === config.channelId) : undefined;
    const channel = selected || channels[0];
    const token = (channel?.comfyuiProxyToken || channel?.apiKey || "").trim();
    return {
        baseUrl: (channel?.comfyuiProxyUrl || channel?.baseUrl || "").trim(),
        token: token || undefined,
    };
}

export function mediaReady(media?: DirectorMedia) {
    return Boolean(media?.storageKey || media?.url);
}

export type DirectorFileMap = {
    common: Array<string | undefined>;
    byShot: Record<string, { extra?: string; start?: string; end?: string }>;
};

export function buildDirectorTimeline(project: DirectorProject, files: DirectorFileMap) {
    const shots = activeShots(project);
    const runSelection = shots.flatMap((shot, index) => (shot.run ? [index] : []));
    if (runSelection.length === 0) throw new Error("请至少勾选一段再生成。");
    const size = directorSize(project);
    const frames = shots.map((shot) => minimaxFrames(shot.seconds));
    const totalFrames = frames.reduce((sum, count) => sum + count, 0);
    const continuityEnabled = shots.some((shot, index) => index > 0 && shot.continuity);
    const task = DIRECTOR_TASK_LABEL[project.mode];
    const output = {
        mode: "fixed",
        width: size.width,
        height: size.height,
        longEdge: Math.max(size.width, size.height),
        maxExportFrames: 0,
        exportMode: "segments",
        audioMode: "generate",
        refImageSize: "match",
        continuityEnabled,
        continuityOverlapFrames: continuityEnabled ? DIRECTOR_CONTINUITY_FRAMES : 0,
    };
    const base = {
        version: 4,
        editMode: "segment",
        timelineMode: project.mode === "fl2v" ? "fl2v" : "prompt_batch",
        frameRate: DIRECTOR_FPS,
        width: size.width,
        height: size.height,
        totalFrames,
        runSelectEnabled: true,
        runSelection,
        output,
    };
    if (project.mode === "fl2v") {
        return {
            ...base,
            global: { taskType: task, prompt: "", refs: [] },
            shots: shots.map((shot, index) => {
                const uploaded = files.byShot[shot.id] || {};
                const row: Record<string, unknown> = {
                    prompt: shot.prompt,
                    durationSec: shot.seconds,
                    continuityFromPrev: index > 0 && shot.continuity,
                };
                if (uploaded.start) row.startImage = { imageFile: uploaded.start };
                if (uploaded.end) row.endImage = { imageFile: uploaded.end };
                return row;
            }),
        };
    }
    return {
        ...base,
        global: {
            taskType: task,
            prompt: project.commonPrompt,
            commonEnabled: Boolean(project.commonPrompt.trim() || files.common.some(Boolean)),
            refs: files.common.flatMap((imageFile, index) => (imageFile ? [{ index, imageFile }] : [])),
            refAudios: [],
            refVideos: [],
        },
        segments: shots.map((shot, index) => {
            const extra = files.byShot[shot.id]?.extra;
            return {
                id: shot.id,
                prompt: shot.prompt,
                durationSec: shot.seconds,
                taskType: task,
                continuityFromPrev: index > 0 && shot.continuity,
                refs: extra ? [{ index: 3, imageFile: extra }] : [],
            };
        }),
    };
}

export function buildDirectorWorkflow(project: DirectorProject, timeline: unknown, seed: number) {
    const size = directorSize(project);
    const totalFrames = activeShots(project).reduce((sum, shot) => sum + minimaxFrames(shot.seconds), 0);
    return {
        "1": {
            class_type: "UNETLoader",
            inputs: { unet_name: UNET_BY_MODE[project.mode], weight_dtype: "default" },
            _meta: { title: "unet" },
        },
        "2": {
            class_type: "CLIPLoader",
            inputs: { clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", type: "minimax" },
            _meta: { title: "clip" },
        },
        "3": {
            class_type: "VAELoader",
            inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" },
            _meta: { title: "video_vae" },
        },
        "4": {
            class_type: "VAELoader",
            inputs: { vae_name: "minimax_h3_audio_vae_fp32.safetensors" },
            _meta: { title: "audio_vae" },
        },
        "5": {
            class_type: "MiniMaxH3Director",
            inputs: {
                model: ["1", 0],
                video_vae: ["3", 0],
                audio_vae: ["4", 0],
                clip: ["2", 0],
                task_type: DIRECTOR_TASK_LABEL[project.mode],
                global_prompt: project.mode === "r2v" ? project.commonPrompt : "",
                bd_grp_sample: "采样设置",
                cfg: 1,
                seed,
                frame_rate: DIRECTOR_FPS,
                width: size.width,
                height: size.height,
                ref_max_size: Math.max(size.width, size.height),
                total_frames: totalFrames,
                timeline_data: JSON.stringify(timeline),
                steps: 25,
                sampler: "res_multistep",
                scheduler: "simple",
                shift_video: 12,
                shift_audio: 3,
                clear_vram_between_segments: true,
            },
            _meta: { title: "director" },
        },
        "6": {
            class_type: "VHS_VideoCombine",
            inputs: {
                frame_rate: DIRECTOR_FPS,
                loop_count: 0,
                filename_prefix: "video/Director",
                format: "video/h264-mp4",
                pix_fmt: "yuv420p",
                crf: 19,
                save_metadata: true,
                trim_to_audio: false,
                pingpong: false,
                save_output: true,
                images: ["5", 0],
                audio: ["5", 1],
            },
            _meta: { title: "output_video" },
        },
    };
}

export function patchDirectorShot(project: DirectorProject, id: string, partial: Partial<DirectorShot>): DirectorProject {
    const key = project.mode === "r2v" ? "r2v" : "fl2v";
    return { ...project, receipt: "", [key]: project[key].map((shot) => (shot.id === id ? { ...shot, ...partial } : shot)) };
}

export function selectDirectorShot(project: DirectorProject, id: string): DirectorProject {
    return project.mode === "r2v" ? { ...project, selectedR2v: id } : { ...project, selectedFl2v: id };
}

export function addDirectorShot(project: DirectorProject): DirectorProject {
    const key = project.mode === "r2v" ? "r2v" : "fl2v";
    const shots = project[key];
    const id = `shot-${shots.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    const shot: DirectorShot = {
        id,
        title: `分镜 ${String(shots.length + 1).padStart(2, "0")}`,
        prompt: "",
        seconds: 5,
        run: true,
        status: "idle",
        continuity: shots.length > 0,
    };
    const next = { ...project, receipt: "", [key]: [...shots, shot] };
    return selectDirectorShot(next, id);
}

function mediaKey(media: DirectorMedia) {
    return media.storageKey || media.url || "";
}

function fillEmptySlots(assets: DirectorMedia[], linked: DirectorMedia[]) {
    const next = assets.map((asset) => ({ ...asset }));
    const spare = linked.filter(mediaReady);
    let cursor = 0;
    for (const slot of next) {
        if (mediaReady(slot)) continue;
        const link = spare[cursor++];
        if (!link) break;
        slot.storageKey = link.storageKey;
        slot.url = link.url;
    }
    return next;
}

export function planDirectorUploads(project: DirectorProject, linked: DirectorMedia[] = []) {
    const common = project.mode === "r2v" ? fillEmptySlots(project.commonAssets, linked) : [];
    const used = new Set(common.filter(mediaReady).map(mediaKey));
    const spare = linked.filter((item) => mediaReady(item) && !used.has(mediaKey(item)));
    let cursor = 0;
    const shots = activeShots(project).map((shot, index) => {
        if (project.mode === "r2v") return { id: shot.id, extra: mediaReady(shot.extra) ? shot.extra : undefined };
        const borrowStart = index > 0 && shot.continuity && !mediaReady(shot.start);
        const start = mediaReady(shot.start) ? shot.start : borrowStart ? undefined : spare[cursor++];
        const end = mediaReady(shot.end) ? shot.end : spare[cursor++];
        return { id: shot.id, start, end };
    });
    return { common, shots };
}

export function removeDirectorShot(project: DirectorProject, id: string): DirectorProject {
    const key = project.mode === "r2v" ? "r2v" : "fl2v";
    const shots = project[key];
    if (shots.length <= 1) return project;
    const nextShots = shots.filter((shot) => shot.id !== id).map((shot, index) => ({ ...shot, continuity: index > 0 && shot.continuity }));
    const selected = project.mode === "r2v" ? project.selectedR2v : project.selectedFl2v;
    const next = { ...project, receipt: "", [key]: nextShots };
    return selected === id ? selectDirectorShot(next, nextShots[0].id) : next;
}
