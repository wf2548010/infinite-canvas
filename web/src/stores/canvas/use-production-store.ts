import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import {
    addCharacter,
    addMedia,
    addScene,
    addShot,
    backfillProductionCodes,
    collectFinalFromClip,
    createProduction,
    ingestAgentAssets,
    issueProductionCode,
    moveShot,
    removeCharacter,
    removeMedia,
    removeScene,
    removeShot,
    updateCharacter,
    updateMedia,
    updateScene,
    updateScript,
    updateShot,
    type AgentProductionInput,
    type ProductionDoc,
    type ProductionMedia,
} from "@/lib/canvas/production";
import { localForageStorage } from "@/lib/localforage-storage";

type ProductionStore = {
    hydrated: boolean;
    docs: Record<string, ProductionDoc>;
    ensure: (projectId: string) => ProductionDoc;
    removeProjects: (ids: string[]) => void;
    saveScript: (projectId: string, patch: { title?: string; content?: string }) => void;
    createCharacter: (projectId: string) => string;
    saveCharacter: (projectId: string, id: string, patch: { name?: string; summary?: string; imageKey?: string }) => void;
    deleteCharacter: (projectId: string, id: string) => void;
    createScene: (projectId: string) => string;
    saveScene: (projectId: string, id: string, patch: { name?: string; summary?: string; imageKey?: string }) => void;
    deleteScene: (projectId: string, id: string) => void;
    createShot: (projectId: string) => string;
    saveShot: (projectId: string, id: string, patch: Parameters<typeof updateShot>[2]) => void;
    deleteShot: (projectId: string, id: string) => void;
    reorderShot: (projectId: string, id: string, direction: -1 | 1) => void;
    createMedia: (projectId: string, bucket: "audios" | "clips" | "finals", media: Omit<ProductionMedia, "id" | "updatedAt" | "code">) => string;
    saveMedia: (projectId: string, bucket: "audios" | "clips" | "finals", id: string, patch: Partial<Omit<ProductionMedia, "id">>) => void;
    deleteMedia: (projectId: string, bucket: "audios" | "clips" | "finals", id: string) => void;
    collectFinal: (projectId: string, clipId: string) => string | undefined;
    ingest: (projectId: string, items: AgentProductionInput[]) => { code: string; kind: AgentProductionInput["kind"] }[];
    replaceDoc: (projectId: string, doc: ProductionDoc) => void;
};

const STORAGE_KEY = "infinite-canvas:production_store";

function withDoc(docs: Record<string, ProductionDoc>, projectId: string, update: (doc: ProductionDoc) => ProductionDoc) {
    const current = docs[projectId] ?? createProduction(projectId);
    return { ...docs, [projectId]: update(current) };
}

const storage: PersistStorage<ProductionStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<ProductionStore>;
        const docs = parsed.state.docs || {};
        parsed.state.docs = Object.fromEntries(Object.entries(docs).map(([projectId, doc]) => [projectId, backfillProductionCodes(doc)]));
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useProductionStore = create<ProductionStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            docs: {},
            ensure: (projectId) => {
                const existing = get().docs[projectId];
                if (existing) return existing;
                const doc = createProduction(projectId);
                set({ docs: { ...get().docs, [projectId]: doc } });
                return doc;
            },
            removeProjects: (ids) =>
                set((state) => {
                    const docs = { ...state.docs };
                    ids.forEach((id) => delete docs[id]);
                    return { docs };
                }),
            saveScript: (projectId, patch) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => updateScript(doc, patch)) })),
            createCharacter: (projectId) => {
                const id = nanoid();
                const now = new Date().toISOString();
                set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => { const issued = issueProductionCode(doc, "CHR"); return addCharacter(issued.doc, { id, code: issued.code, name: "", summary: "", updatedAt: now }); }) }));
                return id;
            },
            saveCharacter: (projectId, id, patch) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => updateCharacter(doc, id, patch)) })),
            deleteCharacter: (projectId, id) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => removeCharacter(doc, id)) })),
            createScene: (projectId) => {
                const id = nanoid();
                const now = new Date().toISOString();
                set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => { const issued = issueProductionCode(doc, "SCN"); return addScene(issued.doc, { id, code: issued.code, name: "", summary: "", updatedAt: now }); }) }));
                return id;
            },
            saveScene: (projectId, id, patch) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => updateScene(doc, id, patch)) })),
            deleteScene: (projectId, id) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => removeScene(doc, id)) })),
            createShot: (projectId) => {
                const id = nanoid();
                const now = new Date().toISOString();
                set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => { const issued = issueProductionCode(doc, "SHT"); return addShot(issued.doc, { id, code: issued.code, title: "", prompt: "", characterIds: [], updatedAt: now }); }) }));
                return id;
            },
            saveShot: (projectId, id, patch) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => updateShot(doc, id, patch)) })),
            deleteShot: (projectId, id) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => removeShot(doc, id)) })),
            reorderShot: (projectId, id, direction) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => moveShot(doc, id, direction)) })),
            createMedia: (projectId, bucket, media) => {
                const id = nanoid();
                const now = new Date().toISOString();
                set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => { const issued = issueProductionCode(doc, bucket === "audios" ? "AUD" : bucket === "clips" ? "CLP" : "FIN"); return addMedia(issued.doc, bucket, { ...media, id, code: issued.code, updatedAt: now }); }) }));
                return id;
            },
            saveMedia: (projectId, bucket, id, patch) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => updateMedia(doc, bucket, id, patch)) })),
            deleteMedia: (projectId, bucket, id) => set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => removeMedia(doc, bucket, id)) })),
            ingest: (projectId, items) => {
                const current = get().docs[projectId] ?? createProduction(projectId);
                const saved = ingestAgentAssets(current, items);
                if (saved.doc !== current) set((state) => ({ docs: { ...state.docs, [projectId]: saved.doc } }));
                return saved.records;
            },
            replaceDoc: (projectId, doc) => set((state) => (state.docs[projectId] === doc ? state : { docs: { ...state.docs, [projectId]: doc } })),
            collectFinal: (projectId, clipId) => {
                const id = nanoid();
                const before = get().docs[projectId]?.finals.length ?? 0;
                set((state) => ({ docs: withDoc(state.docs, projectId, (doc) => collectFinalFromClip(doc, clipId, id)) }));
                return (get().docs[projectId]?.finals.length ?? 0) > before ? id : undefined;
            },
        }),
        {
            name: STORAGE_KEY,
            storage,
            partialize: (state) => ({ docs: state.docs }) as StorageValue<ProductionStore>["state"],
            onRehydrateStorage: () => () => {
                useProductionStore.setState({ hydrated: true });
            },
        },
    ),
);
