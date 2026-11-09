import { describe, expect, it } from "vitest";

import { connectionTouchesRect, nodeIntersectsRect, type WorldRect } from "@/lib/canvas/canvas-viewport-cull";

const view: WorldRect = { left: 0, top: 0, right: 1000, bottom: 800 };

describe("canvas viewport culling", () => {
    it("keeps a node that overlaps the view", () => {
        expect(nodeIntersectsRect({ position: { x: 900, y: 10 }, width: 200, height: 80 }, view)).toBe(true);
    });

    it("drops a node fully outside the view", () => {
        expect(nodeIntersectsRect({ position: { x: 2000, y: 10 }, width: 100, height: 80 }, view)).toBe(false);
    });

    it("keeps a connection when either end is in view", () => {
        const from = { position: { x: -400, y: 10 }, width: 100, height: 80 };
        const to = { position: { x: 100, y: 10 }, width: 100, height: 80 };
        expect(connectionTouchesRect(from, to, view)).toBe(true);
        expect(connectionTouchesRect(from, { position: { x: -200, y: 10 }, width: 40, height: 40 }, view)).toBe(false);
    });
});
