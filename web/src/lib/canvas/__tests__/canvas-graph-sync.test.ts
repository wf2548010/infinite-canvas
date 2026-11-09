import { describe, expect, it } from "vitest";

import { isPositionOnlyGraphChange, planCanvasGraphSync } from "@/lib/canvas/canvas-graph-sync";

const node = (id: string, x: number, extra?: Record<string, unknown>) => ({
    id,
    type: "image",
    title: id,
    position: { x, y: 0 },
    width: 100,
    height: 80,
    ...extra,
});

describe("planCanvasGraphSync", () => {
    it("defers while a node drag is in progress", () => {
        expect(planCanvasGraphSync({ projectLoaded: true, historyPaused: false, dragging: true, collabHost: true, positionOnly: true })).toEqual({ type: "defer" });
    });

    it("skips while history is paused", () => {
        expect(planCanvasGraphSync({ projectLoaded: true, historyPaused: true, dragging: false, collabHost: true, positionOnly: false })).toEqual({ type: "skip" });
    });

    it("sends a position patch for a host when only positions changed", () => {
        expect(planCanvasGraphSync({ projectLoaded: true, historyPaused: false, dragging: false, collabHost: true, positionOnly: true })).toEqual({ type: "commit", collab: "position-patch" });
    });

    it("sends a full sync when content changed", () => {
        expect(planCanvasGraphSync({ projectLoaded: true, historyPaused: false, dragging: false, collabHost: true, positionOnly: false })).toEqual({ type: "commit", collab: "full" });
    });

    it("commits locally without collab when this client is not the host", () => {
        expect(planCanvasGraphSync({ projectLoaded: true, historyPaused: false, dragging: false, collabHost: false, positionOnly: true })).toEqual({ type: "commit", collab: "none" });
    });
});

describe("isPositionOnlyGraphChange", () => {
    it("is true when the same nodes only move", () => {
        expect(isPositionOnlyGraphChange([node("a", 0)], [node("a", 40)])).toBe(true);
    });

    it("is false when metadata changes", () => {
        expect(isPositionOnlyGraphChange([node("a", 0, { metadata: { groupId: undefined } })], [node("a", 40, { metadata: { groupId: "g1" } })])).toBe(false);
    });

    it("is false when a node is added", () => {
        expect(isPositionOnlyGraphChange([node("a", 0)], [node("a", 0), node("b", 10)])).toBe(false);
    });
});
