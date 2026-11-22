import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { Clapperboard, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import {
    activeShots,
    addDirectorShot,
    directorSize,
    formatTimecode,
    mediaReady,
    patchDirectorShot,
    planDirectorUploads,
    removeDirectorShot,
    selectDirectorShot,
    selectedShot,
    shotRanges,
    type DirectorMedia,
    type DirectorProject,
    type DirectorSeconds,
    type DirectorShot,
} from "@/lib/canvas/director-desk";
import { runDirectorProject } from "@/services/api/director-desk";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasDirectorDesk({
    project,
    linkedImages,
    onChange,
    onClose,
}: {
    project: DirectorProject;
    linkedImages: DirectorMedia[];
    onChange: (project: DirectorProject) => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = useConfigStore((state) => state.config);
    const fileRef = useRef<HTMLInputElement>(null);
    const pendingUpload = useRef<((media: DirectorMedia) => void) | null>(null);
    const latest = useRef(project);
    latest.current = project;
    const shots = activeShots(project);
    const selected = selectedShot(project);
    const ranges = shotRanges(shots);
    const selectedIndex = Math.max(0, shots.findIndex((shot) => shot.id === selected.id));
    const selectedRange = ranges[selectedIndex] || { start: 0, end: selected.seconds };
    const totalSeconds = shots.reduce((sum, shot) => sum + shot.seconds, 0);
    const runCount = shots.filter((shot) => shot.run).length;
    const size = directorSize(project);
    const pixel = `${size.width}×${size.height}`;
    const hairline = `1px solid ${theme.node.stroke}`;
    const plan = planDirectorUploads(project, linkedImages);

    function chooseFile(current: DirectorMedia | undefined, apply: (media: DirectorMedia) => void) {
        pendingUpload.current = (media) => apply({ ...media, id: current?.id || media.id, name: current?.name || media.name });
        fileRef.current?.click();
    }

    async function onPickedFile(file?: File) {
        const apply = pendingUpload.current;
        pendingUpload.current = null;
        if (!file || !apply) return;
        try {
            const uploaded = await uploadImage(file);
            apply({
                id: `media-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name.replace(/\.[^.]+$/, ""),
                storageKey: uploaded.storageKey,
                url: uploaded.url,
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.director.uploadFailed"));
        }
    }

    async function generate() {
        const started = latest.current;
        onChange({ ...started, busy: true, receipt: "" });
        try {
            const result = await runDirectorProject({ config, project: started, linked: linkedImages });
            const current = latest.current;
            const key = started.mode === "r2v" ? "r2v" : "fl2v";
            const done = new Map(result[key].map((shot) => [shot.id, shot]));
            onChange({
                ...current,
                busy: false,
                receipt: result.receipt,
                [key]: current[key].map((shot) => {
                    const video = done.get(shot.id);
                    return video?.videoStorageKey ? { ...shot, status: "generated" as const, videoStorageKey: video.videoStorageKey, videoUrl: video.videoUrl } : shot;
                }),
            });
        } catch (error) {
            const text = error instanceof Error ? error.message : t("canvas.director.failed");
            onChange({ ...latest.current, busy: false, receipt: text });
            message.error(text);
        }
    }

    const framePlan = plan.shots.find((shot) => shot.id === selected.id);

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,.35)" }} onMouseDown={onClose}>
            <div
                className="flex max-h-full w-full max-w-[1120px] flex-col overflow-hidden rounded-lg"
                style={{ background: theme.node.panel, color: theme.node.text, border: hairline }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: hairline, background: theme.toolbar.panel }}>
                    <input
                        value={project.title}
                        onChange={(event) => onChange({ ...project, title: event.target.value, receipt: "" })}
                        className="w-28 bg-transparent text-sm font-semibold outline-none"
                        aria-label={t("canvas.director.title")}
                    />
                    <span className="text-xs" style={{ color: theme.node.muted }}>{totalSeconds}s · {shots.length} {t("canvas.director.segments")} · {project.mode === "r2v" ? "ref2va" : "fl2va"}</span>
                    <Pill active={project.mode === "r2v"} onClick={() => onChange({ ...project, mode: "r2v", receipt: "" })}>{t("canvas.director.reference")}</Pill>
                    <Pill active={project.mode === "fl2v"} onClick={() => onChange({ ...project, mode: "fl2v", receipt: "" })}>{t("canvas.director.frames")}</Pill>
                    <Pill active={project.aspect === "16:9"} onClick={() => onChange({ ...project, aspect: "16:9", receipt: "" })}>16:9</Pill>
                    <Pill active={project.aspect === "9:16"} onClick={() => onChange({ ...project, aspect: "9:16", receipt: "" })}>9:16</Pill>
                    <select
                        value={project.megapixel}
                        onChange={(event) => onChange({ ...project, megapixel: event.target.value as DirectorProject["megapixel"], receipt: "" })}
                        className="h-7 rounded border bg-transparent px-2 text-xs"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        aria-label={t("canvas.director.size")}
                    >
                        {(["0.4", "0.5", "0.98"] as const).map((value) => {
                            const item = directorSize({ megapixel: value, aspect: project.aspect });
                            return <option key={value} value={value}>{item.width}×{item.height}</option>;
                        })}
                    </select>
                    <div className="flex-1" />
                    <button type="button" disabled={runCount === 0 || project.busy} onClick={() => void generate()} className="rounded px-3 py-1 text-sm font-medium disabled:opacity-40" style={{ background: theme.node.text, color: theme.node.panel }}>
                        {project.busy ? t("canvas.director.running") : t("canvas.director.generate", { count: runCount })}
                    </button>
                    <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded hover:bg-black/5 dark:hover:bg-white/10" aria-label={t("canvas.director.close")}>
                        <X className="size-4" />
                    </button>
                </div>

                <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "168px minmax(0, 1fr) 268px" }}>
                    <div className="thin-scrollbar space-y-2.5 overflow-y-auto p-3" style={{ borderRight: hairline, background: theme.toolbar.panel }}>
                        {project.mode === "r2v" ? (
                            <>
                                <p className="text-xs" style={{ color: theme.node.muted }}>{t("canvas.director.commonAssets")}</p>
                                {project.commonAssets.map((asset, index) => (
                                    <AssetCard key={asset.id} media={plan.common[index] || asset} slot={`Picture ${index + 1}`} onClick={() => chooseFile(asset, (media) => onChange({ ...project, commonAssets: project.commonAssets.map((item) => item.id === asset.id ? media : item), receipt: "" }))} />
                                ))}
                                {project.commonAssets.length < 3 ? <TextButton label={t("canvas.director.addAsset")} onClick={() => onChange({ ...project, commonAssets: [...project.commonAssets, { id: `asset-${project.commonAssets.length + 1}`, name: t("canvas.director.assetName", { index: project.commonAssets.length + 1 }) }], receipt: "" })} /> : null}
                                {selected.extra || framePlan?.extra ? (
                                    <AssetCard media={selected.extra && mediaReady(selected.extra) ? selected.extra : framePlan?.extra || selected.extra || { id: "extra", name: t("canvas.director.extra") }} slot={t("canvas.director.extraSlot")} onClick={() => chooseFile(selected.extra, (media) => onChange(patchDirectorShot(project, selected.id, { extra: media })))} />
                                ) : (
                                    <TextButton label={t("canvas.director.addExtra")} onClick={() => onChange(patchDirectorShot(project, selected.id, { extra: { id: `extra-${selected.id}`, name: t("canvas.director.extra") } }))} />
                                )}
                                <p className="text-xs" style={{ color: theme.node.muted }}>{t("canvas.director.commonPrompt")}</p>
                                <textarea value={project.commonPrompt} rows={4} onChange={(event) => onChange({ ...project, commonPrompt: event.target.value, receipt: "" })} className="w-full resize-none bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
                            </>
                        ) : (
                            <>
                                <p className="text-xs" style={{ color: theme.node.muted }}>{t("canvas.director.thisShot")}</p>
                                <AssetCard media={mediaReady(selected.start) ? selected.start : framePlan?.start || selected.start} slot={t("canvas.director.start")} fallback={selected.continuity && !mediaReady(selected.start) ? t("canvas.director.previousTail") : t("canvas.director.noStart")} onClick={() => chooseFile(selected.start, (media) => onChange(patchDirectorShot(project, selected.id, { start: media })))} />
                                <AssetCard media={mediaReady(selected.end) ? selected.end : framePlan?.end || selected.end} slot={t("canvas.director.end")} fallback={t("canvas.director.noEnd")} onClick={() => chooseFile(selected.end, (media) => onChange(patchDirectorShot(project, selected.id, { end: media })))} />
                                <p className="text-xs leading-5" style={{ color: theme.node.muted }}>{t("canvas.director.frameHint")}</p>
                            </>
                        )}
                        {linkedImages.length ? (
                            <p className="text-xs leading-5" style={{ color: theme.node.muted }}>{t("canvas.director.linkedHint")}</p>
                        ) : null}
                    </div>

                    <div className="thin-scrollbar flex min-w-0 flex-col gap-3 overflow-y-auto p-3.5">
                        <div className="mx-auto w-full" style={{ maxWidth: project.aspect === "16:9" ? "100%" : 210 }}>
                            <Preview shot={selected} pixel={pixel} />
                            <div className="flex items-center gap-2 px-2 py-1.5 text-xs" style={{ background: theme.toolbar.panel }}>
                                <span>{String(selectedIndex + 1).padStart(2, "0")}  {selected.title}</span>
                                <span className="flex-1" />
                                <span style={{ color: theme.node.muted }}>{formatTimecode(selectedRange.start)} – {formatTimecode(selectedRange.end)}</span>
                            </div>
                        </div>
                        <div>
                            <div className="mb-1.5 flex items-center">
                                <p className="text-xs" style={{ color: theme.node.muted }}>{t("canvas.director.storyboard")}</p>
                                <span className="flex-1" />
                                <TextButton label={t("canvas.director.addShot")} onClick={() => onChange(addDirectorShot(project))} />
                            </div>
                            <div className="flex gap-2 overflow-x-auto">
                                {shots.map((shot, index) => {
                                    const active = shot.id === selected.id;
                                    return (
                                        <button key={shot.id} type="button" onClick={() => onChange(selectDirectorShot(project, shot.id))} className="w-[148px] shrink-0 text-left" style={{ border: active ? `1px solid ${theme.node.activeStroke}` : hairline, background: theme.toolbar.panel, color: theme.node.text }}>
                                            <Preview shot={shot} compact />
                                            <div className="px-2 py-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <input type="checkbox" checked={shot.run} onClick={(event) => event.stopPropagation()} onChange={(event) => onChange(patchDirectorShot(project, shot.id, { run: event.target.checked }))} aria-label={shot.title} />
                                                    <span className="truncate text-xs font-semibold">{String(index + 1).padStart(2, "0")} {shot.title}</span>
                                                </div>
                                                <p className="text-xs" style={{ color: theme.node.muted }}>{shot.seconds}s · {shot.status === "generated" ? t("canvas.director.done") : t("canvas.director.pending")}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="thin-scrollbar flex flex-col gap-3 overflow-y-auto p-3.5" style={{ borderLeft: hairline, background: theme.toolbar.panel }}>
                        <div>
                            <p className="text-xs" style={{ color: theme.node.muted }}>{t("canvas.director.current")}</p>
                            <input value={selected.title} onChange={(event) => onChange(patchDirectorShot(project, selected.id, { title: event.target.value }))} className="mt-1 w-full bg-transparent text-sm font-semibold outline-none" aria-label={t("canvas.director.shotTitle")} />
                        </div>
                        <div className="flex gap-1.5">
                            {([5, 10, 15] as DirectorSeconds[]).map((seconds) => (
                                <Pill key={seconds} active={selected.seconds === seconds} onClick={() => onChange(patchDirectorShot(project, selected.id, { seconds }))}>{`${seconds}s`}</Pill>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs">
                            <span className="flex-1">{t("canvas.director.continuity")}</span>
                            <input type="checkbox" checked={selected.continuity} disabled={selectedIndex === 0} onChange={(event) => onChange(patchDirectorShot(project, selected.id, { continuity: event.target.checked }))} />
                        </label>
                        <p className="text-xs leading-5" style={{ color: theme.node.muted }}>{t("canvas.director.continuityHint")}</p>
                        <p className="text-xs" style={{ color: theme.node.muted }}>{t("canvas.director.prompt")}</p>
                        <textarea value={selected.prompt} rows={7} onChange={(event) => onChange(patchDirectorShot(project, selected.id, { prompt: event.target.value }))} className="w-full resize-none bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
                        <p className="text-xs" style={{ color: theme.node.muted }}>{selected.status === "generated" ? t("canvas.director.regenerateHint") : t("canvas.director.emptyHint")}</p>
                        {shots.length > 1 ? <TextButton label={t("canvas.director.removeShot")} onClick={() => onChange(removeDirectorShot(project, selected.id))} /> : null}
                    </div>
                </div>

                <div className="px-3.5 pb-3 pt-2" style={{ borderTop: hairline, background: theme.canvas.background }}>
                    <div className="flex items-center text-xs" style={{ color: theme.node.muted }}>
                        <span>{t("canvas.director.timeline")}</span>
                        <span className="flex-1" />
                        <span>{formatTimecode(0)} – {formatTimecode(totalSeconds)}</span>
                    </div>
                    <div className="relative mt-1.5 flex h-[52px] gap-1">
                        {shots.map((shot, index) => {
                            const active = shot.id === selected.id;
                            return (
                                <button key={shot.id} type="button" onClick={() => onChange(selectDirectorShot(project, shot.id))} className="h-full min-w-0 px-2 py-1.5 text-left" style={{ flex: shot.seconds, border: active ? `1px solid ${theme.node.activeStroke}` : hairline, background: shot.run ? theme.toolbar.panel : "transparent", opacity: shot.run ? 1 : 0.45, color: theme.node.text }}>
                                    <div className="truncate text-xs font-semibold">{String(index + 1).padStart(2, "0")}  {shot.title}</div>
                                    <div className="text-[11px]" style={{ color: theme.node.muted }}>{shot.seconds}s</div>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <p className="px-3.5 py-2 text-xs" style={{ color: theme.node.muted }}>{project.receipt || t("canvas.director.idleReceipt", { pixel })}</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void onPickedFile(file);
                }} />
            </div>
        </div>
    );
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <button type="button" onClick={onClick} className="rounded px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10" style={{ border: active ? `1px solid ${theme.node.activeStroke}` : "1px solid transparent", color: theme.node.text }}>
            {children}
        </button>
    );
}

function TextButton({ label, onClick }: { label: string; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <button type="button" onClick={onClick} className="text-left text-xs hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }}>{label}</button>;
}

function AssetCard({ media, slot, fallback, onClick }: { media?: DirectorMedia; slot: string; fallback?: string; onClick: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const url = useStillUrl(media);
    return (
        <button type="button" onClick={onClick} className="block w-full text-left" style={{ border: `1px solid ${theme.node.stroke}`, background: theme.node.panel }}>
            {url ? <img src={url} alt="" className="block h-[84px] w-full object-cover" /> : <div className="grid h-[84px] place-items-center text-xs" style={{ color: theme.node.faint }}>{fallback || media?.name || slot}</div>}
            <div className="px-2 py-1.5">
                <p className="truncate text-xs font-semibold">{media?.name || fallback}</p>
                <p className="text-xs" style={{ color: theme.node.muted }}>{slot}</p>
            </div>
        </button>
    );
}

function Preview({ shot, compact, pixel }: { shot: DirectorShot; compact?: boolean; pixel?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const videoUrl = useVideoUrl(shot);
    const still = useStillUrl(shot.start || shot.extra);
    return (
        <div className="relative" style={{ background: theme.canvas.background, height: compact ? 84 : 220 }}>
            {videoUrl ? <video src={videoUrl} className="h-full w-full object-cover" muted playsInline /> : still ? <img src={still} alt="" className="h-full w-full object-cover" /> : (
                <div className="grid h-full place-items-center" style={{ color: theme.node.faint }}>
                    <Clapperboard className="size-5" />
                </div>
            )}
            {pixel && !compact ? <span className="absolute bottom-2 right-2 text-[11px]" style={{ color: theme.node.muted }}>{pixel}</span> : null}
        </div>
    );
}

function useStillUrl(media?: DirectorMedia) {
    const [url, setUrl] = useState(media?.url || "");
    useEffect(() => {
        let alive = true;
        if (media?.url) {
            setUrl(media.url);
            return () => { alive = false; };
        }
        if (!media?.storageKey) {
            setUrl("");
            return () => { alive = false; };
        }
        void resolveImageUrl(media.storageKey).then((next) => { if (alive) setUrl(next); });
        return () => { alive = false; };
    }, [media?.storageKey, media?.url]);
    return url;
}

function useVideoUrl(shot: DirectorShot) {
    const [url, setUrl] = useState(shot.videoUrl || "");
    useEffect(() => {
        let alive = true;
        if (shot.videoUrl) {
            setUrl(shot.videoUrl);
            return () => { alive = false; };
        }
        if (!shot.videoStorageKey) {
            setUrl("");
            return () => { alive = false; };
        }
        void resolveMediaUrl(shot.videoStorageKey).then((next) => { if (alive) setUrl(next); });
        return () => { alive = false; };
    }, [shot.videoStorageKey, shot.videoUrl]);
    return url;
}
