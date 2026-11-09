import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMediaFile = vi.fn();

vi.mock("@/services/file-storage", () => ({
    uploadMediaFile: (...args: unknown[]) => uploadMediaFile(...args),
}));

describe("storeGeneratedVideo", () => {
    beforeEach(() => {
        uploadMediaFile.mockReset();
    });

    it("surfaces a storage failure instead of keeping an empty storage key", async () => {
        uploadMediaFile.mockRejectedValue(new Error("写入失败"));
        const { storeGeneratedVideo } = await import("@/services/api/video");
        await expect(storeGeneratedVideo({ url: "https://example.test/clip.mp4", mimeType: "video/mp4" })).rejects.toThrow("写入失败");
    });
});
