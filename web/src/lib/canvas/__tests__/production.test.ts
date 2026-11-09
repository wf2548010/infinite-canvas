import { describe, expect, it } from "vitest";

import { addCharacter, addMedia, addScene, addShot, collectFinalFromClip, createProduction, moveShot, removeCharacter, removeMedia, removeScene, removeShot, updateScript, type ProductionCharacter, type ProductionMedia, type ProductionScene, type ProductionShot } from "@/lib/canvas/production";

const now = "2026-11-09T00:00:00.000Z";

function character(id: string): ProductionCharacter {
    return { id, name: id, summary: "", updatedAt: now };
}

function scene(id: string): ProductionScene {
    return { id, name: id, summary: "", updatedAt: now };
}

function shot(id: string, patch: Partial<ProductionShot> = {}): ProductionShot {
    return { id, title: id, prompt: "", characterIds: [], updatedAt: now, ...patch };
}

function media(id: string): ProductionMedia {
    return { id, title: id, storageKey: `video:${id}`, mimeType: "video/mp4", note: "", updatedAt: now };
}

describe("production doc", () => {
    it("starts with an empty script and empty shelves", () => {
        expect(createProduction("project-1", now)).toMatchObject({
            projectId: "project-1",
            script: { title: "", content: "", updatedAt: now },
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
        expect(doc.script).toEqual({ title: "第一集", content: "开场在赛场。", updatedAt: now });
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
        expect(doc.finals[0]).toMatchObject({ id: "final-1", storageKey: "video:take", title: "take" });
    });
});
