#!/usr/bin/env tsx
/** Local API for the web UI. Reads and writes the same production record as the CLI and MCP server. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import {
  PromptError,
  RecordError,
  adapters,
  assemblePrompt,
  buildSharedCore,
  defaultStudio,
  seriesCoverage,
} from "@studio/core";

const studio = defaultStudio();
const app = new Hono();

app.onError((err, c) => {
  const status = err instanceof RecordError || err instanceof PromptError || err.name === "ZodError" || err.message.startsWith("Unknown adapter") ? 400 : 500;
  if (status === 500) console.error(err);
  return c.json({ error: err.message }, status);
});

app.get("/api/adapters", (c) =>
  c.json(Object.values(adapters).map(({ render: _r, ...a }) => a)),
);
app.get("/api/series", async (c) => c.json(await studio.listSeries()));
app.get("/api/series/:slug", async (c) => c.json(await studio.loadSeries(c.req.param("slug"))));

app.get("/api/series/:slug/coverage", async (c) => {
  const slug = c.req.param("slug");
  const s = await studio.loadSeries(slug);
  const eps = await Promise.all(s.episodes.map((e) => studio.loadEpisode(slug, e.ref)));
  return c.json(seriesCoverage(s, eps, await studio.readLedger(slug)));
});

app.get("/api/series/:slug/ledger", async (c) => c.json(await studio.readLedger(c.req.param("slug"))));

app.put("/api/series/:slug/bible", async (c) => {
  const { markdown } = await c.req.json<{ markdown: string }>();
  await studio.saveBible(c.req.param("slug"), markdown);
  return c.json({ ok: true });
});

app.post("/api/series/:slug/rules/:id", async (c) => {
  const { status } = await c.req.json<{ status: "adopted" | "rejected" | "proposed" }>();
  return c.json(await studio.setRuleStatus(c.req.param("slug"), c.req.param("id"), status));
});

app.get("/api/series/:slug/episodes/:ref", async (c) =>
  c.json(await studio.loadEpisode(c.req.param("slug"), c.req.param("ref"))),
);

app.get("/api/series/:slug/episodes/:ref/prompt/:shot", async (c) => {
  const { slug, ref, shot } = c.req.param();
  const s = await studio.loadSeries(slug);
  const ep = await studio.loadEpisode(slug, ref);
  const core = buildSharedCore(s, ref, ep.shots.scenes, shot);
  return c.json(assemblePrompt(core, c.req.query("adapter") ?? s.meta.models.video));
});

/** Reference images and other media inside a series folder. */
app.get("/files/:slug/*", async (c) => {
  const slug = c.req.param("slug");
  const base = path.resolve(studio.seriesDir(slug));
  const rel = decodeURIComponent(c.req.path.slice(`/files/${slug}/`.length));
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) return c.json({ error: "Forbidden" }, 403);
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    const type =
      { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" }[ext] ??
      "application/octet-stream";
    return c.body(data, 200, { "content-type": type });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

// Serve the built web app if present (pnpm --filter @studio/web build).
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.relative(process.cwd(), path.resolve(here, "../../../apps/web/dist"));
app.use("/*", serveStatic({ root: webDist }));
app.get("*", serveStatic({ path: path.join(webDist, "index.html") }));

const port = Number(process.env.PORT ?? 4317);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Series Studio API on http://localhost:${port}  (studio root: ${studio.root})`);
});
