import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Studio,
  assemblePrompt,
  buildSharedCore,
  compareEpisodes,
  inRange,
  resolveCharacter,
  seriesCoverage,
} from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const example = path.resolve(here, "../../../examples/studio-data");

let studio: Studio;

beforeEach(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "studio-"));
  await fs.cp(example, tmp, { recursive: true });
  studio = new Studio(tmp);
});

describe("episodes", () => {
  it("orders and ranges episode refs", () => {
    expect(compareEpisodes("S01E03", "S01E10")).toBeLessThan(0);
    expect(compareEpisodes("S02E01", "S01E10")).toBeGreaterThan(0);
    expect(inRange("S01E04", "S01E04")).toBe(true);
    expect(inRange("S01E03", "S01E04")).toBe(false);
    expect(inRange("S01E05", undefined, "S01E04")).toBe(false);
  });
});

describe("record", () => {
  it("loads the example series", async () => {
    const s = await studio.loadSeries("tidewatch");
    expect(s.meta.title).toBe("Tidewatch");
    expect(s.cast.map((c) => c.id)).toEqual(["bram", "fisherman", "mira"]);
    expect(s.places.map((p) => p.id)).toEqual(["harbor", "lamp-room"]);
    expect(s.look.style).toContain("anime");
    expect(s.episodes).toEqual([{ ref: "S01E01", meta: expect.objectContaining({ title: "The Lamp Dims" }) }]);
  });

  it("creates a series and an episode, and rejects duplicates", async () => {
    await studio.createSeries({ slug: "pilot", title: "Pilot" });
    await expect(studio.createSeries({ slug: "pilot", title: "Pilot" })).rejects.toThrow(/already exists/);
    await studio.createEpisode("pilot", "S01E01", { title: "One" });
    const ep = await studio.loadEpisode("pilot", "S01E01");
    expect(ep.shots.scenes).toEqual([]);
    expect((await studio.listSeries()).map((s) => s.slug)).toEqual(["pilot", "tidewatch"]);
  });

  it("rejects invalid entities and duplicate shot ids", async () => {
    await expect(studio.saveCharacter("tidewatch", { id: "Bad Id", name: "x" })).rejects.toThrow();
    await expect(
      studio.saveShots("tidewatch", "S01E01", {
        scenes: [{ id: "SC01", shots: [{ id: "A", action: "x" }, { id: "A", action: "y" }] }],
      }),
    ).rejects.toThrow(/Duplicate shot id/);
  });

  it("proposes and adopts rules with sequential ids", async () => {
    const r = await studio.proposeRule("tidewatch", { text: "no lens flares", scope: "series" });
    expect(r.id).toBe("R003");
    await studio.setRuleStatus("tidewatch", "R003", "adopted");
    const s = await studio.loadSeries("tidewatch");
    expect(s.rules.find((x) => x.id === "R003")?.status).toBe("adopted");
  });

  it("appends generations and verdicts to the ledger", async () => {
    const g = await studio.appendLedger("tidewatch", {
      type: "generation", episode: "S01E01", shot: "SC01-SH01", kind: "frame",
      model: "generic", prompt: "p", costUsd: 0.04,
    });
    const v = await studio.appendLedger("tidewatch", {
      type: "verdict", generation: g.id, judge: "director", verdict: "chosen",
    });
    expect([g.id, v.id]).toEqual(["G00001", "V00001"]);
    expect(await studio.readLedger("tidewatch")).toHaveLength(2);
  });
});

describe("characters over time", () => {
  it("applies states only inside their episode range", async () => {
    const s = await studio.loadSeries("tidewatch");
    const mira = s.cast.find((c) => c.id === "mira")!;
    expect(resolveCharacter(mira, "S01E02").prompt).not.toContain("scar");
    expect(resolveCharacter(mira, "S01E03").prompt).toContain("scar");
    expect(resolveCharacter(mira, "S02E01").prompt).toContain("scar");
    // only canonical refs are used
    expect(resolveCharacter(mira, "S01E01").refs.map((r) => r.label)).toEqual(["front", "profile"]);
  });
});

