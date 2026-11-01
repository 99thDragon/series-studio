import type { LoadedEpisode, LoadedSeries } from "./record.ts";
import type { LedgerEntry } from "./schema.ts";
import { buildSharedCore } from "./prompt.ts";

export interface EpisodeCoverage {
  ref: string;
  title: string;
  scenes: number;
  shots: number;
  shotsMissingRefs: string[];
  unknownEntities: string[];
  framesGenerated: number;
  shotsWithChosenFrame: number;
  takesGenerated: number;
  takesApproved: number;
  shotsApproved: number;
  spendUsd: number;
  pipeline: { stage: string; done: number; total: number; note?: string }[];
}

export interface SeriesCoverage {
  castInProduction: number;
  castMissingRefs: string[];
  extrasUnrendered: string[];
  placesMissingRefs: string[];
  propsMissingRefs: string[];
  wardrobeMissingRefs: string[];
  rules: { proposed: number; adopted: number };
  spendUsd: number;
  episodes: EpisodeCoverage[];
}

const hasCanonical = (refs: { canonical: boolean }[]) => refs.some((r) => r.canonical);

export function episodeCoverage(series: LoadedSeries, ep: LoadedEpisode, ledger: LedgerEntry[]): EpisodeCoverage {
  const shots = ep.shots.scenes.flatMap((s) => s.shots);
  const shotsMissingRefs: string[] = [];
  const unknown = new Set<string>();
  for (const sh of shots) {
    const core = buildSharedCore(series, ep.ref, ep.shots.scenes, sh.id);
    if (core.warnings.some((w) => w.includes("no canonical reference"))) shotsMissingRefs.push(sh.id);
    core.warnings.filter((w) => w.startsWith("Unknown")).forEach((w) => unknown.add(w));
  }

  const gens = ledger.filter((e): e is Extract<LedgerEntry, { type: "generation" }> => e.type === "generation" && e.episode === ep.ref);
  const verdicts = ledger.filter((e): e is Extract<LedgerEntry, { type: "verdict" }> => e.type === "verdict");
  const directorVerdict = (genId: string, v: string) =>
    verdicts.some((x) => x.generation === genId && x.judge === "director" && x.verdict === v);

  const frames = gens.filter((g) => g.kind === "frame");
  const takes = gens.filter((g) => g.kind === "take");
  const chosenFrameShots = new Set(frames.filter((f) => directorVerdict(f.id, "chosen")).map((f) => f.shot));
  const approvedTakes = takes.filter((t) => directorVerdict(t.id, "pass"));
  const approvedShots = new Set(approvedTakes.map((t) => t.shot));

  const scriptLines = ep.script.split("\n").filter((l) => l.trim() && !l.startsWith("#")).length;
  const live = shots.filter((s) => s.status !== "dropped");

  return {
    ref: ep.ref,
    title: ep.meta.title,
    scenes: ep.shots.scenes.length,
    shots: shots.length,
    shotsMissingRefs,
    unknownEntities: [...unknown],
    framesGenerated: frames.length,
    shotsWithChosenFrame: chosenFrameShots.size,
    takesGenerated: takes.length,
    takesApproved: approvedTakes.length,
    shotsApproved: approvedShots.size,
    spendUsd: Math.round(gens.reduce((s, g) => s + g.costUsd, 0) * 100) / 100,
    pipeline: [
      { stage: "Story", done: scriptLines > 0 ? 1 : 0, total: 1, note: scriptLines ? `${scriptLines} lines` : "no script yet" },
      { stage: "Shots", done: shots.length, total: shots.length, note: `${ep.shots.scenes.length} scenes` },
      { stage: "References", done: live.length - shotsMissingRefs.length, total: live.length, note: `${shotsMissingRefs.length} without a picture` },
      { stage: "Frames", done: chosenFrameShots.size, total: live.length, note: `${frames.length} generated` },
      { stage: "Takes", done: approvedShots.size, total: live.length, note: `${approvedTakes.length}/${takes.length} approved` },
    ],
  };
}

export function seriesCoverage(series: LoadedSeries, episodes: LoadedEpisode[], ledger: LedgerEntry[]): SeriesCoverage {
  const usedCast = new Set(episodes.flatMap((e) => e.shots.scenes.flatMap((s) => s.shots.flatMap((sh) => sh.cast.map((c) => c.id)))));
  const inProduction = series.cast.filter((c) => !c.extra || usedCast.has(c.id));
  return {
    castInProduction: inProduction.length,
    castMissingRefs: inProduction.filter((c) => !hasCanonical(c.refs)).map((c) => c.id),
    extrasUnrendered: series.cast.filter((c) => c.extra && !usedCast.has(c.id)).map((c) => c.id),
    placesMissingRefs: series.places.filter((p) => !hasCanonical(p.refs)).map((p) => p.id),
    propsMissingRefs: series.props.filter((p) => !hasCanonical(p.refs)).map((p) => p.id),
    wardrobeMissingRefs: series.wardrobe.filter((w) => !hasCanonical(w.refs)).map((w) => w.id),
    rules: {
      proposed: series.rules.filter((r) => r.status === "proposed").length,
      adopted: series.rules.filter((r) => r.status === "adopted").length,
    },
    spendUsd:
      Math.round(ledger.reduce((s, e) => s + (e.type === "generation" ? e.costUsd : 0), 0) * 100) / 100,
    episodes: episodes.map((ep) => episodeCoverage(series, ep, ledger)),
  };
}
