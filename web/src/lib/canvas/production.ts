export type ProductionScript = {
    title: string;
    content: string;
    updatedAt: string;
};

export type ProductionCharacter = {
    id: string;
    name: string;
    summary: string;
    imageKey?: string;
    updatedAt: string;
};

export type ProductionScene = {
    id: string;
    name: string;
    summary: string;
    imageKey?: string;
    updatedAt: string;
};

export type ProductionShot = {
    id: string;
    title: string;
    prompt: string;
    characterIds: string[];
    sceneId?: string;
    imageKey?: string;
    audioId?: string;
    clipId?: string;
    updatedAt: string;
};

export type ProductionMedia = {
    id: string;
    title: string;
    storageKey: string;
    mimeType: string;
    note: string;
    updatedAt: string;
};

export type ProductionDoc = {
    projectId: string;
    script: ProductionScript;
    characters: ProductionCharacter[];
    scenes: ProductionScene[];
    shots: ProductionShot[];
    audios: ProductionMedia[];
    clips: ProductionMedia[];
    finals: ProductionMedia[];
};

export function createProduction(projectId: string, now = new Date().toISOString()): ProductionDoc {
    return {
        projectId,
        script: { title: "", content: "", updatedAt: now },
        characters: [],
        scenes: [],
        shots: [],
        audios: [],
        clips: [],
        finals: [],
    };
}

export function updateScript(doc: ProductionDoc, patch: Partial<Pick<ProductionScript, "title" | "content">>, now = new Date().toISOString()): ProductionDoc {
    return { ...doc, script: { ...doc.script, ...patch, updatedAt: now } };
}

export function addCharacter(doc: ProductionDoc, character: ProductionCharacter): ProductionDoc {
    return { ...doc, characters: [...doc.characters, character] };
}

export function updateCharacter(doc: ProductionDoc, id: string, patch: Partial<Omit<ProductionCharacter, "id">>, now = new Date().toISOString()): ProductionDoc {
    return { ...doc, characters: doc.characters.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item)) };
}

export function removeCharacter(doc: ProductionDoc, id: string): ProductionDoc {
    return {
        ...doc,
        characters: doc.characters.filter((item) => item.id !== id),
        shots: doc.shots.map((shot) => ({ ...shot, characterIds: shot.characterIds.filter((item) => item !== id) })),
    };
}

export function addScene(doc: ProductionDoc, scene: ProductionScene): ProductionDoc {
    return { ...doc, scenes: [...doc.scenes, scene] };
}

export function updateScene(doc: ProductionDoc, id: string, patch: Partial<Omit<ProductionScene, "id">>, now = new Date().toISOString()): ProductionDoc {
    return { ...doc, scenes: doc.scenes.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item)) };
}

export function removeScene(doc: ProductionDoc, id: string): ProductionDoc {
    return {
        ...doc,
        scenes: doc.scenes.filter((item) => item.id !== id),
        shots: doc.shots.map((shot) => (shot.sceneId === id ? { ...shot, sceneId: undefined } : shot)),
    };
}

export function addShot(doc: ProductionDoc, shot: ProductionShot): ProductionDoc {
    return { ...doc, shots: [...doc.shots, shot] };
}

export function updateShot(doc: ProductionDoc, id: string, patch: Partial<Omit<ProductionShot, "id">>, now = new Date().toISOString()): ProductionDoc {
    return { ...doc, shots: doc.shots.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item)) };
}

export function removeShot(doc: ProductionDoc, id: string): ProductionDoc {
    return { ...doc, shots: doc.shots.filter((item) => item.id !== id) };
}

export function moveShot(doc: ProductionDoc, id: string, direction: -1 | 1): ProductionDoc {
    const index = doc.shots.findIndex((item) => item.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= doc.shots.length) return doc;
    const shots = [...doc.shots];
    const [item] = shots.splice(index, 1);
    shots.splice(next, 0, item);
    return { ...doc, shots };
}

export function addMedia(doc: ProductionDoc, bucket: "audios" | "clips" | "finals", media: ProductionMedia): ProductionDoc {
    return { ...doc, [bucket]: [...doc[bucket], media] };
}

export function updateMedia(doc: ProductionDoc, bucket: "audios" | "clips" | "finals", id: string, patch: Partial<Omit<ProductionMedia, "id">>, now = new Date().toISOString()): ProductionDoc {
    return { ...doc, [bucket]: doc[bucket].map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now } : item)) };
}

export function removeMedia(doc: ProductionDoc, bucket: "audios" | "clips" | "finals", id: string): ProductionDoc {
    const next = { ...doc, [bucket]: doc[bucket].filter((item) => item.id !== id) };
    if (bucket === "audios") next.shots = doc.shots.map((shot) => (shot.audioId === id ? { ...shot, audioId: undefined } : shot));
    if (bucket === "clips") next.shots = doc.shots.map((shot) => (shot.clipId === id ? { ...shot, clipId: undefined } : shot));
    return next;
}

export function collectFinalFromClip(doc: ProductionDoc, clipId: string, id: string, now = new Date().toISOString()): ProductionDoc {
    const clip = doc.clips.find((item) => item.id === clipId);
    if (!clip) return doc;
    return addMedia(doc, "finals", { id, title: clip.title, storageKey: clip.storageKey, mimeType: clip.mimeType, note: clip.note, updatedAt: now });
}
