export type ProductionKind = "script" | "character" | "scene" | "shot" | "audio" | "clip" | "final";

export type ProductionScript = {
    code: string;
    title: string;
    content: string;
    updatedAt: string;
};

export type ProductionCharacter = {
    id: string;
    code: string;
    name: string;
    summary: string;
    imageKey?: string;
    updatedAt: string;
};

export type ProductionScene = {
    id: string;
    code: string;
    name: string;
    summary: string;
    imageKey?: string;
    updatedAt: string;
};

export type ProductionShot = {
    id: string;
    code: string;
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
    code: string;
    title: string;
    storageKey: string;
    mimeType: string;
    note: string;
    updatedAt: string;
};

export type ProductionSequences = Record<"SCR" | "CHR" | "SCN" | "SHT" | "AUD" | "CLP" | "FIN", number>;

export type ProductionDoc = {
    projectId: string;
    sequences: ProductionSequences;
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
        sequences: { SCR: 1, CHR: 0, SCN: 0, SHT: 0, AUD: 0, CLP: 0, FIN: 0 },
        script: { code: "SCR-001", title: "", content: "", updatedAt: now },
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
    const issued = issueProductionCode(doc, "FIN");
    return addMedia(issued.doc, "finals", { id, code: issued.code, title: clip.title, storageKey: clip.storageKey, mimeType: clip.mimeType, note: clip.note, updatedAt: now });
}

const CODE_PREFIX: Record<ProductionKind, keyof ProductionSequences> = { script: "SCR", character: "CHR", scene: "SCN", shot: "SHT", audio: "AUD", clip: "CLP", final: "FIN" };
const MEDIA_BUCKET = { audio: "audios", clip: "clips", final: "finals" } as const;

export type AgentProductionInput = {
    kind: ProductionKind;
    code?: string;
    title?: string;
    name?: string;
    content?: string;
    summary?: string;
    prompt?: string;
    note?: string;
    imageKey?: string;
    storageKey?: string;
    mimeType?: string;
    characterCodes?: string[];
    sceneCode?: string;
    audioCode?: string;
    clipCode?: string;
};

export type ProductionNodeSource = {
    id: string;
    title?: string;
    metadata?: {
        productionRole?: ProductionKind;
        productionCode?: string;
        productionName?: string;
        content?: string;
        prompt?: string;
        status?: string;
        storageKey?: string;
        mimeType?: string;
    };
};

export function productionCodes(doc: ProductionDoc) {
    return [doc.script.code, ...doc.characters.map((item) => item.code), ...doc.scenes.map((item) => item.code), ...doc.shots.map((item) => item.code), ...doc.audios.map((item) => item.code), ...doc.clips.map((item) => item.code), ...doc.finals.map((item) => item.code)].filter(Boolean);
}

export function issueProductionCode(doc: ProductionDoc, prefix: keyof ProductionSequences) {
    const ready = ensureSequences(doc);
    const number = ready.sequences[prefix] + 1;
    let code = formatProductionCode(prefix, number);
    const used = new Set(productionCodes(ready));
    let nextNumber = number;
    while (used.has(code)) code = formatProductionCode(prefix, ++nextNumber);
    return { doc: { ...ready, sequences: { ...ready.sequences, [prefix]: nextNumber } }, code };
}

export function nextProductionCode(doc: ProductionDoc, prefix: keyof ProductionSequences) {
    return issueProductionCode(doc, prefix).code;
}

export function backfillProductionCodes(doc: ProductionDoc): ProductionDoc {
    let next = ensureSequences(doc.script.code ? doc : { ...doc, script: { ...doc.script, code: "SCR-001" } });
    next = assignMissingCodes(next, next.characters, "CHR", (current, items) => ({ ...current, characters: items }));
    next = assignMissingCodes(next, next.scenes, "SCN", (current, items) => ({ ...current, scenes: items }));
    next = assignMissingCodes(next, next.shots, "SHT", (current, items) => ({ ...current, shots: items }));
    next = assignMissingCodes(next, next.audios, "AUD", (current, items) => ({ ...current, audios: items }));
    next = assignMissingCodes(next, next.clips, "CLP", (current, items) => ({ ...current, clips: items }));
    next = assignMissingCodes(next, next.finals, "FIN", (current, items) => ({ ...current, finals: items }));
    return sameProduction(doc, next) ? doc : next;
}

