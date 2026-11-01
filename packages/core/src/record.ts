import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import {
  Asset,
  AssetKind,
  Character,
  EpisodeMeta,
  EpisodeRef,
  LedgerEntry,
  Look,
  Rule,
  RuleBook,
  SeriesMeta,
  ShotList,
} from "./schema.ts";
import { compareEpisodes, episodeRef, parseEpisodeRef } from "./episodes.ts";

/**
 * The production record: a folder of human-readable files.
 *
 *   <root>/series/<slug>/
 *     series.yaml  bible.md  look.md  continuity.yaml  ledger.jsonl
 *     skill/SKILL.md  skill/rules.yaml
 *     cast/<id>/character.yaml + refs/
 *     wardrobe|props|places/<id>/asset.yaml + refs/
 *     seasons/<ss>/episodes/<ee>/episode.yaml  script.md  shots.yaml
 */
export class RecordError extends Error {
  override name = "RecordError";
}

export interface LoadedSeries {
  meta: SeriesMeta;
  dir: string;
  bible: string;
  look: Look;
  lookNotes: string;
  cast: Character[];
  wardrobe: Asset[];
  props: Asset[];
  places: Asset[];
  rules: Rule[];
  episodes: { ref: EpisodeRef; meta: EpisodeMeta }[];
}

export interface LoadedEpisode {
  ref: EpisodeRef;
  dir: string;
  meta: EpisodeMeta;
  script: string;
  shots: ShotList;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p: string, fallback = ""): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch (e: any) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}

async function readYaml<S extends z.ZodTypeAny>(p: string, schema: S, fallback?: unknown): Promise<z.output<S>> {
  const text = await readText(p, "");
  const raw = text.trim() ? YAML.parse(text) : fallback;
  if (raw === undefined) throw new RecordError(`Missing file: ${p}`);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new RecordError(`Invalid ${p}: ${issues}`);
  }
  return parsed.data;
}

async function writeText(p: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, text.endsWith("\n") ? text : text + "\n", "utf8");
}

async function writeYaml(p: string, data: unknown): Promise<void> {
  await writeText(p, YAML.stringify(data, { lineWidth: 100 }));
}

