import { beforeEach, describe, expect, it, vi } from "vitest";

const setItem = vi.fn();

vi.mock("localforage", () => ({
    default: {
        config: vi.fn(),
        setItem: (...args: unknown[]) => setItem(...args),
        getItem: vi.fn(),
        removeItem: vi.fn(),
    },
}));

describe("localForageStorage", () => {
    beforeEach(() => {
        setItem.mockReset();
        window.localStorage.clear();
    });

    it("does not copy the persisted blob into localStorage when localforage fails", async () => {
        setItem.mockRejectedValue(new Error("quota"));
        const { localForageStorage } = await import("@/lib/localforage-storage");
        await expect(localForageStorage.setItem("canvas-store", "{\"nodes\":[]}")).rejects.toThrow("quota");
        expect(window.localStorage.getItem("canvas-store")).toBeNull();
    });
});