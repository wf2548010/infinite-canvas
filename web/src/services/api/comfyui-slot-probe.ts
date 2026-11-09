/** Preferred input names per workflow class. Candidates below are tried when the class is unknown. */
const PREFERRED_INPUT_SLOT: Record<string, Record<string, string>> = {
    prompt: { CLIPTextEncode: "text", PrimitiveStringMultiline: "value", PrimitiveString: "value", TextEncodeBooguEdit: "prompt", TextEncodeQwenImageEditPlus: "prompt" },
    width: { PrimitiveInt: "value", PrimitiveFloat: "value" },
    height: { PrimitiveInt: "value", PrimitiveFloat: "value" },
    seed: { KSampler: "seed", KSamplerAdvanced: "noise_seed", PrimitiveInt: "value", PrimitiveFloat: "value" },
    ref_image: { LoadImage: "image", LoadImageMask: "image" },
    ref_mask: { LoadImage: "image", LoadImageMask: "image" },
    caption: { PrimitiveStringMultiline: "value", PrimitiveString: "value", CLIPTextEncode: "text" },
    lyrics: { PrimitiveStringMultiline: "value", PrimitiveString: "value", CLIPTextEncode: "text" },
    duration: { Float: "Number", PrimitiveInt: "value", PrimitiveFloat: "value" },
    ref_video: { LoadVideo: "video", VHS_LoadVideo: "video" },
    ref_audio: { LoadAudio: "audio" },
};

const INPUT_CANDIDATES: Record<string, string[]> = {
    prompt: ["value", "text", "prompt"],
    width: ["value", "width"],
    height: ["value", "height"],
    seed: ["seed", "noise_seed", "value"],
    ref_image: ["image"],
    ref_mask: ["image", "mask"],
    caption: ["value", "text", "prompt"],
    lyrics: ["value", "text", "prompt"],
    duration: ["value", "Number", "duration"],
    ref_video: ["video"],
    ref_audio: ["audio"],
};

export function resolveBindingInputSlot(category: string, classType: string | undefined, inputs: Record<string, unknown> | undefined): string | undefined {
    if (!inputs) return undefined;
    const preferred = classType ? PREFERRED_INPUT_SLOT[category]?.[classType] : undefined;
    if (preferred && Object.prototype.hasOwnProperty.call(inputs, preferred)) return preferred;
    return (INPUT_CANDIDATES[category] || []).find((name) => Object.prototype.hasOwnProperty.call(inputs, name));
}