function assignMissingCodes<T extends { code: string }>(doc: ProductionDoc, items: T[], prefix: keyof ProductionSequences, place: (doc: ProductionDoc, items: T[]) => ProductionDoc) {
    const filled: T[] = [];
    let next = doc;
    items.forEach((item) => {
        if (item.code) {
            filled.push(item);
            return;
        }
        const issued = issueProductionCode(place(next, filled), prefix);
        filled.push({ ...item, code: issued.code });
        next = issued.doc;
    });
    return place(next, filled);
}

export function ingestAgentAssets(doc: ProductionDoc, items: AgentProductionInput[], now = new Date().toISOString()) {
    const order: ProductionKind[] = ["script", "character", "scene", "audio", "clip", "final", "shot"];
    let next = backfillProductionCodes(doc);
    const records: { kind: ProductionKind; code: string }[] = [];
    [...items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).forEach((item) => {
        const saved = ingestOne(next, item, now);
        next = saved.doc;
        records.push({ kind: item.kind, code: saved.code });
    });
    return { doc: sameProduction(doc, next) ? doc : next, records };
}

export function syncProductionFromNodes(doc: ProductionDoc, nodes: ProductionNodeSource[], now = new Date().toISOString()) {
    let next = backfillProductionCodes(doc);
    const patches: { id: string; code: string }[] = [];
    nodes.forEach((node) => {
        const role = node.metadata?.productionRole;
        if (!role || !productionNodeReady(node)) return;
        const issued = node.metadata?.productionCode ? { doc: next, code: node.metadata.productionCode } : issueProductionCode(next, CODE_PREFIX[role]);
        const code = issued.code;
        next = issued.doc;
        if (!node.metadata?.productionCode) patches.push({ id: node.id, code });
        const item = productionAssetFromNode({ ...node, metadata: { ...node.metadata, productionCode: code } });
        if (item) next = ingestAgentAssets(next, [item], now).doc;
    });
    return { doc: next, patches };
}

export function productionAssetFromNode(node: ProductionNodeSource): AgentProductionInput | null {
    const role = node.metadata?.productionRole;
    const code = node.metadata?.productionCode;
    if (!role || !code || !productionNodeReady(node)) return null;
    const name = node.metadata?.productionName || node.title || "";
    if (role === "script") return { kind: "script", code, title: name, content: node.metadata?.content || node.metadata?.prompt || "" };
    if (role === "character" || role === "scene") return { kind: role, code, name, summary: node.metadata?.prompt || "", imageKey: node.metadata?.storageKey };
    if (role === "shot") return { kind: "shot", code, title: name, prompt: node.metadata?.prompt || "", imageKey: node.metadata?.storageKey };
    return { kind: role, code, title: name, storageKey: node.metadata?.storageKey, mimeType: node.metadata?.mimeType, note: "" };
}

export function productionNodeStamp(metadata?: { productionRole?: ProductionKind; productionCode?: string; productionName?: string }) {
    if (!metadata?.productionRole) return {};
    return { productionRole: metadata.productionRole, productionCode: metadata.productionCode, productionName: metadata.productionName };
}

function productionNodeReady(node: ProductionNodeSource) {
    const role = node.metadata?.productionRole;
    if (!role) return false;
    if (role === "script") return Boolean((node.metadata?.content || node.metadata?.prompt || "").trim());
    return node.metadata?.status === "success" && Boolean(node.metadata?.storageKey);
}