describe("prompt assembly", () => {
  it("builds a shared core from the record", async () => {
    const s = await studio.loadSeries("tidewatch");
    const ep = await studio.loadEpisode("tidewatch", "S01E01");
    const core = buildSharedCore(s, "S01E01", ep.shots.scenes, "SC01-SH01");
    expect(core.subjects.map((x) => x.name)).toEqual(["Mira", "Bram"]);
    expect(core.subjects[0].wardrobe[0]).toContain("oilskin");
    expect(core.setting).toContain("lamp room");
    expect(core.props[0]).toContain("lantern");
    // asset usage rules, format rules and adopted (not proposed) skill rules
    expect(core.rules).toContain("the lamp's amber light is the key light at night");
    expect(core.rules).toContain("keep the horizon line in the lower third for sea wides");
    expect(core.rules.some((r) => r.startsWith("stage figures in depth"))).toBe(true);
    expect(core.rules.some((r) => r.startsWith("never show the lamp from below"))).toBe(false);
    expect(core.refs.map((r) => r.path)).toContain("cast/mira/refs/front.png");
    expect(core.warnings).toEqual([]);
  });

  it("warns about missing refs and unknown entities", async () => {
    const s = await studio.loadSeries("tidewatch");
    const ep = await studio.loadEpisode("tidewatch", "S01E01");
    const core = buildSharedCore(s, "S01E01", ep.shots.scenes, "SC03-SH01");
    expect(core.warnings).toEqual(
      expect.arrayContaining([
        "Drowned fisherman has no canonical reference frame",
        'Place "Gullwick harbor" has no canonical reference frame',
      ]),
    );
    ep.shots.scenes[0].shots[0].props.push("ghost-prop");
    const bad = buildSharedCore(s, "S01E01", ep.shots.scenes, "SC01-SH01");
    expect(bad.warnings).toContain('Unknown prop "ghost-prop"');
  });

  it("renders per adapter and enforces adapter limits", async () => {
    const s = await studio.loadSeries("tidewatch");
    const ep = await studio.loadEpisode("tidewatch", "S01E01");
    const core = buildSharedCore(s, "S01E01", ep.shots.scenes, "SC01-SH01");

    const generic = assemblePrompt(core, "generic");
    expect(generic.prompt).toMatch(/^STYLE: /);
    expect(generic.prompt).toContain("DIALOGUE: Keep it burning.");
    expect(generic.negative).toContain("watermarks");

    const cine = assemblePrompt(core, "cinematic");
    expect(cine.prompt.startsWith("Medium two-shot, slow push in. Mira, 16-year-old girl")).toBe(true);
    expect(cine.prompt).toContain('Dialogue: "Keep it burning. Whatever you hear." ');
    expect(cine.refs).toHaveLength(4);
    expect(cine.droppedRefs).toHaveLength(2);
    expect(cine.refs.every((r, i, a) => i === 0 || ["character", "wardrobe", "place", "prop"].indexOf(a[i - 1].role) <= ["character", "wardrobe", "place", "prop"].indexOf(r.role))).toBe(true);

    const long = buildSharedCore(s, "S01E01", ep.shots.scenes, "SC03-SH01");
    const clamped = assemblePrompt(long, "cinematic");
    expect(clamped.durationSec).toBe(10);
    expect(clamped.warnings.some((w) => w.includes("clamped"))).toBe(true);
    expect(() => assemblePrompt(core, "nope")).toThrow(/Unknown adapter/);
  });

  it("only applies wardrobe rules from their start episode", async () => {
    const s = await studio.loadSeries("tidewatch");
    const scenes = [{ id: "X", summary: "", shots: [{ id: "X1", action: "a", camera: "", durationSec: 5, status: "planned" as const, props: [], cast: [{ id: "mira", wardrobe: ["mira-winter-scarf"] }] }] }];
    const scarfRule = "Mira only wears the red scarf from S01E04 onward";
    expect(buildSharedCore(s, "S01E03", scenes, "X1").rules).not.toContain(scarfRule);
    expect(buildSharedCore(s, "S01E04", scenes, "X1").rules).toContain(scarfRule);
  });
});

describe("coverage", () => {
  it("reports missing refs, unrendered extras and pipeline progress", async () => {
    const s = await studio.loadSeries("tidewatch");
    const ep = await studio.loadEpisode("tidewatch", "S01E01");
    const g = await studio.appendLedger("tidewatch", { type: "generation", episode: "S01E01", shot: "SC01-SH01", kind: "frame", model: "generic", prompt: "p", costUsd: 0.05 });
    await studio.appendLedger("tidewatch", { type: "verdict", generation: g.id, judge: "director", verdict: "chosen" });
    const t = await studio.appendLedger("tidewatch", { type: "generation", episode: "S01E01", shot: "SC01-SH01", kind: "take", model: "cinematic", prompt: "p", costUsd: 0.4 });
    await studio.appendLedger("tidewatch", { type: "verdict", generation: t.id, judge: "director", verdict: "pass" });

    const cov = seriesCoverage(s, [ep], await studio.readLedger("tidewatch"));
    // the fisherman is an extra but is used in SC03, so he counts and is missing refs
    expect(cov.castMissingRefs).toEqual(["fisherman"]);
    expect(cov.extrasUnrendered).toEqual([]);
    expect(cov.placesMissingRefs).toEqual(["harbor"]);
    expect(cov.wardrobeMissingRefs).toEqual(["mira-winter-scarf"]);
    expect(cov.rules).toEqual({ proposed: 1, adopted: 1 });
    expect(cov.spendUsd).toBe(0.45);
    const e = cov.episodes[0];
    expect(e.shots).toBe(4);
    expect(e.shotsMissingRefs).toEqual(["SC03-SH01"]);
    expect(e.shotsWithChosenFrame).toBe(1);
    expect(e.shotsApproved).toBe(1);
    expect(e.pipeline.find((p) => p.stage === "References")).toMatchObject({ done: 3, total: 4 });
  });
});
