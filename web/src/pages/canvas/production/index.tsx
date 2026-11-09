import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Select } from "antd";
import { useTranslation } from "react-i18next";

import type { ProductionDoc, ProductionMedia } from "@/lib/canvas/production";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useProductionStore } from "@/stores/canvas/use-production-store";

type Tab = "script" | "character" | "scene" | "shot" | "audio" | "clip" | "final";
type MediaBucket = "audios" | "clips" | "finals";

const tabs: Tab[] = ["script", "character", "scene", "shot", "audio", "clip", "final"];

export default function CanvasProductionPage() {
    const { id = "" } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [tab, setTab] = useState<Tab>("script");
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const project = useCanvasStore((state) => state.projects.find((item) => item.id === id));
    const productionHydrated = useProductionStore((state) => state.hydrated);
    const doc = useProductionStore((state) => state.docs[id]);
    const ensure = useProductionStore((state) => state.ensure);

    useEffect(() => {
        if (productionHydrated && id) ensure(id);
    }, [ensure, id, productionHydrated]);

    if (!canvasHydrated || !productionHydrated || !doc) {
        return <main className="grid h-full place-items-center text-sm opacity-60">{t("canvas.production.loading")}</main>;
    }
    if (!project) {
        return (
            <main className="grid h-full place-items-center gap-3 text-sm">
                <p>{t("canvas.production.missing")}</p>
                <button type="button" className="rounded-md px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => navigate("/canvas")}>
                    {t("canvas.production.missingAction")}
                </button>
            </main>
        );
    }

    const counts: Record<Tab, number | undefined> = {
        script: undefined,
        character: doc.characters.length,
        scene: doc.scenes.length,
        shot: doc.shots.length,
        audio: doc.audios.length,
        clip: doc.clips.length,
        final: doc.finals.length,
    };

    return (
        <main className="flex h-full flex-col bg-background text-foreground">
            <header className="flex h-14 shrink-0 items-center gap-3 px-4">
                <button type="button" className="rounded-md px-2 py-1 text-sm opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={() => navigate(`/canvas/${id}`)}>
                    {t("canvas.production.back")}
                </button>
                <h1 className="truncate text-lg font-semibold">{project.title}</h1>
                <span className="text-sm opacity-45">{t("canvas.production.open")}</span>
            </header>
            <nav className="flex shrink-0 gap-1 overflow-x-auto px-4">
                {tabs.map((item) => (
                    <button
                        key={item}
                        type="button"
                        className={`shrink-0 border-b-2 px-3 py-2 text-sm transition ${tab === item ? "border-current font-medium" : "border-transparent opacity-55 hover:opacity-100"}`}
                        onClick={() => setTab(item)}
                    >
                        {t(`canvas.production.${item}`)}
                        {counts[item] === undefined ? "" : ` ${counts[item]}`}
                    </button>
                ))}
            </nav>
            <section className="min-h-0 flex-1 overflow-auto px-4 py-5">
                {tab === "script" ? <ScriptPane projectId={id} doc={doc} /> : null}
                {tab === "character" ? <PicturePane projectId={id} kind="character" doc={doc} onError={() => message.error(t("canvas.production.uploadFailed"))} /> : null}
                {tab === "scene" ? <PicturePane projectId={id} kind="scene" doc={doc} onError={() => message.error(t("canvas.production.uploadFailed"))} /> : null}
                {tab === "shot" ? <ShotPane projectId={id} doc={doc} onError={() => message.error(t("canvas.production.uploadFailed"))} /> : null}
                {tab === "audio" ? <MediaPane projectId={id} bucket="audios" doc={doc} onError={() => message.error(t("canvas.production.uploadFailed"))} /> : null}
                {tab === "clip" ? <MediaPane projectId={id} bucket="clips" doc={doc} onError={() => message.error(t("canvas.production.uploadFailed"))} /> : null}
                {tab === "final" ? <MediaPane projectId={id} bucket="finals" doc={doc} onError={() => message.error(t("canvas.production.uploadFailed"))} /> : null}
            </section>
        </main>
    );
}

