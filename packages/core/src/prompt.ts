import path from "node:path";
import type { LoadedSeries } from "./record.ts";
import type { Asset, Character, CharacterState, Ref, Scene, Shot } from "./schema.ts";
import { inRange } from "./episodes.ts";

/** A character as they are in a given episode: base + active states. */
export interface ResolvedCharacter {
  character: Character;
  activeStates: CharacterState[];
  prompt: string;
  refs: Ref[];
}

export function resolveCharacter(c: Character, episode: string): ResolvedCharacter {
  const activeStates = c.states.filter((s) => inRange(episode, s.from, s.until));
  // The latest active state with refs replaces the base refs (e.g. "scarred" turnaround).
  const stateWithRefs = [...activeStates].reverse().find((s) => s.refs.some((r) => r.canonical));
  const refs = (stateWithRefs ? stateWithRefs.refs : c.refs).filter((r) => r.canonical);
  const prompt = [c.prompt, ...activeStates.map((s) => s.prompt ?? s.change)].filter(Boolean).join("; ");
  return { character: c, activeStates, prompt, refs };
}

export function activeRules(a: Asset, episode: string): string[] {
  return a.rules.filter((r) => inRange(episode, r.from, r.until)).map((r) => r.text);
}

export type RefRole = "character" | "wardrobe" | "place" | "prop";

export interface PromptRef {
  role: RefRole;
  entity: string;
  label: string;
  /** Path relative to the series folder, e.g. "cast/mira/refs/front.png". */
  path: string;
}

/** Model-agnostic description of a shot, built from the record. */
export interface SharedCore {
  episode: string;
  shotId: string;
  sceneId: string;
  format: string;
  subjects: { id: string; name: string; description: string; wardrobe: string[]; note?: string }[];
  action: string;
  dialogue?: string;
  camera: string;
  setting?: string;
  timeOfDay?: string;
  props: string[];
  style: string;
  palette: string;
  lighting: string;
  cameraLanguage: string;
  rules: string[];
  avoid: string[];
  refs: PromptRef[];
  durationSec: number;
  warnings: string[];
}

export class PromptError extends Error {
  override name = "PromptError";
}

function findShot(scenes: Scene[], shotId: string): { scene: Scene; shot: Shot } {
  for (const scene of scenes) {
    const shot = scene.shots.find((s) => s.id === shotId);
    if (shot) return { scene, shot };
  }
  throw new PromptError(`No shot "${shotId}" in this episode`);
}

function refPaths(kind: string, id: string, refs: Ref[], role: RefRole): PromptRef[] {
  return refs
    .filter((r) => r.canonical)
    .map((r) => ({ role, entity: id, label: r.label ?? r.kind, path: path.posix.join(kind, id, r.file) }));
}

export function buildSharedCore(
  series: LoadedSeries,
  episode: string,
  scenes: Scene[],
  shotId: string,
): SharedCore {
  const { scene, shot } = findShot(scenes, shotId);
  const warnings: string[] = [];
  const byId = <T extends { id: string }>(list: T[], id: string, what: string): T | undefined => {
    const found = list.find((x) => x.id === id);
    if (!found) warnings.push(`Unknown ${what} "${id}"`);
    return found;
  };

  const refs: PromptRef[] = [];
  const rules: string[] = [];
  const subjects: SharedCore["subjects"] = [];

  for (const sc of shot.cast) {
    const c = byId(series.cast, sc.id, "character");
    if (!c) continue;
    const r = resolveCharacter(c, episode);
    if (r.refs.length === 0) warnings.push(`${c.name} has no canonical reference frame`);
    refs.push(...refPaths("cast", c.id, r.refs, "character"));
    const wardrobe: string[] = [];
    for (const wid of sc.wardrobe) {
      const w = byId(series.wardrobe, wid, "wardrobe item");
      if (!w) continue;
      wardrobe.push(w.prompt || w.name);
      rules.push(...activeRules(w, episode));
      refs.push(...refPaths("wardrobe", w.id, w.refs, "wardrobe"));
    }
    subjects.push({ id: c.id, name: c.name, description: r.prompt || c.description, wardrobe, note: sc.note });
  }

  let setting: string | undefined;
  if (scene.place) {
    const p = byId(series.places, scene.place, "place");
    if (p) {
      setting = p.prompt || p.description || p.name;
      rules.push(...activeRules(p, episode));
      if (!p.refs.some((r) => r.canonical)) warnings.push(`Place "${p.name}" has no canonical reference frame`);
      refs.push(...refPaths("places", p.id, p.refs, "place"));
    }
  }

  const props: string[] = [];
  for (const pid of shot.props) {
    const p = byId(series.props, pid, "prop");
    if (!p) continue;
    props.push(p.prompt || p.name);
    rules.push(...activeRules(p, episode));
    refs.push(...refPaths("props", p.id, p.refs, "prop"));
  }

  const format = series.meta.format;
  const adopted = series.rules
    .filter((r) => r.status === "adopted" && (r.scope !== "shot" || r.origin?.endsWith(shotId)))
    .map((r) => r.text);

  return {
    episode,
    shotId,
    sceneId: scene.id,
    format,
    subjects,
    action: shot.action,
    dialogue: shot.dialogue,
    camera: shot.camera,
    setting,
    timeOfDay: scene.timeOfDay,
    props,
    style: series.look.style,
    palette: series.look.palette,
    lighting: series.look.lighting,
    cameraLanguage: series.look.camera,
    rules: [...new Set([...rules, ...(series.look.formatRules[format] ?? []), ...adopted])],
    avoid: series.look.avoid,
    refs,
    durationSec: shot.durationSec,
    warnings,
  };
}