function ingestOne(doc: ProductionDoc, item: AgentProductionInput, now: string) {
    if (item.kind === "script") {
        const code = doc.script.code || "SCR-001";
        return { doc: { ...doc, script: { code, title: item.title ?? item.name ?? doc.script.title, content: item.content ?? doc.script.content, updatedAt: now } }, code };
    }
    const prefix = CODE_PREFIX[item.kind];
    const explicit = cleanCode(item.code);
    const issued = explicit ? { doc: rememberCode(doc, explicit), code: explicit } : issueProductionCode(doc, prefix);
    assertCodeKind(issued.doc, issued.code, item.kind);
    if (item.kind === "character" || item.kind === "scene") return { doc: upsertPicture(issued.doc, item.kind, issued.code, item, now), code: issued.code };
    if (item.kind === "shot") return { doc: upsertShot(issued.doc, issued.code, item, now), code: issued.code };
    return { doc: upsertMedia(issued.doc, MEDIA_BUCKET[item.kind], issued.code, item, now), code: issued.code };
}

function upsertPicture(doc: ProductionDoc, kind: "character" | "scene", code: string, item: AgentProductionInput, now: string) {
    const bucket = kind === "character" ? "characters" : "scenes";
    const existing = doc[bucket].find((entry) => entry.code === code);
    const name = item.name ?? item.title;
    if (existing) {
        const patch = { ...(name !== undefined ? { name } : {}), ...(item.summary !== undefined ? { summary: item.summary } : {}), ...(item.imageKey ? { imageKey: item.imageKey } : {}) };
        return kind === "character" ? updateCharacter(doc, existing.id, patch, now) : updateScene(doc, existing.id, patch, now);
    }
    const created = { id: code, code, name: name || "", summary: item.summary || "", imageKey: item.imageKey, updatedAt: now };
    return kind === "character" ? addCharacter(doc, created) : addScene(doc, created);
}

function upsertShot(doc: ProductionDoc, code: string, item: AgentProductionInput, now: string) {
    const existing = doc.shots.find((entry) => entry.code === code);
    const links = shotLinks(doc, item);
    const title = item.title ?? item.name;
    if (existing) return updateShot(doc, existing.id, { ...(title !== undefined ? { title } : {}), ...(item.prompt !== undefined ? { prompt: item.prompt } : {}), ...(item.imageKey ? { imageKey: item.imageKey } : {}), ...links }, now);
    return addShot(doc, { id: code, code, title: title || "", prompt: item.prompt || "", characterIds: links.characterIds || [], sceneId: links.sceneId, audioId: links.audioId, clipId: links.clipId, imageKey: item.imageKey, updatedAt: now });
}

function upsertMedia(doc: ProductionDoc, bucket: "audios" | "clips" | "finals", code: string, item: AgentProductionInput, now: string) {
    const existing = doc[bucket].find((entry) => entry.code === code);
    const title = item.title ?? item.name;
    if (existing) return updateMedia(doc, bucket, existing.id, { ...(title !== undefined ? { title } : {}), ...(item.note !== undefined ? { note: item.note } : {}), ...(item.storageKey ? { storageKey: item.storageKey } : {}), ...(item.mimeType ? { mimeType: item.mimeType } : {}) }, now);
    if (!item.storageKey) return addMedia(doc, bucket, { id: code, code, title: title || "", storageKey: "", mimeType: item.mimeType || "", note: item.note || "", updatedAt: now });
    return addMedia(doc, bucket, { id: code, code, title: title || "", storageKey: item.storageKey, mimeType: item.mimeType || "", note: item.note || "", updatedAt: now });
}

