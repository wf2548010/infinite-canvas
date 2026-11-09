import { describe, expect, it } from "vitest";

import { addCharacter, addMedia, addScene, addShot, collectFinalFromClip, createProduction, ingestAgentAssets, moveShot, removeCharacter, removeMedia, removeScene, removeShot, syncProductionFromNodes, updateScript, type ProductionCharacter, type ProductionMedia, type ProductionScene, type ProductionShot } from "@/lib/canvas/production";

const now = "2026-11-09T00:00:00.000Z";

function character(id: string): ProductionCharacter {
    return { id, code: id, name: id, summary: "", updatedAt: now };
}

function scene(id: string): ProductionScene {
    return { id, code: id, name: id, summary: "", updatedAt: now };
}

function shot(id: string, patch: Partial<ProductionShot> = {}): ProductionShot {
    return { id, code: id, title: id, prompt: "", characterIds: [], updatedAt: now, ...patch };
}

function media(id: string): ProductionMedia {
    return { id, code: id, title: id, storageKey: `video:${id}`, mimeType: "video/mp4", note: "", updatedAt: now };
}

describe("production doc", () => {
    it("starts with an empty script and empty shelves", () => {
        expect(createProduction("project-1", now)).toMatchObject({
            projectId: "project-1",
            script: { code: "SCR-001", title: "", content: "", updatedAt: now },
            characters: [],
            scenes: [],
            shots: [],
            audios: [],
            clips: [],
            finals: [],
        });
    });

    it("keeps the script on the project", () => {
        const doc = updateScript(createProduction("project-1", now), { title: "第一集", content: "开场在赛场。" }, now);
        expect(doc.script).toEqual({ code: "SCR-001", title: "第一集", content: "开场在赛场。", updatedAt: now });
    });

    it("drops a deleted character from shots without removing the shot", () => {
        const doc = addShot(addCharacter(createProduction("project-1", now), character("hero")), shot("shot-1", { characterIds: ["hero", "rival"] }));
        const next = removeCharacter(doc, "hero");
        expect(next.characters).toEqual([]);
        expect(next.shots[0]?.characterIds).toEqual(["rival"]);
    });

    it("clears a deleted scene, audio, and clip from shots", () => {
        let doc = addScene(createProduction("project-1", now), scene("hall"));
        doc = addMedia(doc, "audios", { ...media("voice"), storageKey: "audio:voice", mimeType: "audio/mpeg" });
        doc = addMedia(doc, "clips", media("take"));
        doc = addShot(doc, shot("shot-1", { sceneId: "hall", audioId: "voice", clipId: "take" }));
        doc = removeScene(doc, "hall");
        doc = removeMedia(doc, "audios", "voice");
        doc = removeMedia(doc, "clips", "take");
        expect(doc.shots[0]).toMatchObject({ sceneId: undefined, audioId: undefined, clipId: undefined });
        expect(doc.scenes).toEqual([]);
    });

    it("reorders shots and leaves a removed shot's characters in place", () => {
        let doc = addCharacter(createProduction("project-1", now), character("hero"));
        doc = addShot(doc, shot("a"));
        doc = addShot(doc, shot("b"));
        doc = moveShot(doc, "b", -1);
        expect(doc.shots.map((item) => item.id)).toEqual(["b", "a"]);
        doc = removeShot(doc, "b");
        expect(doc.characters.map((item) => item.id)).toEqual(["hero"]);
        expect(doc.shots.map((item) => item.id)).toEqual(["a"]);
    });

    it("collects a finished film from a clip without copying or removing the clip", () => {
        let doc = addMedia(createProduction("project-1", now), "clips", media("take"));
        doc = collectFinalFromClip(doc, "take", "final-1", now);
        expect(doc.clips).toHaveLength(1);
        expect(doc.finals[0]).toMatchObject({ id: "final-1", code: "FIN-001", storageKey: "video:take", title: "take" });
    });

    it("stores agent script, characters, scenes and shots under unique codes", () => {
        const doc = ingestAgentAssets(createProduction("project-1", now), [
            { kind: "script", title: "第一集", content: "林夏走进赛场。" },
            { kind: "character", name: "林夏", summary: "选手" },
            { kind: "character", name: "教练" },
            { kind: "scene", name: "赛场" },
            { kind: "shot", title: "开场", prompt: "林夏站在灯下", characterCodes: ["CHR-001"], sceneCode: "SCN-001" },
        ], now).doc;
        expect(doc.script).toMatchObject({ code: "SCR-001", content: "林夏走进赛场。" });
        expect(doc.characters.map((item) => item.code)).toEqual(["CHR-001", "CHR-002"]);
        expect(doc.scenes[0]?.code).toBe("SCN-001");
        expect(doc.shots[0]).toMatchObject({ code: "SHT-001", characterIds: ["CHR-001"], sceneId: "SCN-001" });
        const again = ingestAgentAssets(doc, [{ kind: "character", code: "CHR-001", imageKey: "image:hero" }], now).doc;
        expect(again.characters).toHaveLength(2);
        expect(again.characters[0]?.imageKey).toBe("image:hero");
        expect(nextCodeAfterDelete(again)).toBe("CHR-003");
    });

    it("files a finished generated node into the matching directory and keeps its code", () => {
        const synced = syncProductionFromNodes(createProduction("project-1", now), [
            { id: "node-1", title: "林夏", metadata: { productionRole: "character", productionName: "林夏", status: "success", storageKey: "image:hero", prompt: "选手" } },
            { id: "node-2", title: "还在生成", metadata: { productionRole: "scene", productionName: "赛场", status: "loading", storageKey: "" } },
        ], now);
        expect(synced.patches).toEqual([{ id: "node-1", code: "CHR-001" }]);
        expect(synced.doc.characters[0]).toMatchObject({ code: "CHR-001", name: "林夏", imageKey: "image:hero" });
        expect(synced.doc.scenes).toEqual([]);
        const saved = syncProductionFromNodes(synced.doc, [
            { id: "node-1", title: "林夏", metadata: { productionRole: "character", productionCode: "CHR-001", productionName: "林夏", status: "success", storageKey: "image:hero", prompt: "选手" } },
        ], now);
        expect(saved.doc).toBe(synced.doc);
        expect(saved.patches).toEqual([]);
    });
});

function nextCodeAfterDelete(doc: ReturnType<typeof createProduction>) {
    const removed = removeCharacter(doc, "CHR-002");
    return ingestAgentAssets(removed, [{ kind: "character", name: "替补" }], now).doc.characters.at(-1)?.code;
}
