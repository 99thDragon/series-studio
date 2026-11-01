import type { PromptRef, RefRole, SharedCore } from "./prompt.ts";

/**
 * A model adapter turns the model-agnostic SharedCore into one model's prompt grammar
 * and enforces its limits. Adding a model = adding an adapter; the record never changes.
 */
export interface ModelAdapter {
  id: string;
  label: string;
  kind: "image" | "video" | "both";
  maxRefs: number;
  maxDurationSec?: number;
  aspectRatios: string[];
  render(core: SharedCore): { prompt: string; negative?: string };
}

export interface AssembledPrompt {
  adapter: string;
  prompt: string;
  negative?: string;
  refs: PromptRef[];
  droppedRefs: PromptRef[];
  durationSec: number;
  warnings: string[];
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const REF_PRIORITY: RefRole[] = ["character", "wardrobe", "place", "prop"];

function subjectLine(s: SharedCore["subjects"][number]): string {
  const desc = s.description.trim();
  const parts = [desc.toLowerCase().startsWith(s.name.toLowerCase()) ? desc : `${s.name}: ${desc}`];
  if (s.wardrobe.length) parts.push(`wearing ${s.wardrobe.join(", ")}`);
  if (s.note) parts.push(s.note);
  return parts.join(", ");
}

/** Labelled sections. Works with most models and is easy to read and debug. */
export const genericAdapter: ModelAdapter = {
  id: "generic",
  label: "Generic (labelled sections)",
  kind: "both",
  maxRefs: 8,
  aspectRatios: ["16:9", "9:16", "21:9", "1:1", "4:3"],
  render(core) {
    const lines: string[] = [];
    if (core.style) lines.push(`STYLE: ${core.style}`);
    if (core.subjects.length) lines.push(`SUBJECTS: ${core.subjects.map(subjectLine).join(" | ")}`);
    lines.push(`ACTION: ${core.action}`);
    if (core.dialogue) lines.push(`DIALOGUE: ${core.dialogue}`);
    if (core.setting) lines.push(`SETTING: ${core.setting}${core.timeOfDay ? `, ${core.timeOfDay}` : ""}`);
    if (core.props.length) lines.push(`PROPS: ${core.props.join(", ")}`);
    if (core.camera || core.cameraLanguage) lines.push(`CAMERA: ${[core.camera, core.cameraLanguage].filter(Boolean).join("; ")}`);
    if (core.lighting) lines.push(`LIGHTING: ${core.lighting}`);
    if (core.palette) lines.push(`PALETTE: ${core.palette}`);
    if (core.rules.length) lines.push(`RULES: ${core.rules.join("; ")}`);
    lines.push(`FORMAT: ${core.format}, ${core.durationSec}s`);
    return { prompt: lines.join("\n"), negative: core.avoid.join(", ") || undefined };
  },
};

/** One flowing paragraph: camera first, then subject, action, setting, light. Suits cinematic video models. */
export const cinematicAdapter: ModelAdapter = {
  id: "cinematic",
  label: "Cinematic prose (video models)",
  kind: "video",
  maxRefs: 4,
  maxDurationSec: 10,
  aspectRatios: ["16:9", "9:16", "21:9"],
  render(core) {
    const sentences: string[] = [];
    if (core.camera) sentences.push(capitalize(core.camera.replace(/\.$/, "")) + ".");
    if (core.subjects.length) sentences.push(core.subjects.map(subjectLine).join(". ") + ".");
    sentences.push(core.action.replace(/\.$/, "") + ".");
    if (core.dialogue) sentences.push(`Dialogue: "${core.dialogue}"`);
    if (core.setting) sentences.push(`Setting: ${core.setting}${core.timeOfDay ? `, ${core.timeOfDay}` : ""}.`);
    if (core.props.length) sentences.push(`Featuring ${core.props.join(", ")}.`);
    const look = [core.style, core.lighting, core.palette, core.cameraLanguage].filter(Boolean).join("; ");
    if (look) sentences.push(`Look: ${look}.`);
    if (core.rules.length) sentences.push(core.rules.map((r) => capitalize(r.replace(/\.$/, ""))).join(". ") + ".");
    const avoid = core.avoid.length ? ` Avoid: ${core.avoid.join(", ")}.` : "";
    return { prompt: sentences.join(" ") + avoid };
  },
};

export const adapters: Record<string, ModelAdapter> = {
  [genericAdapter.id]: genericAdapter,
  [cinematicAdapter.id]: cinematicAdapter,
};

export function registerAdapter(adapter: ModelAdapter): void {
  adapters[adapter.id] = adapter;
}

export function assemblePrompt(core: SharedCore, adapterId = "generic"): AssembledPrompt {
  const adapter = adapters[adapterId];
  if (!adapter) throw new Error(`Unknown adapter "${adapterId}". Known: ${Object.keys(adapters).join(", ")}`);
  const warnings = [...core.warnings];

  const sorted = [...core.refs].sort((a, b) => REF_PRIORITY.indexOf(a.role) - REF_PRIORITY.indexOf(b.role));
  const refs = sorted.slice(0, adapter.maxRefs);
  const droppedRefs = sorted.slice(adapter.maxRefs);
  if (droppedRefs.length) warnings.push(`${adapter.id} accepts ${adapter.maxRefs} refs; dropped ${droppedRefs.length}`);

  let durationSec = core.durationSec;
  if (adapter.maxDurationSec && durationSec > adapter.maxDurationSec) {
    warnings.push(`Shot is ${durationSec}s; ${adapter.id} max is ${adapter.maxDurationSec}s (clamped)`);
    durationSec = adapter.maxDurationSec;
  }
  if (!adapter.aspectRatios.includes(core.format)) warnings.push(`${adapter.id} does not support ${core.format}`);

  const { prompt, negative } = adapter.render({ ...core, durationSec });
  return { adapter: adapter.id, prompt, negative, refs, droppedRefs, durationSec, warnings };
}
