/**
 * Storyboard Import — ubah teks storyboard dari AI (ChatGPT, Claude, Gemini, dll.)
 * menjadi daftar scene yang siap dimasukkan ke Storyboard Studio.
 *
 * Format yang didukung (otomatis terdeteksi):
 *  1. Teks berlabel  → "SCENE 1: Judul" lalu baris "Duration: 5", "Camera Angle: ...", dst.
 *  2. JSON           → array scene, atau { "scenes": [...] } (boleh di dalam ```json ... ```)
 *  3. Tabel Markdown → satu baris tabel = satu scene
 *
 * Label bisa Bahasa Inggris atau Indonesia (Durasi, Sudut Kamera, Narasi, Teks Layar, dll.).
 */

export interface ParsedScene {
  order: number;
  title: string;
  durationSeconds: number;
  cameraAngle: string;
  transition: string;
  /** Nama dari teks AI (mentah) */
  assignedMemberName: string;
  /** Diisi kalau nama cocok dengan salah satu member di opsi `members` */
  assignedMemberId: string | null;
  visualDirection: string;
  aRollDirection: string;
  bRollDirection: string;
  voiceOver: string;
  onScreenText: string;
  legacyFootageNote: string;
  editorNotes: string;
}

export interface ParseWarning {
  scene?: number;
  message: string;
}

export interface ParseResult {
  format: "text" | "json" | "table" | "none";
  scenes: ParsedScene[];
  warnings: ParseWarning[];
  totalDurationSeconds: number;
}

export interface ParseOptions {
  /** Samakan dengan opsi dropdown "Camera Angle" di aplikasi */
  cameraAngles?: string[];
  /** Samakan dengan opsi dropdown "Transition" di aplikasi */
  transitions?: string[];
  members?: { id: string; name: string }[];
  defaultDuration?: number;
  defaultCameraAngle?: string;
  defaultTransition?: string;
  /** Alias tambahan (mis. "high angle" → "Drone / High Angle"), menimpa alias bawaan */
  cameraAliases?: Record<string, string>;
  transitionAliases?: Record<string, string>;
}

export const DEFAULT_CAMERA_ANGLES = [
  "Extreme Close-Up",
  "Close-Up",
  "Medium Close-Up",
  "Medium Shot",
  "Medium Wide Shot",
  "Wide Shot",
  "Extreme Wide Shot",
  "Over the Shoulder",
  "Point of View",
  "High Angle",
  "Low Angle",
  "Bird's Eye View",
  "Dutch Angle",
  "Two Shot",
  "Insert / Detail",
];

export const DEFAULT_TRANSITIONS = [
  "Cut",
  "Jump Cut",
  "Match Cut",
  "J-Cut",
  "L-Cut",
  "Fade In",
  "Fade Out",
  "Fade to Black",
  "Cross Dissolve",
  "Whip Pan",
  "Zoom",
  "Slide",
  "Wipe",
];

/* ------------------------------------------------------------------ */
/* Field aliases                                                       */
/* ------------------------------------------------------------------ */