function ScriptPane({ projectId, doc }: { projectId: string; doc: ProductionDoc }) {
    const { t } = useTranslation();
    const saveScript = useProductionStore((state) => state.saveScript);
    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <p className="text-xs opacity-50">{doc.script.code}</p>
            <Field label={t("canvas.production.scriptTitle")} value={doc.script.title} onChange={(title) => saveScript(projectId, { title })} />
            <Field label={t("canvas.production.scriptBody")} value={doc.script.content} placeholder={t("canvas.production.scriptPlaceholder")} multiline onChange={(content) => saveScript(projectId, { content })} />
        </div>
    );
}

function PicturePane({ projectId, kind, doc, onError }: { projectId: string; kind: "character" | "scene"; doc: ProductionDoc; onError: () => void }) {
    const { t } = useTranslation();
    const createCharacter = useProductionStore((state) => state.createCharacter);
    const saveCharacter = useProductionStore((state) => state.saveCharacter);
    const deleteCharacter = useProductionStore((state) => state.deleteCharacter);
    const createScene = useProductionStore((state) => state.createScene);
    const saveScene = useProductionStore((state) => state.saveScene);
    const deleteScene = useProductionStore((state) => state.deleteScene);
    const items = kind === "character" ? doc.characters : doc.scenes;
    const save = kind === "character" ? saveCharacter : saveScene;
    const remove = kind === "character" ? deleteCharacter : deleteScene;

    const chooseImage = async (itemId: string, file?: File) => {
        if (!file) return;
        try {
            const image = await uploadImage(file);
            save(projectId, itemId, { imageKey: image.storageKey });
        } catch {
            onError();
        }
    };

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AddCard label={t(kind === "character" ? "canvas.production.addCharacter" : "canvas.production.addScene")} onClick={() => (kind === "character" ? createCharacter(projectId) : createScene(projectId))} />
            {items.map((item) => (
                <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
                    <p className="text-xs opacity-50">{item.code}</p>
                    <div className={kind === "character" ? "aspect-[3/4] overflow-hidden rounded-lg" : "aspect-video overflow-hidden rounded-lg"}>
                        <StoredImage storageKey={item.imageKey} alt={item.name} />
                    </div>
                    <Field label={t("canvas.production.name")} value={item.name} placeholder={t("canvas.production.unnamed")} onChange={(name) => save(projectId, item.id, { name })} />
                    <Field label={t("canvas.production.summary")} value={item.summary} multiline onChange={(summary) => save(projectId, item.id, { summary })} />
                    <div className="flex items-center justify-between gap-2">
                        <FileButton accept="image/*" label={item.imageKey ? t("canvas.production.replaceImage") : t("canvas.production.chooseImage")} onFile={(file) => void chooseImage(item.id, file)} />
                        <TextButton label={t("canvas.production.delete")} onClick={() => remove(projectId, item.id)} />
                    </div>
                </article>
            ))}
        </div>
    );
}

