#!/usr/bin/env tsx
/**
 * Series Studio MCP server (stdio).
 *
 * Gives Claude (Claude Code, Claude Desktop, any MCP client) the same production record the
 * web UI uses: "the GUI and the conversation are equivalent; both write the same record."
 *
 *   claude mcp add series-studio -e STUDIO_ROOT=/path/to/studio-data -- pnpm --dir /path/to/series-studio -s mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  Asset,
  AssetKind,
  Character,
  Look,
  ShotList,
  adapters,
  assemblePrompt,
  buildSharedCore,
  defaultStudio,
  seriesCoverage,
} from "@studio/core";

const studio = defaultStudio();
const server = new McpServer({ name: "series-studio", version: "0.1.0" });

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): Result => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});
async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    return ok(await fn());
  } catch (e) {
    return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
}

const slug = z.string().describe("Series slug, e.g. 'tidewatch'");
const episode = z.string().describe("Episode ref like S01E03");

server.registerTool(
  "list_series",
  { description: "List all series in the studio." },
  () => run(() => studio.listSeries()),
);

server.registerTool(
  "create_series",
  {
    description: "Create a new series with an empty Bible, Look, skill and ledger.",
    inputSchema: {
      slug,
      title: z.string(),
      logline: z.string().optional(),
      format: z.enum(["16:9", "9:16", "21:9", "1:1", "4:3"]).optional(),
      genre: z.string().optional(),
    },
  },
  (args) => run(() => studio.createSeries(args)),
);

server.registerTool(
  "get_series",
  {
    description:
      "Load a series: meta, Bible, Look, cast (with states over time), wardrobe, props, places, skill rules and episodes.",
    inputSchema: { slug },
  },
  ({ slug }) => run(() => studio.loadSeries(slug)),
);

server.registerTool(
  "save_bible",
  { description: "Replace the series Bible (Markdown).", inputSchema: { slug, markdown: z.string() } },
  ({ slug, markdown }) => run(async () => (await studio.saveBible(slug, markdown), "Bible saved")),
);

server.registerTool(
  "save_look",
  {
    description: "Replace the visual language: structured fields plus free-form notes.",
    inputSchema: { slug, look: Look, notes: z.string().default("") },
  },
  ({ slug, look, notes }) => run(() => studio.saveLook(slug, look, notes)),
);

server.registerTool(
  "save_character",
  {
    description:
      "Create or replace a character. `prompt` is the locked fragment used in every shot. `states` scope changes over time (from/until like S01E03). Only refs with canonical=true are sent to models.",
    inputSchema: { slug, character: Character },
  },
  ({ slug, character }) => run(() => studio.saveCharacter(slug, character)),
);

server.registerTool(
  "save_asset",
  {
    description:
      "Create or replace a wardrobe item, prop or place, with reference frames and usage rules (rules can be scoped with from/until episode refs).",
    inputSchema: { slug, kind: AssetKind, asset: Asset },
  },
  ({ slug, kind, asset }) => run(() => studio.saveAsset(slug, kind, asset)),
);

server.registerTool(
  "create_episode",
  { description: "Create an episode.", inputSchema: { slug, episode, title: z.string(), logline: z.string().optional() } },
  ({ slug, episode, title, logline }) => run(() => studio.createEpisode(slug, episode, { title, logline })),
);

server.registerTool(
  "get_episode",
  { description: "Load an episode: meta, script and shot list.", inputSchema: { slug, episode } },
  ({ slug, episode }) => run(() => studio.loadEpisode(slug, episode)),
);

server.registerTool(
  "save_script",
  { description: "Replace an episode's script (Markdown).", inputSchema: { slug, episode, markdown: z.string() } },
  ({ slug, episode, markdown }) => run(async () => (await studio.saveScript(slug, episode, markdown), "Script saved")),
);

server.registerTool(
  "save_shots",
  {
    description:
      "Replace an episode's shot list. Link every shot to the Bible: cast ids (with wardrobe ids), prop ids, and a place per scene. Use shot ids like SC01-SH01.",
    inputSchema: { slug, episode, shots: ShotList },
  },
  ({ slug, episode, shots }) => run(() => studio.saveShots(slug, episode, shots)),
);

server.registerTool(
  "assemble_prompt",
  {
    description:
      "Build the model-ready prompt for a shot from the record (Bible entries, character states, usage rules, adopted skill rules) using a model adapter. Returns prompt, negative, reference image paths (relative to the series folder) and warnings.",
    inputSchema: {
      slug,
      episode,
      shot: z.string(),
      adapter: z.string().optional().describe(`One of: ${Object.keys(adapters).join(", ")}`),
    },
  },
  ({ slug, episode, shot, adapter }) =>
    run(async () => {
      const s = await studio.loadSeries(slug);
      const ep = await studio.loadEpisode(slug, episode);
      const core = buildSharedCore(s, episode, ep.shots.scenes, shot);
      return { ...assemblePrompt(core, adapter ?? s.meta.models.video), seriesDir: s.dir };
    }),
);

server.registerTool(
  "coverage",
  {
    description:
      "What's missing in a series: cast/places/props/wardrobe without canonical refs, shots without references, frames chosen, takes approved, spend per episode.",
    inputSchema: { slug },
  },
  ({ slug }) =>
    run(async () => {
      const s = await studio.loadSeries(slug);
      const eps = await Promise.all(s.episodes.map((e) => studio.loadEpisode(slug, e.ref)));
      return seriesCoverage(s, eps, await studio.readLedger(slug));
    }),
);

server.registerTool(
  "log_generation",
  {
    description:
      "Record a frame or video take you generated: the full prompt, refs, model, params, cost and output path. Every generation must be logged so takes keep their provenance.",
    inputSchema: {
      slug,
      episode,
      shot: z.string(),
      kind: z.enum(["frame", "take"]),
      model: z.string(),
      prompt: z.string(),
      refs: z.array(z.string()).default([]),
      params: z.record(z.unknown()).default({}),
      costUsd: z.number().nonnegative().default(0),
      output: z.string().optional(),
      sourceFrame: z.string().optional().describe("Generation id of the frame a take was made from"),
    },
  },
  ({ slug, ...rest }) => run(() => studio.appendLedger(slug, { type: "generation", ...rest })),
);

server.registerTool(
  "record_verdict",
  {
    description:
      "Judge a generation. judge=claude for frame review, gemini for video/sound review, director for the user's final call. verdict=chosen marks the frame to animate; pass approves a take.",
    inputSchema: {
      slug,
      generation: z.string().describe("Ledger id like G00012"),
      judge: z.enum(["claude", "gemini", "director"]),
      verdict: z.enum(["pass", "fail", "chosen"]),
      notes: z.string().default(""),
    },
  },
  ({ slug, ...rest }) => run(() => studio.appendLedger(slug, { type: "verdict", ...rest })),
);

server.registerTool(
  "get_ledger",
  { description: "Read the generation and verdict ledger.", inputSchema: { slug } },
  ({ slug }) => run(() => studio.readLedger(slug)),
);

server.registerTool(
  "propose_rule",
  {
    description:
      "Turn a correction into a rule for the show's skill. Abstract it: state the general rule, not the one-off fix. The director adopts or rejects it.",
    inputSchema: {
      slug,
      text: z.string(),
      scope: z.enum(["shot", "series", "genre", "global"]).default("series"),
      origin: z.string().optional().describe("e.g. S01E01/SC02-SH01 or a ledger id"),
    },
  },
  ({ slug, ...rest }) => run(() => studio.proposeRule(slug, rest)),
);

server.registerTool(
  "set_rule_status",
  {
    description: "Adopt or reject a proposed rule. Only do this when the director says so.",
    inputSchema: { slug, id: z.string(), status: z.enum(["adopted", "rejected", "proposed"]) },
  },
  ({ slug, id, status }) => run(() => studio.setRuleStatus(slug, id, status)),
);

await server.connect(new StdioServerTransport());
