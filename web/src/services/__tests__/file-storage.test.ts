import { uploadMediaFile } from "@/services/file-storage";

describe("uploadMediaFile", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("stores a video when the player never reports metadata", async () => {
        vi.useFakeTimers();
        const original = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
            if (tag !== "video") return original(tag, options);
            return {
                videoWidth: 0,
                videoHeight: 0,
                duration: Number.NaN,
                set onloadedmetadata(_handler: (() => void) | null) {},
                set onerror(_handler: (() => void) | null) {},
                set src(_value: string) {},
            } as unknown as HTMLVideoElement;
        });

        const blob = new Blob(["video"], { type: "video/mp4" });
        const pending = uploadMediaFile(blob, "video");
        const settled = pending.then(
            (value) => ({ settled: true as const, value }),
            (error: unknown) => ({ settled: true as const, error }),
        );
        await vi.advanceTimersByTimeAsync(8_000);
        const result = await Promise.race([
            settled,
            Promise.resolve().then(() => ({ settled: false as const })),
        ]);

        expect(result.settled).toBe(true);
        if (result.settled && "value" in result) {
            expect(result.value.mimeType).toBe("video/mp4");
            expect(result.value.bytes).toBe(blob.size);
        }
    });
});