function ShotPane({ projectId, doc, onError }: { projectId: string; doc: ProductionDoc; onError: () => void }) {
    const { t } = useTranslation();
    const createShot = useProductionStore((state) => state.createShot);
    const saveShot = useProductionStore((state) => state.saveShot);
    const deleteShot = useProductionStore((state) => state.deleteShot);
    const reorderShot = useProductionStore((state) => state.reorderShot);
    const chooseImage = async (shotId: string, file?: File) => {
        if (!file) return;
        try {
            const image = await uploadImage(file);
            saveShot(projectId, shotId, { imageKey: image.storageKey });
        } catch {
            onError();
        }
    };

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <AddCard label={t("canvas.production.addShot")} onClick={() => createShot(projectId)} />
            {doc.shots.map((shot, index) => (
                <article key={shot.id} className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
                    <div className="flex items-center justify-between gap-2 text-xs opacity-60">
                        <span>{shot.code || index + 1}</span>
                        <span className="flex gap-2">
                            <TextButton label={t("canvas.production.moveUp")} onClick={() => reorderShot(projectId, shot.id, -1)} />
                            <TextButton label={t("canvas.production.moveDown")} onClick={() => reorderShot(projectId, shot.id, 1)} />
                        </span>
                    </div>
                    <div className="aspect-video overflow-hidden rounded-lg">
                        <StoredImage storageKey={shot.imageKey} alt={shot.title} />
                    </div>
                    <Field label={t("canvas.production.name")} value={shot.title} placeholder={t("canvas.production.unnamed")} onChange={(title) => saveShot(projectId, shot.id, { title })} />
                    <Field label={t("canvas.production.prompt")} value={shot.prompt} multiline onChange={(prompt) => saveShot(projectId, shot.id, { prompt })} />
                    <RelationSelect label={t("canvas.production.characters")} mode="multiple" value={shot.characterIds} options={doc.characters.map((item) => ({ value: item.id, label: item.name || t("canvas.production.unnamed") }))} onChange={(characterIds) => saveShot(projectId, shot.id, { characterIds: Array.isArray(characterIds) ? characterIds : [] })} />
                    <RelationSelect label={t("canvas.production.sceneOfShot")} value={shot.sceneId} options={doc.scenes.map((item) => ({ value: item.id, label: item.name || t("canvas.production.unnamed") }))} onChange={(sceneId) => saveShot(projectId, shot.id, { sceneId: typeof sceneId === "string" ? sceneId : undefined })} />
                    <RelationSelect label={t("canvas.production.audioOfShot")} value={shot.audioId} options={doc.audios.map((item) => ({ value: item.id, label: item.title || t("canvas.production.unnamed") }))} onChange={(audioId) => saveShot(projectId, shot.id, { audioId: typeof audioId === "string" ? audioId : undefined })} />
                    <RelationSelect label={t("canvas.production.clipOfShot")} value={shot.clipId} options={doc.clips.map((item) => ({ value: item.id, label: item.title || t("canvas.production.unnamed") }))} onChange={(clipId) => saveShot(projectId, shot.id, { clipId: typeof clipId === "string" ? clipId : undefined })} />
                    <div className="flex items-center justify-between gap-2">
                        <FileButton accept="image/*" label={shot.imageKey ? t("canvas.production.replaceImage") : t("canvas.production.chooseImage")} onFile={(file) => void chooseImage(shot.id, file)} />
                        <TextButton label={t("canvas.production.delete")} onClick={() => deleteShot(projectId, shot.id)} />
                    </div>
                </article>
            ))}
        </div>
    );
}

function MediaPane({ projectId, bucket, doc, onError }: { projectId: string; bucket: MediaBucket; doc: ProductionDoc; onError: () => void }) {
    const { t } = useTranslation();
    const createMedia = useProductionStore((state) => state.createMedia);
    const saveMedia = useProductionStore((state) => state.saveMedia);
    const deleteMedia = useProductionStore((state) => state.deleteMedia);
    const collectFinal = useProductionStore((state) => state.collectFinal);
    const items = doc[bucket];
    const accept = bucket === "audios" ? "audio/*" : "video/*";
    const addLabel = t(bucket === "audios" ? "canvas.production.addAudio" : bucket === "clips" ? "canvas.production.addClip" : "canvas.production.addFinal");

    const upload = async (file?: File) => {
        if (!file) return;
        try {
            const media = await uploadMediaFile(file, bucket === "audios" ? "audio" : "video");
            createMedia(projectId, bucket, { title: file.name, storageKey: media.storageKey, mimeType: media.mimeType || file.type, note: "" });
        } catch {
            onError();
        }
    };

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <AddCard label={addLabel} onClick={() => undefined} fileAccept={accept} onFile={(file) => void upload(file)} />
            {items.map((item) => (
                <MediaCard key={item.id} item={item} bucket={bucket} onChange={(patch) => saveMedia(projectId, bucket, item.id, patch)} onDelete={() => deleteMedia(projectId, bucket, item.id)} onCollect={bucket === "clips" ? () => collectFinal(projectId, item.id) : undefined} />
            ))}
        </div>
    );
}

