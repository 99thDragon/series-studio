#!/usr/bin/env tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RecordError,
  adapters,
  assemblePrompt,
  buildSharedCore,
  defaultStudio,
  seriesCoverage,
} from "@studio/core";

const HELP = `Series Studio CLI

Usage: pnpm studio <command> [args]

  example                         Copy the Tidewatch example series into the studio root
  list                            List series
  new <slug> "<Title>" [format]   Create a series (format: 16:9 | 9:16 | 21:9)
  episode <slug> <S01E01> "<Title>"  Create an episode
  show <slug>                     Series overview: cast, places, props, wardrobe, episodes
  coverage <slug>                 What's missing: refs, frames, takes, spend
  prompt <slug> <S01E01> <shot> [adapter]   Assemble the prompt for a shot
  adapters                        List model adapters
  rules <slug>                    List skill rules
  rule <slug> "<text>" [scope]    Propose a rule (scope: shot | series | genre | global)
  adopt <slug> <R001>             Adopt a proposed rule
  reject <slug> <R001>            Reject a proposed rule

Studio root: $STUDIO_ROOT or ./studio-data
`;

const studio = defaultStudio();
const [cmd, ...args] = process.argv.slice(2);

function need(n: number, usage: string): void {
  if (args.length < n) throw new RecordError(`Usage: pnpm studio ${usage}`);
}

async function main(): Promise<void> {
  switch (cmd) {
    case "example": {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const src = path.resolve(here, "../../../examples/studio-data/series/tidewatch");
      const dest = path.join(studio.root, "series", "tidewatch");
      try {
        await fs.access(dest);
        throw new RecordError(`${dest} already exists`);
      } catch (e) {
        if (e instanceof RecordError) throw e;
      }
      await fs.cp(src, dest, { recursive: true });
      console.log(`Copied example series to ${dest}`);
      return;
    }
    case "list": {
      const all = await studio.listSeries();
      if (!all.length) console.log(`No series under ${studio.root}. Try: pnpm studio example`);
      for (const s of all) console.log(`${s.slug.padEnd(20)} ${s.title}  [${s.format}]  ${s.logline}`);
      return;
    }
    case "new": {
      need(2, 'new <slug> "<Title>" [format]');
      const meta = await studio.createSeries({ slug: args[0], title: args[1], format: (args[2] as any) ?? "16:9" });
      console.log(`Created ${meta.slug} at ${studio.seriesDir(meta.slug)}`);
      return;
    }
    case "episode": {
      need(3, 'episode <slug> <S01E01> "<Title>"');
      const ep = await studio.createEpisode(args[0], args[1], { title: args[2] });
      console.log(`Created ${ep.ref} at ${ep.dir}`);
      return;
    }
    case "show": {
      need(1, "show <slug>");
      const s = await studio.loadSeries(args[0]);
      console.log(`${s.meta.title} [${s.meta.format}] — ${s.meta.logline}\n`);
      const refs = (r: { canonical: boolean }[]) => `${r.filter((x) => x.canonical).length} ref(s)`;
      console.log("Cast");
      for (const c of s.cast)
        console.log(`  ${c.id.padEnd(18)} ${c.name}${c.extra ? " (extra)" : ""} — ${refs(c.refs)}${c.states.length ? `, ${c.states.length} state(s)` : ""}`);
      for (const kind of ["places", "props", "wardrobe"] as const) {
        console.log(kind[0].toUpperCase() + kind.slice(1));
        for (const a of s[kind]) console.log(`  ${a.id.padEnd(18)} ${a.name} — ${refs(a.refs)}${a.rules.length ? `, ${a.rules.length} rule(s)` : ""}`);
      }
      console.log("Episodes");
      for (const e of s.episodes) console.log(`  ${e.ref}  ${e.meta.title}`);
      return;
    }
    case "coverage": {
      need(1, "coverage <slug>");
      const s = await studio.loadSeries(args[0]);
      const eps = await Promise.all(s.episodes.map((e) => studio.loadEpisode(args[0], e.ref)));
      const cov = seriesCoverage(s, eps, await studio.readLedger(args[0]));
      const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");
      console.log(`${cov.castInProduction} cast in the production`);
      console.log(`  missing refs:      ${list(cov.castMissingRefs)}`);
      console.log(`  extras unrendered: ${list(cov.extrasUnrendered)}`);
      console.log(`Places missing refs:   ${list(cov.placesMissingRefs)}`);
      console.log(`Props missing refs:    ${list(cov.propsMissingRefs)}`);
      console.log(`Wardrobe missing refs: ${list(cov.wardrobeMissingRefs)}`);
      console.log(`Rules: ${cov.rules.adopted} adopted, ${cov.rules.proposed} proposed`);
      console.log(`Spend: $${cov.spendUsd.toFixed(2)}\n`);
      for (const e of cov.episodes) {
        console.log(`${e.ref} ${e.title}`);
        for (const p of e.pipeline) console.log(`  ${p.stage.padEnd(11)} ${String(p.done).padStart(3)}/${String(p.total).padEnd(4)} ${p.note ?? ""}`);
        if (e.shotsMissingRefs.length) console.log(`  shots without a reference: ${e.shotsMissingRefs.join(", ")}`);
        if (e.unknownEntities.length) console.log(`  ⚠ ${e.unknownEntities.join("; ")}`);
      }
      return;
    }
    case "prompt": {
      need(3, "prompt <slug> <S01E01> <shot> [adapter]");
      const [slug, ref, shot] = args;
      const s = await studio.loadSeries(slug);
      const ep = await studio.loadEpisode(slug, ref);
      const out = assemblePrompt(buildSharedCore(s, ref, ep.shots.scenes, shot), args[3] ?? s.meta.models.video);
      console.log(`# ${ref} ${shot} — adapter: ${out.adapter}, ${out.durationSec}s\n`);
      console.log(out.prompt);
      if (out.negative) console.log(`\nNEGATIVE: ${out.negative}`);
      console.log(`\nREFS (${out.refs.length}):`);
      for (const r of out.refs) console.log(`  [${r.role}] ${r.path}`);
      for (const r of out.droppedRefs) console.log(`  (dropped) [${r.role}] ${r.path}`);
      for (const w of out.warnings) console.log(`⚠ ${w}`);
      return;
    }
    case "adapters": {
      for (const a of Object.values(adapters))
        console.log(`${a.id.padEnd(12)} ${a.label} — ${a.kind}, max ${a.maxRefs} refs${a.maxDurationSec ? `, ≤${a.maxDurationSec}s` : ""}, ${a.aspectRatios.join(" ")}`);
      return;
    }
    case "rules": {
      need(1, "rules <slug>");
      const s = await studio.loadSeries(args[0]);
      if (!s.rules.length) console.log("No rules yet.");
      for (const r of s.rules) console.log(`${r.id} [${r.status}] (${r.scope}) ${r.text}${r.origin ? `  ← ${r.origin}` : ""}`);
      return;
    }
    case "rule": {
      need(2, 'rule <slug> "<text>" [scope]');
      const r = await studio.proposeRule(args[0], { text: args[1], scope: (args[2] as any) ?? "series" });
      console.log(`Proposed ${r.id}: ${r.text}`);
      return;
    }
    case "adopt":
    case "reject": {
      need(2, `${cmd} <slug> <rule-id>`);
      const r = await studio.setRuleStatus(args[0], args[1], cmd === "adopt" ? "adopted" : "rejected");
      console.log(`${r.id} is now ${r.status}`);
      return;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `Error: ${e.message}` : e);
  process.exit(1);
});