async function subdirs(p: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (e: any) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

/** Split "---\nyaml\n---\nbody" into its parts. */
export function splitFrontmatter(text: string): { data: unknown; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  return { data: YAML.parse(m[1]) ?? {}, body: m[2] };
}

export function joinFrontmatter(data: unknown, body: string): string {
  return `---\n${YAML.stringify(data, { lineWidth: 100 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

const ASSET_KINDS = AssetKind.options;

export class Studio {
  constructor(public readonly root: string) {}

  seriesDir(slug: string): string {
    return path.join(this.root, "series", slug);
  }

  episodeDir(slug: string, ref: string): string {
    const { season, episode } = parseEpisodeRef(ref);
    return path.join(
      this.seriesDir(slug),
      "seasons",
      String(season).padStart(2, "0"),
      "episodes",
      String(episode).padStart(2, "0"),
    );
  }

  entityDir(slug: string, kind: "cast" | AssetKind, id: string): string {
    return path.join(this.seriesDir(slug), kind, id);
  }

  async listSeries(): Promise<SeriesMeta[]> {
    const out: SeriesMeta[] = [];
    for (const slug of await subdirs(path.join(this.root, "series"))) {
      if (await exists(path.join(this.seriesDir(slug), "series.yaml"))) {
        out.push(await readYaml(path.join(this.seriesDir(slug), "series.yaml"), SeriesMeta));
      }
    }
    return out;
  }

  async createSeries(input: z.input<typeof SeriesMeta>): Promise<SeriesMeta> {
    const meta = SeriesMeta.parse(input);
    const dir = this.seriesDir(meta.slug);
    if (await exists(path.join(dir, "series.yaml"))) {
      throw new RecordError(`Series "${meta.slug}" already exists`);
    }
    await writeYaml(path.join(dir, "series.yaml"), meta);
    await writeText(
      path.join(dir, "bible.md"),
      `# ${meta.title} — Series Bible\n\n## World\n\n## Tone\n\n## Story rules\n\n## Never\n`,
    );
    await writeText(
      path.join(dir, "look.md"),
      joinFrontmatter(Look.parse({}), "# Look\n\nDescribe the visual language here."),
    );
    await writeText(
      path.join(dir, "skill", "SKILL.md"),
      `# ${meta.title} — show skill\n\nRules learned from corrections live in rules.yaml. Adopted rules are applied to every prompt.\n`,
    );
    await writeYaml(path.join(dir, "skill", "rules.yaml"), { rules: [] });
    await writeYaml(path.join(dir, "continuity.yaml"), {});
    await writeText(path.join(dir, "ledger.jsonl"), "");
    return meta;
  }

  async loadSeries(slug: string): Promise<LoadedSeries> {
    const dir = this.seriesDir(slug);
    if (!(await exists(path.join(dir, "series.yaml")))) {
      throw new RecordError(`No series "${slug}" under ${this.root}`);
    }
    const meta = await readYaml(path.join(dir, "series.yaml"), SeriesMeta);
    const { data: lookData, body: lookNotes } = splitFrontmatter(await readText(path.join(dir, "look.md")));
    const look = Look.parse(lookData ?? {});

    const cast: Character[] = [];
    for (const id of await subdirs(path.join(dir, "cast"))) {
      const f = path.join(dir, "cast", id, "character.yaml");
      if (await exists(f)) cast.push(await readYaml(f, Character));
    }
    const assets: Record<AssetKind, Asset[]> = { wardrobe: [], props: [], places: [] };
    for (const kind of ASSET_KINDS) {
      for (const id of await subdirs(path.join(dir, kind))) {
        const f = path.join(dir, kind, id, "asset.yaml");
        if (await exists(f)) assets[kind].push(await readYaml(f, Asset));
      }
    }
    const rules = (await readYaml(path.join(dir, "skill", "rules.yaml"), RuleBook, { rules: [] })).rules;

    return {
      meta,
      dir,
      bible: await readText(path.join(dir, "bible.md")),
      look,
      lookNotes: lookNotes.trim(),
      cast,
      ...assets,
      rules,
      episodes: await this.listEpisodes(slug),
    };
  }

  async listEpisodes(slug: string): Promise<{ ref: EpisodeRef; meta: EpisodeMeta }[]> {
    const out: { ref: EpisodeRef; meta: EpisodeMeta }[] = [];
    const seasonsDir = path.join(this.seriesDir(slug), "seasons");
    for (const s of await subdirs(seasonsDir)) {
      for (const e of await subdirs(path.join(seasonsDir, s, "episodes"))) {
        if (!/^\d+$/.test(s) || !/^\d+$/.test(e)) continue;
        const ref = episodeRef(Number(s), Number(e));
        const f = path.join(this.episodeDir(slug, ref), "episode.yaml");
        if (await exists(f)) out.push({ ref, meta: await readYaml(f, EpisodeMeta) });
      }
    }
    return out.sort((a, b) => compareEpisodes(a.ref, b.ref));
  }

  async saveBible(slug: string, text: string): Promise<void> {
    await this.loadSeries(slug);
    await writeText(path.join(this.seriesDir(slug), "bible.md"), text);
  }

  async saveLook(slug: string, look: z.input<typeof Look>, notes: string): Promise<Look> {
    await this.loadSeries(slug);
    const parsed = Look.parse(look);
    await writeText(path.join(this.seriesDir(slug), "look.md"), joinFrontmatter(parsed, notes));
    return parsed;
  }

  async saveCharacter(slug: string, input: z.input<typeof Character>): Promise<Character> {
    await this.loadSeries(slug);
    const c = Character.parse(input);
    await writeYaml(path.join(this.entityDir(slug, "cast", c.id), "character.yaml"), c);
    return c;
  }

  async saveAsset(slug: string, kind: AssetKind, input: z.input<typeof Asset>): Promise<Asset> {
    await this.loadSeries(slug);
    const a = Asset.parse(input);
    await writeYaml(path.join(this.entityDir(slug, kind, a.id), "asset.yaml"), a);
    return a;
  }

  async createEpisode(slug: string, ref: string, input: z.input<typeof EpisodeMeta>): Promise<LoadedEpisode> {
    EpisodeRef.parse(ref);
    await this.loadSeries(slug);
    const dir = this.episodeDir(slug, ref);
    if (await exists(path.join(dir, "episode.yaml"))) {
      throw new RecordError(`Episode ${ref} already exists in "${slug}"`);
    }
    const meta = EpisodeMeta.parse(input);
    await writeYaml(path.join(dir, "episode.yaml"), meta);
    await writeText(path.join(dir, "script.md"), `# ${ref} — ${meta.title}\n`);
    await writeYaml(path.join(dir, "shots.yaml"), { scenes: [] });
    return this.loadEpisode(slug, ref);
  }

  async loadEpisode(slug: string, ref: string): Promise<LoadedEpisode> {
    EpisodeRef.parse(ref);
    const dir = this.episodeDir(slug, ref);
    if (!(await exists(path.join(dir, "episode.yaml")))) {
      throw new RecordError(`No episode ${ref} in "${slug}"`);
    }
    return {
      ref,
      dir,
      meta: await readYaml(path.join(dir, "episode.yaml"), EpisodeMeta),
      script: await readText(path.join(dir, "script.md")),
      shots: await readYaml(path.join(dir, "shots.yaml"), ShotList, { scenes: [] }),
    };
  }

  async saveScript(slug: string, ref: string, text: string): Promise<void> {
    const ep = await this.loadEpisode(slug, ref);
    await writeText(path.join(ep.dir, "script.md"), text);
  }

  async saveShots(slug: string, ref: string, input: z.input<typeof ShotList>): Promise<ShotList> {
    const ep = await this.loadEpisode(slug, ref);
    const shots = ShotList.parse(input);
    const ids = new Set<string>();
    for (const sc of shots.scenes) {
      for (const sh of sc.shots) {
        if (ids.has(sh.id)) throw new RecordError(`Duplicate shot id "${sh.id}"`);
        ids.add(sh.id);
      }
    }
    await writeYaml(path.join(ep.dir, "shots.yaml"), shots);
    return shots;
  }

  // ---- skill rules -------------------------------------------------------

  private rulesPath(slug: string): string {
    return path.join(this.seriesDir(slug), "skill", "rules.yaml");
  }

  async proposeRule(slug: string, input: Omit<z.input<typeof Rule>, "id" | "status" | "createdAt">): Promise<Rule> {
    const { rules } = await this.loadSeries(slug);
    const next = rules.reduce((n, r) => Math.max(n, Number(/^R(\d+)$/.exec(r.id)?.[1] ?? 0)), 0) + 1;
    const rule = Rule.parse({
      ...input,
      id: `R${String(next).padStart(3, "0")}`,
      status: "proposed",
      createdAt: new Date().toISOString(),
    });
    await writeYaml(this.rulesPath(slug), { rules: [...rules, rule] });
    return rule;
  }

  async setRuleStatus(slug: string, id: string, status: Rule["status"]): Promise<Rule> {
    const { rules } = await this.loadSeries(slug);
    const rule = rules.find((r) => r.id === id);
    if (!rule) throw new RecordError(`No rule ${id}`);
    rule.status = status;
    await writeYaml(this.rulesPath(slug), { rules });
    return rule;
  }

  // ---- ledger ------------------------------------------------------------

  private ledgerPath(slug: string): string {
    return path.join(this.seriesDir(slug), "ledger.jsonl");
  }

  async readLedger(slug: string): Promise<LedgerEntry[]> {
    const text = await readText(this.ledgerPath(slug));
    return text
      .split("\n")
      .filter((l) => l.trim())
      .map((l, i) => {
        const parsed = LedgerEntry.safeParse(JSON.parse(l));
        if (!parsed.success) throw new RecordError(`Invalid ledger line ${i + 1}`);
        return parsed.data;
      });
  }

  async appendLedger(slug: string, input: Record<string, unknown>): Promise<LedgerEntry> {
    await this.loadSeries(slug);
    const ledger = await this.readLedger(slug);
    const prefix = input.type === "verdict" ? "V" : "G";
    const n = ledger.filter((e) => e.id.startsWith(prefix)).length + 1;
    const entry = LedgerEntry.parse({
      id: `${prefix}${String(n).padStart(5, "0")}`,
      at: new Date().toISOString(),
      ...input,
    });
    await fs.appendFile(this.ledgerPath(slug), JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }
}