function MediaCard({ item, bucket, onChange, onDelete, onCollect }: { item: ProductionMedia; bucket: MediaBucket; onChange: (patch: Partial<Pick<ProductionMedia, "title" | "note">>) => void; onDelete: () => void; onCollect?: () => void }) {
    const { t } = useTranslation();
    return (
        <article className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
            <p className="text-xs opacity-50">{item.code}</p>
            <StoredMedia storageKey={item.storageKey} mimeType={item.mimeType || (bucket === "audios" ? "audio/mpeg" : "video/mp4")} />
            <Field label={t("canvas.production.name")} value={item.title} onChange={(title) => onChange({ title })} />
            <Field label={t("canvas.production.note")} value={item.note} onChange={(note) => onChange({ note })} />
            <div className="flex items-center justify-between gap-2">
                {onCollect ? <TextButton label={t("canvas.production.collectFinal")} onClick={onCollect} /> : <span />}
                <TextButton label={t("canvas.production.delete")} onClick={onDelete} />
            </div>
        </article>
    );
}

function Field({ label, value, placeholder, multiline, onChange }: { label: string; value: string; placeholder?: string; multiline?: boolean; onChange: (value: string) => void }) {
    const className = "w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-white/15";
    return (
        <label className="block">
            <span className="mb-1 block text-xs opacity-60">{label}</span>
            {multiline ? (
                <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={`${className} min-h-28 resize-y`} />
            ) : (
                <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={className} />
            )}
        </label>
    );
}

function RelationSelect({ label, value, options, mode, onChange }: { label: string; value?: string | string[]; options: { value: string; label: string }[]; mode?: "multiple"; onChange: (value: string | string[] | undefined) => void }) {
    const { t } = useTranslation();
    return (
        <label className="block">
            <span className="mb-1 block text-xs opacity-60">{label}</span>
            <Select
                allowClear
                className="w-full"
                mode={mode}
                size="small"
                value={value || (mode === "multiple" ? [] : undefined)}
                placeholder={t("canvas.production.none")}
                options={options}
                onChange={(next) => onChange(next || (mode === "multiple" ? [] : undefined))}
            />
        </label>
    );
}

function AddCard({ label, onClick, fileAccept, onFile }: { label: string; onClick: () => void; fileAccept?: string; onFile?: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <button
            type="button"
            className="flex min-h-40 items-center justify-center self-start rounded-xl border border-dashed border-black/15 text-sm opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:border-white/15 dark:hover:bg-white/10"
            onClick={() => (fileAccept ? inputRef.current?.click() : onClick())}
        >
            {label}
            {fileAccept ? (
                <input
                    ref={inputRef}
                    type="file"
                    accept={fileAccept}
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file && onFile) onFile(file);
                        event.target.value = "";
                    }}
                />
            ) : null}
        </button>
    );
}

function FileButton({ accept, label, onFile }: { accept: string; label: string; onFile: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <TextButton label={label} onClick={() => inputRef.current?.click()} />
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onFile(file);
                    event.target.value = "";
                }}
            />
        </>
    );
}

function TextButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="rounded-md px-2 py-1 text-xs opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={onClick}>
            {label}
        </button>
    );
}

function StoredImage({ storageKey, alt }: { storageKey?: string; alt: string }) {
    const { t } = useTranslation();
    const [url, setUrl] = useState("");
    useEffect(() => {
        if (!storageKey) {
            setUrl("");
            return;
        }
        let alive = true;
        void resolveImageUrl(storageKey).then((value) => {
            if (alive) setUrl(value);
        });
        return () => {
            alive = false;
        };
    }, [storageKey]);
    if (!url) return <div className="grid h-full place-items-center text-xs opacity-40">{t("canvas.production.noImage")}</div>;
    return <img src={url} alt={alt || t("canvas.production.unnamed")} className="h-full w-full object-cover" />;
}

function StoredMedia({ storageKey, mimeType }: { storageKey: string; mimeType: string }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let alive = true;
        void resolveMediaUrl(storageKey).then((value) => {
            if (alive) setUrl(value);
        });
        return () => {
            alive = false;
        };
    }, [storageKey]);
    if (!url) return null;
    if (mimeType.startsWith("audio")) return <audio src={url} controls className="w-full" />;
    return <video src={url} controls className="aspect-video w-full rounded-lg bg-black" />;
}