function shotLinks(doc: ProductionDoc, item: AgentProductionInput) {
    const links: Partial<Pick<ProductionShot, "characterIds" | "sceneId" | "audioId" | "clipId">> = {};
    if (item.characterCodes) links.characterIds = item.characterCodes.map((code) => doc.characters.find((entry) => entry.code === code)?.id).filter((id): id is string => Boolean(id));
    if (item.sceneCode !== undefined) links.sceneId = doc.scenes.find((entry) => entry.code === item.sceneCode)?.id;
    if (item.audioCode !== undefined) links.audioId = doc.audios.find((entry) => entry.code === item.audioCode)?.id;
    if (item.clipCode !== undefined) links.clipId = doc.clips.find((entry) => entry.code === item.clipCode)?.id;
    return links;
}

function assertCodeKind(doc: ProductionDoc, code: string, kind: ProductionKind) {
    const owner = codeOwner(doc, code);
    if (owner && owner !== kind) throw new Error(`编号 ${code} 已用于${ownerLabel(owner)}`);
}

function codeOwner(doc: ProductionDoc, code: string): ProductionKind | undefined {
    if (doc.script.code === code) return "script";
    if (doc.characters.some((item) => item.code === code)) return "character";
    if (doc.scenes.some((item) => item.code === code)) return "scene";
    if (doc.shots.some((item) => item.code === code)) return "shot";
    if (doc.audios.some((item) => item.code === code)) return "audio";
    if (doc.clips.some((item) => item.code === code)) return "clip";
    if (doc.finals.some((item) => item.code === code)) return "final";
    return undefined;
}

function ownerLabel(kind: ProductionKind) {
    if (kind === "script") return "剧本";
    if (kind === "character") return "角色";
    if (kind === "scene") return "场景";
    if (kind === "shot") return "镜头";
    if (kind === "audio") return "音频";
    if (kind === "clip") return "片段";
    return "成品";
}

function cleanCode(code?: string) {
    const value = code?.trim();
    return value || undefined;
}

function formatProductionCode(prefix: string, number: number) {
    return `${prefix}-${String(number).padStart(3, "0")}`;
}

function ensureSequences(doc: ProductionDoc): ProductionDoc {
    const sequences: ProductionSequences = { SCR: 0, CHR: 0, SCN: 0, SHT: 0, AUD: 0, CLP: 0, FIN: 0 };
    (Object.keys(sequences) as (keyof ProductionSequences)[]).forEach((prefix) => {
        sequences[prefix] = Math.max(sequences[prefix], Number(doc.sequences?.[prefix]) || 0);
    });
    productionCodes(doc).forEach((code) => {
        const match = /^(SCR|CHR|SCN|SHT|AUD|CLP|FIN)-(\d+)$/.exec(code);
        if (!match) return;
        const prefix = match[1] as keyof ProductionSequences;
        sequences[prefix] = Math.max(sequences[prefix], Number(match[2]));
    });
    return { ...doc, sequences };
}

function rememberCode(doc: ProductionDoc, code: string) {
    const match = /^(SCR|CHR|SCN|SHT|AUD|CLP|FIN)-(\d+)$/.exec(code);
    if (!match) return ensureSequences(doc);
    const prefix = match[1] as keyof ProductionSequences;
    const ready = ensureSequences(doc);
    if (ready.sequences[prefix] >= Number(match[2])) return ready;
    return { ...ready, sequences: { ...ready.sequences, [prefix]: Number(match[2]) } };
}

function sameProduction(left: ProductionDoc, right: ProductionDoc) {
    const strip = (doc: ProductionDoc) => ({
        ...doc,
        script: { ...doc.script, updatedAt: "" },
        characters: doc.characters.map(({ updatedAt: _updatedAt, ...item }) => item),
        scenes: doc.scenes.map(({ updatedAt: _updatedAt, ...item }) => item),
        shots: doc.shots.map(({ updatedAt: _updatedAt, ...item }) => item),
        audios: doc.audios.map(({ updatedAt: _updatedAt, ...item }) => item),
        clips: doc.clips.map(({ updatedAt: _updatedAt, ...item }) => item),
        finals: doc.finals.map(({ updatedAt: _updatedAt, ...item }) => item),
    });
    return JSON.stringify(strip(left)) === JSON.stringify(strip(right));
}
