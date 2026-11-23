import { describe, expect, it } from "vitest";

import {
    activeShots,
    addDirectorShot,
    buildDirectorTimeline,
    buildDirectorWorkflow,
    createDirectorProject,
    directorRunClips,
    directorSize,
    mapSegmentExportsToShots,
    minimaxFrames,
    parseSegmentExportName,
    planDirectorUploads,
    readDirectorProject,
    resolveDirectorComfyui,
    withDirectorRunSelection,
} from "@/lib/canvas/director-desk";

describe("director desk timeline", () => {
    it("snaps durations onto the MiniMax 17k+5 frame grid", () => {
        expect(minimaxFrames(5)).toBe(124);
        expect(minimaxFrames(10)).toBe(243);
        expect(minimaxFrames(15)).toBe(362);
    });

    it("uses the hardware size pair for the selected aspect", () => {
        expect(directorSize({ megapixel: "0.5", aspect: "16:9" })).toEqual({ width: 960, height: 544 });
        expect(directorSize({ megapixel: "0.98", aspect: "9:16" })).toEqual({ width: 768, height: 1344 });
    });

    it("builds an r2v timeline that runs only the checked shots", () => {
        const project = createDirectorProject();
        const timeline = buildDirectorTimeline(project, {
            common: ["cast.png", undefined],
            byShot: { s2: { extra: "lamp.png" } },
        }) as {
            runSelection: number[];
            global: { commonEnabled: boolean; refs: Array<{ index: number; imageFile: string }> };
            segments: Array<{ continuityFromPrev: boolean; refs: Array<{ index: number }> }>;
            output: { exportMode: string; continuityOverlapFrames: number; width: number };
        };

        expect(timeline.runSelection).toEqual([0, 1]);
        expect(timeline.global.commonEnabled).toBe(true);
        expect(timeline.global.refs).toEqual([{ index: 0, imageFile: "cast.png" }]);
        expect(timeline.segments[0].continuityFromPrev).toBe(false);
        expect(timeline.segments[1].continuityFromPrev).toBe(true);
        expect(timeline.segments[1].refs).toEqual([{ index: 3, imageFile: "lamp.png" }]);
        expect(timeline.output).toMatchObject({ exportMode: "segments", continuityOverlapFrames: 22, width: 960 });
    });

    it("leaves a continuous fl2v start empty so the previous tail is used", () => {
        const project = { ...createDirectorProject(), mode: "fl2v" as const };
        const timeline = buildDirectorTimeline(project, {
            common: [],
            byShot: { f1: { start: "door.png", end: "lamp.png" }, f3: { end: "close.png" } },
        }) as unknown as { timelineMode: string; shots: Array<{ startImage?: { imageFile: string }; continuityFromPrev: boolean }> };

        expect(timeline.timelineMode).toBe("fl2v");
        expect(timeline.shots[0].startImage).toEqual({ imageFile: "door.png" });
        expect(timeline.shots[1].startImage).toBeUndefined();
        expect(timeline.shots[1].continuityFromPrev).toBe(true);
        expect(timeline.shots[2].startImage).toBeUndefined();
    });

    it("refuses to build a timeline when nothing is checked", () => {
        const project = createDirectorProject();
        project.r2v = project.r2v.map((shot) => ({ ...shot, run: false }));
        expect(() => buildDirectorTimeline(project, { common: [], byShot: {} })).toThrow("请至少勾选一段再生成。");
    });

    it("fills empty reference slots from linked canvas images and keeps a continuous start empty", () => {
        const project = { ...createDirectorProject(), mode: "fl2v" as const };
        const plan = planDirectorUploads(project, [
            { id: "a", name: "门口图", storageKey: "image:a" },
            { id: "b", name: "尾帧", storageKey: "image:b" },
        ]);
        expect(plan.shots[0].start?.storageKey).toBe("image:a");
        expect(plan.shots[0].end?.storageKey).toBe("image:b");
        expect(plan.shots[1].start).toBeUndefined();
        expect(plan.shots[2].start).toBeUndefined();
        expect(plan.shots[2].end).toBeUndefined();
    });

    it("fills empty shared pictures from linked images", () => {
        const project = createDirectorProject();
        const plan = planDirectorUploads(project, [{ id: "n1", name: "林夏", url: "blob:cast" }]);
        expect(plan.common[0].url).toBe("blob:cast");
        expect(plan.common[1].url).toBeUndefined();
    });

    it("queues the director node with locked sampling and a segment video output", () => {
        const project = createDirectorProject();
        const timeline = buildDirectorTimeline(project, { common: [], byShot: {} });
        const workflow = buildDirectorWorkflow(project, timeline, 7) as Record<string, { class_type: string; inputs: Record<string, unknown>; _meta: { title: string } }>;
        expect(workflow["5"].class_type).toBe("MiniMaxH3Director");
        expect(workflow["5"].inputs.task_type).toBe("r2v — 参考主体生视频(Reference to Video)");
        expect(workflow["5"].inputs.steps).toBe(25);
        expect(workflow["5"].inputs.sampler).toBe("res_multistep");
        expect(workflow["1"].inputs.unet_name).toBe("minimax_h3_ref2va_pruned_fp8_scaled.safetensors");
        expect(workflow["6"].class_type).toBe("VHS_VideoCombine");
        expect(workflow["6"]._meta.title).toBe("output_video");
        expect(workflow["6"].inputs.images).toEqual(["5", 0]);
    });

    it("maps each exported segment file onto the checked shot with the same timeline index", () => {
        const shots = activeShots(createDirectorProject());
        expect(parseSegmentExportName("seg_0001.mp4")).toBe(1);
        expect(parseSegmentExportName("seg_0001_pre.mp4")).toBeNull();
        const mapped = mapSegmentExportsToShots(shots, [
            { index: 0, filename: "seg_0000.mp4", subfolder: "minimax_seg_export/run" },
            { index: 1, filename: "seg_0001.mp4", subfolder: "minimax_seg_export/run" },
        ]);
        expect(mapped.find((item) => item.id === "s1")?.file?.filename).toBe("seg_0000.mp4");
        expect(mapped.find((item) => item.id === "s2")?.file?.filename).toBe("seg_0001.mp4");
        expect(mapped.find((item) => item.id === "s3")?.file).toBeUndefined();
    });

    it("checks only the shots an agent asked to generate", () => {
        const next = withDirectorRunSelection(createDirectorProject(), ["s3"]);
        expect(next.r2v.map((shot) => shot.run)).toEqual([false, false, true]);
        expect(() => withDirectorRunSelection(createDirectorProject(), ["missing"])).toThrow("找不到分段");
    });

    it("lists only the clips produced by the current run", () => {
        const project = createDirectorProject();
        project.r2v[0] = { ...project.r2v[0], status: "generated", videoStorageKey: "director:s1", videoUrl: "blob:s1" };
        project.r2v[2] = { ...project.r2v[2], status: "generated", videoStorageKey: "director:old", videoUrl: "blob:old" };
        expect(directorRunClips(project).map((clip) => clip.id)).toEqual(["s1"]);
        expect(directorRunClips(project)[0]).toMatchObject({ id: "s1", title: "撑伞入画", url: "blob:s1", storageKey: "director:s1", width: 960, height: 544 });
    });

    it("uses the global channel address instead of the video model channel", () => {
        const config = {
            channelId: "builtin",
            videoModel: "cloud::MiniMax H3 全能视频",
            channels: [
                { id: "builtin", comfyuiProxyUrl: "http://localhost:6006", comfyuiProxyToken: "global-token" },
                { id: "cloud", comfyuiProxyUrl: "http://127.0.0.1:8188", comfyuiProxyToken: "other-token" },
            ],
        };
        expect(resolveDirectorComfyui(config)).toEqual({ baseUrl: "http://localhost:6006", token: "global-token" });
        expect(resolveDirectorComfyui({ ...config, channelId: undefined })).toEqual({ baseUrl: "http://localhost:6006", token: "global-token" });
    });

    it("keeps a saved project and adds a shot on the active mode", () => {
        const saved = readDirectorProject({ title: "夜戏", mode: "fl2v", fl2v: [{ id: "only", title: "独段", prompt: "走", seconds: 15, run: true, continuity: true }] });
        expect(saved.title).toBe("夜戏");
        expect(saved.fl2v).toHaveLength(1);
        expect(saved.fl2v[0].continuity).toBe(false);
        expect(saved.fl2v[0].seconds).toBe(15);
        const next = addDirectorShot(saved);
        expect(next.fl2v).toHaveLength(2);
        expect(next.fl2v[1].continuity).toBe(true);
        expect(next.selectedFl2v).toBe(next.fl2v[1].id);
    });
});
