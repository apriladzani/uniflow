import React, { useMemo, useState } from "react";
import {
  buildAiPrompt,
  parseStoryboardText,
  type ParseOptions,
  type ParsedScene,
} from "./storyboardImport";

export type ImportMode = "append" | "replace";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Dipanggil saat klik "Import". Simpan scene ke backend di sini. */
  onImport: (scenes: ParsedScene[], mode: ImportMode) => Promise<void> | void;
  /** Jumlah scene yang sudah ada (untuk pilihan Tambahkan / Ganti) */
  existingSceneCount?: number;
  /** Info konten untuk mengisi prompt AI otomatis */
  content?: { title?: string; platform?: string; format?: string; pillar?: string; brief?: string };
  /** Samakan dengan opsi dropdown di form scene + daftar team */
  options?: ParseOptions;
}

const fmt = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

export default function ImportStoryboardModal({
  open,
  onClose,
  onImport,
  existingSceneCount = 0,
  content,
  options,
}: Props) {
  const [step, setStep] = useState<"prompt" | "paste">("paste");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("append");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompt = useMemo(
    () =>
      buildAiPrompt({
        ...content,
        cameraAngles: options?.cameraAngles,
        transitions: options?.transitions,
        members: options?.members?.map((m) => m.name),
      }),
    [content, options],
  );

  const result = useMemo(() => parseStoryboardText(text, options), [text, options]);
  const selected = result.scenes.filter((s) => !excluded.has(s.order));
  const total = selected.reduce((a, s) => a + s.durationSeconds, 0);

  if (!open) return null;

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const toggle = (order: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(order) ? next.delete(order) : next.add(order);
      return next;
    });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      // nomori ulang supaya urutan rapi setelah ada scene yang di-uncheck
      const offset = mode === "append" ? existingSceneCount : 0;
      const renumbered = selected.map((s, i) => ({
        ...s,
        order: offset + i + 1,
        title: s.title.replace(/^Scene\s*\d+/i, `Scene ${offset + i + 1}`),
      }));
      await onImport(renumbered, mode);
      setText("");
      setExcluded(new Set());
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Gagal menyimpan scene.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-7 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Import Storyboard dari AI</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Paste hasil dari ChatGPT / Claude / Gemini, otomatis dipecah jadi Scene 1, 2, 3…
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Tutup">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-7 pt-4">
          {([
            ["prompt", "1. Salin Prompt untuk AI"],
            ["paste", "2. Paste Hasil AI"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStep(k)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                step === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
          {step === "prompt" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Salin prompt ini ke AI favoritmu supaya hasilnya keluar dengan format yang pasti terbaca. Format lain
                (tabel, JSON, atau teks bebas berlabel) juga tetap bisa dicoba.
              </p>
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700">
                {prompt}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={copyPrompt}
                  className="rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-yellow-300"
                >
                  {copied ? "✓ Tersalin" : "Salin Prompt"}
                </button>
                <button
                  onClick={() => setStep("paste")}
                  className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Lanjut paste hasil →
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
              {/* Input */}
              <div className="flex flex-col">
                <label className="mb-1.5 text-sm font-semibold text-slate-700">Teks storyboard dari AI</label>
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setExcluded(new Set());
                  }}
                  placeholder={"SCENE 1: Hook\nDuration: 5\nCamera Angle: Close-Up\nTransition: Cut\nVisual Direction: ...\nVoice-Over: ...\n\nSCENE 2: ..."}
                  className="min-h-[420px] flex-1 resize-none rounded-2xl border border-slate-200 p-4 font-mono text-[13px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
                />
              </div>

              {/* Preview */}
              <div className="flex min-h-0 flex-col">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">Preview</span>
                  {result.scenes.length > 0 && (
                    <>
                      <span className="rounded-lg border border-yellow-300 bg-yellow-50 px-2 py-0.5 font-mono text-xs font-semibold text-slate-800">
                        {selected.length} scene · {total} detik ({fmt(total)})
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        format: {result.format}
                      </span>
                    </>
                  )}
                </div>

                {result.scenes.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                    {text.trim()
                      ? result.warnings[0]?.message
                      : "Scene akan muncul di sini setelah kamu paste teks dari AI."}
                  </div>
                ) : (
                  <div className="space-y-2 overflow-y-auto pr-1">
                    {result.scenes.map((s) => {
                      const off = excluded.has(s.order);
                      const isOpen = expanded === s.order;
                      const warns = result.warnings.filter((w) => w.scene === s.order);
                      return (
                        <div
                          key={s.order}
                          className={`rounded-2xl border p-3.5 transition ${
                            off ? "border-slate-100 bg-slate-50 opacity-50" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={!off}
                              onChange={() => toggle(s.order)}
                              className="mt-1 h-4 w-4 accent-yellow-400"
                            />
                            <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : s.order)}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold text-slate-900">{s.title}</span>
                                <span className="shrink-0 font-mono text-xs text-slate-500">{s.durationSeconds}s</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                                <Chip>{s.cameraAngle}</Chip>
                                <Chip>{s.transition}</Chip>
                                {s.assignedMemberName && <Chip>👤 {s.assignedMemberName}</Chip>}
                                {warns.length > 0 && (
                                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700">⚠ {warns.length}</span>
                                )}
                              </div>
                              {!isOpen && (s.voiceOver || s.visualDirection) && (
                                <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">{s.voiceOver || s.visualDirection}</p>
                              )}
                            </button>
                          </div>
                          {isOpen && (
                            <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 pl-7 text-xs">
                              <Field label="Main Visual Direction & Blocking" v={s.visualDirection} />
                              <Field label="A-Roll Direction" v={s.aRollDirection} />
                              <Field label="B-Roll Direction" v={s.bRollDirection} />
                              <Field label="Voice-Over / Audio Narration" v={s.voiceOver} />
                              <Field label="On-Screen Text" v={s.onScreenText} />
                              <Field label="Legacy Footage Note" v={s.legacyFootageNote} />
                              <Field label="Editor Notes" v={s.editorNotes} />
                              {warns.map((w, i) => (
                                <p key={i} className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">⚠ {w.message}</p>
                              ))}
                            </dl>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-7 py-4">
          <div className="flex items-center gap-4 text-sm text-slate-600">
            {existingSceneCount > 0 && (
              <>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} className="accent-yellow-400" />
                  Tambahkan setelah {existingSceneCount} scene
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-yellow-400" />
                  Ganti semua scene
                </label>
              </>
            )}
            {error && <span className="text-red-600">{error}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              disabled={!selected.length || saving}
              onClick={submit}
              className="rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Menyimpan…" : `Import ${selected.length || ""} Scene`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">{children}</span>;
}

function Field({ label, v }: { label: string; v: string }) {
  if (!v) return null;
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-slate-800">{v}</dd>
    </div>
  );
}
