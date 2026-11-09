import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Select } from "antd";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ProductionDoc, ProductionMedia } from "@/lib/canvas/production";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useProductionStore } from "@/stores/canvas/use-production-store";

type Tab = "script" | "character" | "scene" | "shot" | "audio" | "clip" | "final";
type MediaBucket = "audios" | "clips" | "finals";

const tabs: Tab[] = ["script", "character", "scene", "shot", "audio", "clip", "final"];
const quietControl = "w-full bg-transparent outline-none placeholder:opacity-30";

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
            <header className="flex h-12 shrink-0 items-center gap-3 px-4">
                <button type="button" className="rounded-md px-2 py-1 text-sm opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={() => navigate(`/canvas/${id}`)}>
                    {t("canvas.production.back")}
                </button>
                <h1 className="max-w-52 truncate text-sm font-medium">{project.title}</h1>
                <nav className="ml-auto flex min-w-0 gap-0.5 overflow-x-auto">
                    {tabs.map((item) => (
                        <button
                            key={item}
                            type="button"
                            className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${tab === item ? "bg-black/[0.06] font-medium dark:bg-white/10" : "opacity-50 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"}`}
                            onClick={() => setTab(item)}
                        >
                            {t(`canvas.production.${item}`)}
                            {counts[item] === undefined ? "" : ` ${counts[item]}`}
                        </button>
                    ))}
                </nav>
            </header>
            <section className="min-h-0 flex-1 overflow-auto px-6 py-6">
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
        <div className="mx-auto flex w-full max-w-2xl flex-col pt-4">
            <p className="font-mono text-[11px] tracking-[0.16em] opacity-40">{doc.script.code}</p>
            <input
                value={doc.script.title}
                placeholder={t("canvas.production.scriptTitle")}
                onChange={(event) => saveScript(projectId, { title: event.target.value })}
                className={`${quietControl} mt-3 text-[32px] font-medium leading-tight`}
            />
            <textarea
                value={doc.script.content}
                placeholder={t("canvas.production.scriptPlaceholder")}
                onChange={(event) => saveScript(projectId, { content: event.target.value })}
                className={`${quietControl} mt-6 min-h-[58vh] resize-none text-[15px] leading-8`}
            />
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
    const aspect = kind === "character" ? "aspect-[3/4]" : "aspect-video";

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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-4 gap-y-7">
            <AddTile label={t(kind === "character" ? "canvas.production.addCharacter" : "canvas.production.addScene")} aspect={aspect} onClick={() => (kind === "character" ? createCharacter(projectId) : createScene(projectId))} />
            {items.map((item) => (
                <article key={item.id} className="flex min-w-0 flex-col gap-2">
                    <div className={`group relative overflow-hidden rounded-lg border border-black/10 dark:border-white/10 ${aspect}`}>
                        <StoredImage storageKey={item.imageKey} alt={item.name} />
                        <span className="absolute right-1 top-1 flex rounded-md bg-background/80 opacity-0 transition group-hover:opacity-100">
                            <FileButton accept="image/*" label={item.imageKey ? t("canvas.production.replaceImage") : t("canvas.production.chooseImage")} onFile={(file) => void chooseImage(item.id, file)} />
                            <TextButton label={t("canvas.production.delete")} onClick={() => remove(projectId, item.id)} />
                        </span>
                    </div>
                    <p className="font-mono text-[10px] tracking-wider opacity-40">{item.code}</p>
                    <input value={item.name} placeholder={t("canvas.production.unnamed")} onChange={(event) => save(projectId, item.id, { name: event.target.value })} className={`${quietControl} text-sm font-medium`} />
                    <input value={item.summary} placeholder={t("canvas.production.summary")} onChange={(event) => save(projectId, item.id, { summary: event.target.value })} className={`${quietControl} text-xs opacity-60`} />
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
        <div className="mx-auto flex w-full max-w-4xl flex-col">
            <div className="mb-1 flex">
                <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={() => createShot(projectId)}>
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t("canvas.production.addShot")}
                </button>
            </div>
            <ol>
                {doc.shots.map((shot, index) => (
                    <li key={shot.id} className="flex flex-col gap-4 border-b border-black/8 py-5 sm:flex-row dark:border-white/10">
                        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-black/10 sm:w-56 dark:border-white/10">
                            <StoredImage storageKey={shot.imageKey} alt={shot.title} />
                        </div>
                        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-96">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono tracking-wider opacity-40">{shot.code || index + 1}</span>
                                <span className="flex">
                                    <TextButton label={t("canvas.production.moveUp")} onClick={() => reorderShot(projectId, shot.id, -1)} />
                                    <TextButton label={t("canvas.production.moveDown")} onClick={() => reorderShot(projectId, shot.id, 1)} />
                                    <TextButton label={t("canvas.production.delete")} onClick={() => deleteShot(projectId, shot.id)} />
                                </span>
                            </div>
                            <input value={shot.title} placeholder={t("canvas.production.unnamed")} onChange={(event) => saveShot(projectId, shot.id, { title: event.target.value })} className={`${quietControl} text-sm`} />
                            <textarea value={shot.prompt} placeholder={t("canvas.production.prompt")} onChange={(event) => saveShot(projectId, shot.id, { prompt: event.target.value })} rows={2} className={`${quietControl} resize-none text-sm leading-6`} />
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <RelationSelect mode="multiple" value={shot.characterIds} options={doc.characters.map((item) => ({ value: item.id, label: item.name || t("canvas.production.unnamed") }))} placeholder={t("canvas.production.characters")} onChange={(characterIds) => saveShot(projectId, shot.id, { characterIds: Array.isArray(characterIds) ? characterIds : [] })} />
                                <RelationSelect value={shot.sceneId} options={doc.scenes.map((item) => ({ value: item.id, label: item.name || t("canvas.production.unnamed") }))} placeholder={t("canvas.production.sceneOfShot")} onChange={(sceneId) => saveShot(projectId, shot.id, { sceneId: typeof sceneId === "string" ? sceneId : undefined })} />
                                <RelationSelect value={shot.audioId} options={doc.audios.map((item) => ({ value: item.id, label: item.title || t("canvas.production.unnamed") }))} placeholder={t("canvas.production.audioOfShot")} onChange={(audioId) => saveShot(projectId, shot.id, { audioId: typeof audioId === "string" ? audioId : undefined })} />
                                <RelationSelect value={shot.clipId} options={doc.clips.map((item) => ({ value: item.id, label: item.title || t("canvas.production.unnamed") }))} placeholder={t("canvas.production.clipOfShot")} onChange={(clipId) => saveShot(projectId, shot.id, { clipId: typeof clipId === "string" ? clipId : undefined })} />
                            </div>
                            <FileButton accept="image/*" label={shot.imageKey ? t("canvas.production.replaceImage") : t("canvas.production.chooseImage")} onFile={(file) => void chooseImage(shot.id, file)} />
                        </div>
                    </li>
                ))}
            </ol>
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
        <div className="mx-auto flex w-full max-w-3xl flex-col">
            <div className="mb-1 flex">
                <AddFileButton accept={accept} label={addLabel} onFile={(file) => void upload(file)} />
            </div>
            {items.map((item) => (
                <MediaRow key={item.id} item={item} bucket={bucket} onChange={(patch) => saveMedia(projectId, bucket, item.id, patch)} onDelete={() => deleteMedia(projectId, bucket, item.id)} onCollect={bucket === "clips" ? () => collectFinal(projectId, item.id) : undefined} />
            ))}
        </div>
    );
}

function MediaRow({ item, bucket, onChange, onDelete, onCollect }: { item: ProductionMedia; bucket: MediaBucket; onChange: (patch: Partial<Pick<ProductionMedia, "title" | "note">>) => void; onDelete: () => void; onCollect?: () => void }) {
    const { t } = useTranslation();
    return (
        <article className="grid grid-cols-1 gap-3 border-b border-black/8 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] dark:border-white/10">
            <div className="flex items-start justify-between gap-3 sm:flex-col">
                <p className="font-mono text-[11px] tracking-wider opacity-40">{item.code}</p>
                <div className="flex sm:flex-col sm:items-start">
                    {onCollect ? <TextButton label={t("canvas.production.collectFinal")} onClick={onCollect} /> : null}
                    <TextButton label={t("canvas.production.delete")} onClick={onDelete} />
                </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
                <input value={item.title} placeholder={t("canvas.production.name")} onChange={(event) => onChange({ title: event.target.value })} className={`${quietControl} text-sm`} />
                <StoredMedia storageKey={item.storageKey} mimeType={item.mimeType || (bucket === "audios" ? "audio/mpeg" : "video/mp4")} />
                <input value={item.note} placeholder={t("canvas.production.note")} onChange={(event) => onChange({ note: event.target.value })} className={`${quietControl} text-xs opacity-70`} />
            </div>
        </article>
    );
}

function RelationSelect({ value, options, mode, placeholder, onChange }: { value?: string | string[]; options: { value: string; label: string }[]; mode?: "multiple"; placeholder: string; onChange: (value: string | string[] | undefined) => void }) {
    return (
        <Select
            allowClear
            className="!w-36"
            mode={mode}
            size="small"
            variant="borderless"
            value={value || (mode === "multiple" ? [] : undefined)}
            placeholder={placeholder}
            options={options}
            onChange={(next) => onChange(next || (mode === "multiple" ? [] : undefined))}
        />
    );
}

function AddTile({ label, aspect, onClick, fileAccept, onFile }: { label: string; aspect: string; onClick: () => void; fileAccept?: string; onFile?: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <button
            type="button"
            className={`flex ${aspect} w-full flex-col items-center justify-center gap-2 self-start rounded-lg border border-dashed border-black/15 text-sm opacity-55 transition hover:bg-black/5 hover:opacity-100 dark:border-white/15 dark:hover:bg-white/10`}
            onClick={() => (fileAccept ? inputRef.current?.click() : onClick())}
        >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            {label}
            {fileAccept ? <HiddenFileInput inputRef={inputRef} accept={fileAccept} onFile={onFile} /> : null}
        </button>
    );
}

function AddFileButton({ accept, label, onFile }: { accept: string; label: string; onFile: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={() => inputRef.current?.click()}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                {label}
            </button>
            <HiddenFileInput inputRef={inputRef} accept={accept} onFile={onFile} />
        </>
    );
}

function FileButton({ accept, label, onFile }: { accept: string; label: string; onFile: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <TextButton label={label} onClick={() => inputRef.current?.click()} />
            <HiddenFileInput inputRef={inputRef} accept={accept} onFile={onFile} />
        </>
    );
}

function HiddenFileInput({ inputRef, accept, onFile }: { inputRef: RefObject<HTMLInputElement | null>; accept: string; onFile?: (file: File) => void }) {
    return (
        <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && onFile) onFile(file);
                event.target.value = "";
            }}
        />
    );
}

function TextButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="rounded-md px-1.5 py-0.5 text-xs opacity-55 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={onClick}>
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
    if (!url) return <div className="h-full" aria-label={t("canvas.production.noImage")} />;
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
    if (mimeType.startsWith("audio")) return <audio src={url} controls className="h-8 w-full" />;
    return <video src={url} controls className="max-h-44 w-full rounded-md" />;
}
