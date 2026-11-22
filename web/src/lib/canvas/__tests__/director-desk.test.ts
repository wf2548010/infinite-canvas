import { describe, expect, it } from "vitest";

import {
    addDirectorShot,
    buildDirectorTimeline,
    buildDirectorWorkflow,
    createDirectorProject,
    directorSize,
    minimaxFrames,
    planDirectorUploads,
    readDirectorProject,
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
