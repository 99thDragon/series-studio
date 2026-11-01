import { z } from "zod";

/** Episode reference like "S01E03". Used to scope character states and usage rules. */
export const EpisodeRef = z
  .string()
  .regex(/^S\d{2}E\d{2}$/, 'Expected an episode ref like "S01E03"');
export type EpisodeRef = z.infer<typeof EpisodeRef>;

export const Slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and dashes");

export const AspectRatio = z.enum(["16:9", "9:16", "21:9", "1:1", "4:3"]);

/** A reference image. `file` is relative to the entity's folder (e.g. "refs/front.png"). */
export const Ref = z.object({
  file: z.string(),
  kind: z
    .enum(["turnaround", "expression", "outfit", "establishing", "detail", "other"])
    .default("other"),
  label: z.string().optional(),
  /** Canonical refs are locked and sent to models. Candidates are not. */
  canonical: z.boolean().default(false),
});
export type Ref = z.infer<typeof Ref>;

/** A scoped rule on a reference: "only at night", "from S01E04 on". */
export const UsageRule = z.object({
  text: z.string(),
  from: EpisodeRef.optional(),
  until: EpisodeRef.optional(),
});
export type UsageRule = z.infer<typeof UsageRule>;

/** A change to a character that applies over a range of episodes. */
export const CharacterState = z.object({
  from: EpisodeRef,
  until: EpisodeRef.optional(),
  change: z.string(),
  /** Extra prompt text while this state is active. */
  prompt: z.string().optional(),
  /** Refs that replace the base canonical refs while this state is active. */
  refs: z.array(Ref).default([]),
});
export type CharacterState = z.infer<typeof CharacterState>;

export const Character = z.object({
  id: Slug,
  name: z.string(),
  description: z.string().default(""),
  personality: z.string().default(""),
  voice: z.string().optional(),
  /** Locked prompt fragment, always included when this character is in a shot. */
  prompt: z.string().default(""),
  refs: z.array(Ref).default([]),
  states: z.array(CharacterState).default([]),
  /** Extras are not rendered until a scene uses them. */
  extra: z.boolean().default(false),
});
export type Character = z.infer<typeof Character>;

export const AssetKind = z.enum(["wardrobe", "props", "places"]);
export type AssetKind = z.infer<typeof AssetKind>;

/** Wardrobe items, props and places share one shape. */
export const Asset = z.object({
  id: Slug,
  name: z.string(),
  description: z.string().default(""),
  prompt: z.string().default(""),
  refs: z.array(Ref).default([]),
  rules: z.array(UsageRule).default([]),
  /** Optional owner (character id) for wardrobe and personal props. */
  owner: Slug.optional(),
});
export type Asset = z.infer<typeof Asset>;

export const SeriesMeta = z.object({
  slug: Slug,
  title: z.string(),
  logline: z.string().default(""),
  format: AspectRatio.default("16:9"),
  genre: z.string().default(""),
  /** Default model adapters, by id. */
  models: z
    .object({ image: z.string().default("generic"), video: z.string().default("generic") })
    .default({}),
});
export type SeriesMeta = z.infer<typeof SeriesMeta>;

/** Machine-readable part of look.md (YAML frontmatter). The body is free prose. */
export const Look = z.object({
  style: z.string().default(""),
  palette: z.string().default(""),
  camera: z.string().default(""),
  lighting: z.string().default(""),
  /** Things that must never appear. */
  avoid: z.array(z.string()).default([]),
  /** Format-specific rules, e.g. { "9:16": ["keep faces in the upper third"] } */
  formatRules: z.record(z.array(z.string())).default({}),
});
export type Look = z.infer<typeof Look>;

export const ShotStatus = z.enum(["planned", "frames", "frame-chosen", "takes", "approved", "dropped"]);

export const ShotCast = z.object({
  id: Slug,
  wardrobe: z.array(Slug).default([]),
  /** Optional per-shot direction for this character (expression, pose). */
  note: z.string().optional(),
});

export const Shot = z.object({
  id: z.string(),
  action: z.string(),
  dialogue: z.string().optional(),
  camera: z.string().default(""),
  durationSec: z.number().positive().default(5),
  cast: z.array(ShotCast).default([]),
  props: z.array(Slug).default([]),
  status: ShotStatus.default("planned"),
});
export type Shot = z.infer<typeof Shot>;

export const Scene = z.object({
  id: z.string(),
  place: Slug.optional(),
  timeOfDay: z.string().optional(),
  summary: z.string().default(""),
  shots: z.array(Shot).default([]),
});
export type Scene = z.infer<typeof Scene>;

export const ShotList = z.object({ scenes: z.array(Scene).default([]) });
export type ShotList = z.infer<typeof ShotList>;

export const EpisodeMeta = z.object({
  title: z.string(),
  logline: z.string().default(""),
});
export type EpisodeMeta = z.infer<typeof EpisodeMeta>;

export const RuleScope = z.enum(["shot", "series", "genre", "global"]);
export const Rule = z.object({
  id: z.string(),
  text: z.string(),
  scope: RuleScope.default("series"),
  /** Where it came from, e.g. a take id or "S01E01/SC03-SH02". */
  origin: z.string().optional(),
  status: z.enum(["proposed", "adopted", "rejected"]).default("proposed"),
  createdAt: z.string().optional(),
});
export type Rule = z.infer<typeof Rule>;
export const RuleBook = z.object({ rules: z.array(Rule).default([]) });

/** One line in ledger.jsonl: a generation or a judgement. */
export const LedgerEntry = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generation"),
    id: z.string(),
    at: z.string(),
    episode: EpisodeRef,
    shot: z.string(),
    kind: z.enum(["frame", "take"]),
    model: z.string(),
    prompt: z.string(),
    refs: z.array(z.string()).default([]),
    params: z.record(z.unknown()).default({}),
    costUsd: z.number().nonnegative().default(0),
    output: z.string().optional(),
    sourceFrame: z.string().optional(),
  }),
  z.object({
    type: z.literal("verdict"),
    id: z.string(),
    at: z.string(),
    generation: z.string(),
    judge: z.enum(["claude", "gemini", "director"]),
    verdict: z.enum(["pass", "fail", "chosen"]),
    notes: z.string().default(""),
  }),
]);
export type LedgerEntry = z.infer<typeof LedgerEntry>;