type FieldKey =
  | "title"
  | "duration"
  | "cameraAngle"
  | "transition"
  | "assigned"
  | "visualDirection"
  | "aRollDirection"
  | "bRollDirection"
  | "voiceOver"
  | "onScreenText"
  | "legacyFootageNote"
  | "editorNotes";

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  title: ["title", "scene title", "judul", "judul scene", "nama scene", "scene name"],
  duration: ["duration", "duration seconds", "durasi", "durasi detik", "length", "time", "waktu", "timing"],
  cameraAngle: ["camera angle", "camera", "angle", "shot", "shot type", "sudut kamera", "kamera", "angle kamera", "framing"],
  transition: ["transition", "transisi"],
  assigned: ["assigned member", "assigned", "assignee", "pic", "member", "penanggung jawab", "crew", "talent"],
  visualDirection: [
    "main visual direction blocking", "main visual direction", "visual direction blocking",
    "visual direction", "visual", "visuals", "blocking", "arahan visual", "visual blocking", "deskripsi visual",
  ],
  aRollDirection: ["a roll direction", "a roll", "aroll", "a roll footage"],
  bRollDirection: ["b roll direction", "b roll", "broll", "b roll footage", "cutaway"],
  voiceOver: [
    "voice over audio narration", "voice over", "voiceover", "vo", "audio narration", "audio", "narration",
    "narasi", "dialogue", "dialog", "script", "naskah", "audio narasi",
  ],
  onScreenText: ["on screen text overlay", "on screen text", "onscreen text", "overlay", "text overlay", "teks layar", "teks overlay", "caption", "text on screen", "ost"],
  legacyFootageNote: ["legacy footage note", "legacy footage", "footage note", "catatan footage", "stock footage"],
  editorNotes: ["editor notes", "editor note", "notes", "note", "catatan editor", "catatan", "editing notes", "sfx", "music", "musik"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_`#]/g, "")
    .replace(/\(([^)]*)\)/g, " $1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ALIAS_LOOKUP = new Map<string, FieldKey>();
(Object.keys(FIELD_ALIASES) as FieldKey[]).forEach((k) =>
  FIELD_ALIASES[k].forEach((a) => ALIAS_LOOKUP.set(norm(a), k)),
);

function matchField(rawKey: string): FieldKey | null {
  const n = norm(rawKey);
  if (!n) return null;
  if (ALIAS_LOOKUP.has(n)) return ALIAS_LOOKUP.get(n)!;
  // "Voice-Over (VO)" → "voice over vo", coba buang kata terakhir/awal satu per satu
  const words = n.split(" ");
  for (let len = words.length - 1; len >= 1; len--) {
    const head = words.slice(0, len).join(" ");
    if (ALIAS_LOOKUP.has(head)) return ALIAS_LOOKUP.get(head)!;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Value normalisers                                                   */
/* ------------------------------------------------------------------ */

const CAMERA_ALIASES: Record<string, string> = {
  ecu: "Extreme Close-Up", "extreme close up": "Extreme Close-Up", "extreme closeup": "Extreme Close-Up",
  cu: "Close-Up", "close up": "Close-Up", closeup: "Close-Up",
  mcu: "Medium Close-Up", "medium close up": "Medium Close-Up",
  ms: "Medium Shot", "mid shot": "Medium Shot", medium: "Medium Shot", "medium shot": "Medium Shot",
  mws: "Medium Wide Shot", "medium wide": "Medium Wide Shot", "medium long shot": "Medium Wide Shot",
  ws: "Wide Shot", wide: "Wide Shot", "long shot": "Wide Shot", ls: "Wide Shot", "full shot": "Wide Shot", "establishing shot": "Wide Shot",
  ews: "Extreme Wide Shot", "extreme wide": "Extreme Wide Shot", "extreme long shot": "Extreme Wide Shot",
  ots: "Over the Shoulder", "over the shoulder": "Over the Shoulder", "over shoulder": "Over the Shoulder",
  pov: "Point of View", "point of view": "Point of View",
  "high angle": "High Angle", "low angle": "Low Angle",
  "birds eye": "Bird's Eye View", "bird s eye": "Bird's Eye View", "bird s eye view": "Bird's Eye View",
  overhead: "Bird's Eye View", "top down": "Bird's Eye View", "top shot": "Bird's Eye View",
  dutch: "Dutch Angle", "dutch angle": "Dutch Angle", "dutch tilt": "Dutch Angle",
  "two shot": "Two Shot", insert: "Insert / Detail", detail: "Insert / Detail", "detail shot": "Insert / Detail",
};

const TRANSITION_ALIASES: Record<string, string> = {
  cut: "Cut", "hard cut": "Cut", "straight cut": "Cut", potong: "Cut",
  "jump cut": "Jump Cut", "match cut": "Match Cut", "j cut": "J-Cut", "l cut": "L-Cut",
  fade: "Fade In", "fade in": "Fade In", "fade out": "Fade Out", "fade to black": "Fade to Black",
  dissolve: "Cross Dissolve", "cross dissolve": "Cross Dissolve", crossfade: "Cross Dissolve",
  "whip pan": "Whip Pan", swipe: "Whip Pan", whip: "Whip Pan",
  zoom: "Zoom", "zoom in": "Zoom", "zoom out": "Zoom", "zoom transition": "Zoom",
  slide: "Slide", wipe: "Wipe",
};

function pickOption(
  raw: string,
  options: string[],
  aliases: Record<string, string>,
): string | null {
  const n = norm(raw);
  if (!n) return null;
  const byNorm = new Map(options.map((o) => [norm(o), o]));
  if (byNorm.has(n)) return byNorm.get(n)!;
  const viaAlias = aliases[n];
  if (viaAlias && byNorm.has(norm(viaAlias))) return byNorm.get(norm(viaAlias))!;
  // cari opsi/alias terpanjang yang muncul di dalam teks ("Medium shot, slow push-in" → Medium Shot)
  const candidates: [string, string][] = [
    ...options.map((o) => [norm(o), o] as [string, string]),
    ...Object.entries(aliases).filter(([, v]) => byNorm.has(norm(v))).map(([k, v]) => [k, byNorm.get(norm(v))!] as [string, string]),
  ].sort((a, b) => b[0].length - a[0].length);
  for (const [key, opt] of candidates) {
    if (key.length < 3 && !new RegExp(`\\b${key}\\b`).test(n)) continue;
    if (new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(n)) return opt;
  }
  return null;
}

export function parseDuration(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return raw > 0 ? Math.round(raw) : null;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;

  // Rentang waktu "0:00-0:05" / "00:03 – 00:08"
  const tsRange = s.match(/(\d{1,2}):(\d{2})\s*[-–—to]+\s*(\d{1,2}):(\d{2})/);
  if (tsRange) {
    const a = +tsRange[1] * 60 + +tsRange[2];
    const b = +tsRange[3] * 60 + +tsRange[4];
    if (b > a) return b - a;
  }
  // Satu timestamp "0:05" / "01:30"
  const ts = s.match(/^(\d{1,2}):(\d{2})$/);
  if (ts) return +ts[1] * 60 + +ts[2] || null;

  // Rentang angka "0-3s" / "3–5 detik" → selisih
  const range = s.match(/(\d+(?:[.,]\d+)?)\s*(?:s|sec|detik)?\s*[-–—]\s*(\d+(?:[.,]\d+)?)/);
  if (range) {
    const a = parseFloat(range[1].replace(",", "."));
    const b = parseFloat(range[2].replace(",", "."));
    if (b > a) return Math.round(b - a);
  }

  let total = 0;
  const min = s.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minute|minutes|menit)\b/);
  const sec = s.match(/(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|second|seconds|detik|dtk)\b/);
  if (min) total += parseFloat(min[1].replace(",", ".")) * 60;
  if (sec) total += parseFloat(sec[1].replace(",", "."));
  if (total > 0) return Math.round(total);

  const num = s.match(/(\d+(?:[.,]\d+)?)/);
  if (num) {
    const v = Math.round(parseFloat(num[1].replace(",", ".")));
    return v > 0 ? v : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Raw scene → ParsedScene                                             */
/* ------------------------------------------------------------------ */

type RawScene = Partial<Record<FieldKey, string>> & { _order?: number; _headerTitle?: string };

function finalize(raws: RawScene[], opts: ParseOptions, warnings: ParseWarning[]): ParsedScene[] {
  const cameraAngles = opts.cameraAngles?.length ? opts.cameraAngles : DEFAULT_CAMERA_ANGLES;
  const transitions = opts.transitions?.length ? opts.transitions : DEFAULT_TRANSITIONS;
  const defaultDuration = opts.defaultDuration ?? 5;
  const defaultCamera = opts.defaultCameraAngle ?? (cameraAngles.includes("Medium Shot") ? "Medium Shot" : cameraAngles[0]);
  const defaultTransition = opts.defaultTransition ?? (transitions.includes("Cut") ? "Cut" : transitions[0]);
  const members = opts.members ?? [];

  return raws.map((r, i) => {
    const n = i + 1;
    const clean = (v?: string) => (v ?? "").replace(/^["“]|["”]$/g, "").trim();

    let title = clean(r.title) || clean(r._headerTitle);
    if (!title) title = `Scene ${n}`;
    else if (!/^scene\s*\d+/i.test(title)) title = `Scene ${n} - ${title}`;

    let duration = parseDuration(r.duration);
    if (!duration) {
      duration = defaultDuration;
      warnings.push({ scene: n, message: `Durasi tidak terbaca, dipakai default ${defaultDuration} detik.` });
    }

    let camera = defaultCamera;
    if (r.cameraAngle) {
      const picked = pickOption(r.cameraAngle, cameraAngles, { ...CAMERA_ALIASES, ...opts.cameraAliases });
      if (picked) camera = picked;
      else warnings.push({ scene: n, message: `Camera angle "${r.cameraAngle}" tidak dikenali → ${defaultCamera}.` });
    }

    let transition = defaultTransition;
    if (r.transition) {
      const picked = pickOption(r.transition, transitions, { ...TRANSITION_ALIASES, ...opts.transitionAliases });
      if (picked) transition = picked;
      else warnings.push({ scene: n, message: `Transisi "${r.transition}" tidak dikenali → ${defaultTransition}.` });
    }

    const assignedName = clean(r.assigned);
    let assignedId: string | null = null;
    if (assignedName && !/^(-|none|unassigned|tbd|n\/a|kosong)$/i.test(assignedName)) {
      const an = norm(assignedName);
      const m =
        members.find((x) => norm(x.name) === an) ??
        members.find((x) => norm(x.name).startsWith(an) || an.startsWith(norm(x.name).split(" ")[0]));
      if (m) assignedId = m.id;
      else if (members.length) warnings.push({ scene: n, message: `Member "${assignedName}" tidak ditemukan → Unassigned.` });
    }

    const scene: ParsedScene = {
      order: n,
      title,
      durationSeconds: duration,
      cameraAngle: camera,
      transition,
      assignedMemberName: assignedId ? members.find((m) => m.id === assignedId)!.name : "",
      assignedMemberId: assignedId,
      visualDirection: clean(r.visualDirection),
      aRollDirection: clean(r.aRollDirection),
      bRollDirection: clean(r.bRollDirection),
      voiceOver: clean(r.voiceOver),
      onScreenText: clean(r.onScreenText),
      legacyFootageNote: clean(r.legacyFootageNote),
      editorNotes: clean(r.editorNotes),
    };

    if (!scene.visualDirection && !scene.voiceOver && !scene.aRollDirection && !scene.bRollDirection) {
      warnings.push({ scene: n, message: "Scene ini tidak punya arahan visual maupun narasi." });
    }
    return scene;
  });
}

/* ------------------------------------------------------------------ */
/* Format 1: JSON                                                      */
/* ------------------------------------------------------------------ */

function tryJson(text: string): RawScene[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = (fenced ? fenced[1] : text).trim();
  if (!/^[[{]/.test(body)) {
    const start = body.search(/[[{]/);
    if (start < 0) return null;
    body = body.slice(start);
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as any).scenes ?? (data as any).storyboard ?? (data as any).adegan ?? null)
      : null;
  if (!Array.isArray(arr)) return null;

  return arr
    .filter((x) => x && typeof x === "object")
    .map((obj: Record<string, unknown>) => {
      const raw: RawScene = {};
      for (const [k, v] of Object.entries(obj)) {
        // camelCase → kata: "onScreenText" → "on Screen Text"
        const key = matchField(k.replace(/([a-z])([A-Z])/g, "$1 $2"));
        if (!key || v === null || v === undefined) continue;
        const val = Array.isArray(v) ? v.join("\n") : typeof v === "object" ? JSON.stringify(v) : String(v);
        raw[key] = raw[key] ? `${raw[key]}\n${val}` : val;
      }
      return raw;
    });
}

/* ------------------------------------------------------------------ */
/* Format 2: Markdown table                                            */
/* ------------------------------------------------------------------ */

function tryTable(text: string): RawScene[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const tableLines = lines.filter((l) => /^\|.*\|$/.test(l));
  if (tableLines.length < 3) return null;
  const cells = (l: string) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.replace(/<br\s*\/?>/gi, "\n").trim());
  const header = cells(tableLines[0]);
  const map = header.map((h) => (/^(no|#|scene|adegan)$/i.test(norm(h)) ? ("_order" as const) : matchField(h)));
  if (map.filter(Boolean).length < 2) return null;

  const rows = tableLines.slice(1).filter((l) => !/^\|?\s*:?-{2,}/.test(l));
  return rows.map((l) => {
    const c = cells(l);
    const raw: RawScene = {};
    map.forEach((key, i) => {
      if (!key || !c[i]) return;
      if (key === "_order") {
        const t = c[i].replace(/^(?:(?:scene|adegan)\s*)?\d+\s*[:.\-–—]?\s*/i, "");
        if (t && !/^\d+$/.test(t)) raw._headerTitle = t;
        return;
      }
      raw[key] = c[i];
    });
    return raw;
  });
}

/* ------------------------------------------------------------------ */
/* Format 3: Labelled text (paling umum)                               */
/* ------------------------------------------------------------------ */

const SCENE_HEADER =
  /^\s*(?:#{1,6}\s*|[=\-*_~]{2,}\s*|\*\*\s*|\[\s*)?(?:scene|adegan|shot|sc\.?)\s*#?\s*(\d+)\s*(?:\]\s*)?(?:[:.\-–—)|]\s*)?(.*?)\s*(?:\*\*|[=\-*_~]{2,})?\s*$/i;

const KEY_LINE = /^\s*(?:[-*•>]\s*)?(?:\d+[.)]\s*)?([A-Za-z][A-Za-z0-9 &/().'\-]{0,45}?)\s*[:：]\s*(.*)$/;

function tryText(text: string): RawScene[] | null {
  const lines = text.split(/\r?\n/);
  const scenes: RawScene[] = [];
  let cur: RawScene | null = null;
  let lastKey: FieldKey | null = null;

  for (const original of lines) {
    const line = original.replace(/\*\*|__/g, "").replace(/\t/g, " ");
    if (!line.trim()) {
      continue;
    }

    const h = line.match(SCENE_HEADER);
    // header scene: "SCENE 1: Hook", "## Scene 2 – Intro", "=== ADEGAN 3 ==="
    if (h && !KEY_LINE.test(line.replace(SCENE_HEADER, "")) ) {
      cur = { _order: +h[1], _headerTitle: h[2].replace(/^[\s:–—\-]+/, "").replace(/[\s=*#~]+$/, "") };
      // "(0:00-0:05)" / "(5s)" di judul header → durasi
      const dur = cur._headerTitle!.match(/[([]\s*([^)\]]*\d[^)\]]*)[)\]]\s*$/);
      if (dur && parseDuration(dur[1])) {
        cur.duration = dur[1];
        cur._headerTitle = cur._headerTitle!.replace(dur[0], "").trim();
      }
      scenes.push(cur);
      lastKey = null;
      continue;
    }

    const kv = line.match(KEY_LINE);
    const key = kv ? matchField(kv[1]) : null;
    if (kv && key) {
      if (!cur) {
        cur = {};
        scenes.push(cur);
      } else if (key === "title" && cur.title) {
        // label "Scene Title" berulang tanpa header → scene baru
        cur = {};
        scenes.push(cur);
      }
      const value = kv[2].trim();
      cur[key] = cur[key] ? `${cur[key]}\n${value}` : value;
      lastKey = key;
      continue;
    }

    // baris lanjutan untuk field sebelumnya (multi-line)
    if (cur && lastKey) {
      const v = line.replace(/^\s*[-*•]\s*/, "• ").trim();
      cur[lastKey] = cur[lastKey] ? `${cur[lastKey]}\n${v}` : v;
    }
  }

  const useful = scenes.filter((s) => Object.keys(s).some((k) => !k.startsWith("_")) || s._headerTitle);
  return useful.length ? useful : null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function parseStoryboardText(input: string, opts: ParseOptions = {}): ParseResult {
  const warnings: ParseWarning[] = [];
  const text = (input ?? "").trim();
  if (!text) return { format: "none", scenes: [], warnings, totalDurationSeconds: 0 };

  let format: ParseResult["format"] = "none";
  let raws: RawScene[] | null = tryJson(text);
  if (raws?.length) format = "json";
  if (!raws?.length) {
    raws = tryTable(text);
    if (raws?.length) format = "table";
  }
  if (!raws?.length) {
    raws = tryText(text);
    if (raws?.length) format = "text";
  }
  if (!raws?.length) {
    warnings.push({ message: "Tidak ada scene yang terdeteksi. Pastikan tiap scene diawali “SCENE 1:”, “SCENE 2:”, dst." });
    return { format: "none", scenes: [], warnings, totalDurationSeconds: 0 };
  }

  const scenes = finalize(raws, opts, warnings);
  return {
    format,
    scenes,
    warnings,
    totalDurationSeconds: scenes.reduce((a, s) => a + s.durationSeconds, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Prompt template untuk AI eksternal                                  */
/* ------------------------------------------------------------------ */

export function buildAiPrompt(ctx: {
  title?: string;
  platform?: string;
  format?: string;
  pillar?: string;
  brief?: string;
  cameraAngles?: string[];
  transitions?: string[];
  members?: string[];
}): string {
  const cams = (ctx.cameraAngles?.length ? ctx.cameraAngles : DEFAULT_CAMERA_ANGLES).join(", ");
  const trans = (ctx.transitions?.length ? ctx.transitions : DEFAULT_TRANSITIONS).join(", ");
  return `Kamu adalah sutradara & scriptwriter konten sosial media.
Buatkan storyboard untuk konten berikut:

- Judul: ${ctx.title || "[isi judul konten]"}
- Platform / format: ${[ctx.platform, ctx.format].filter(Boolean).join(" ") || "[mis. Instagram Reels]"}
- Content pillar: ${ctx.pillar || "[mis. Campus Education]"}
- Brief: ${ctx.brief || "[jelaskan ide, target audiens, durasi total, CTA]"}

WAJIB tulis output PERSIS dengan format di bawah ini, tanpa pembuka/penutup, ulangi blok untuk setiap scene (SCENE 1, SCENE 2, SCENE 3, dst.):

SCENE 1: [Judul singkat scene]
Duration: [angka detik saja, mis. 5]
Camera Angle: [pilih salah satu: ${cams}]
Transition: [pilih salah satu: ${trans}]
Assigned Member: [${ctx.members?.length ? `pilih: ${ctx.members.join(", ")}, atau kosongkan` : "kosongkan jika belum ada"}]
Visual Direction: [komposisi, gerakan presenter, properti]
A-Roll: [arahan footage presenter/interview]
B-Roll: [arahan footage pendukung/cutaway]
Voice-Over: [dialog atau narasi yang diucapkan di scene ini]
On-Screen Text: [teks overlay, singkat]
Legacy Footage Note: [footage lama yang bisa dipakai, atau kosongkan]
Editor Notes: [SFX, musik, warna teks, efek]

SCENE 2: ...`;
}
