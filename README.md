# Series Studio

A personal production studio for **AI-generated series**: shows with recurring characters, places and a consistent look, not one-off clips.

Everything lives in one **production record**: a folder of human-readable files holding the series Bible, characters (and how they change over time), wardrobe, props, locations, reference frames, scripts, shots, skill rules and a ledger of every generation. The web UI, the CLI and Claude (through MCP) all read and write that same record. Every correction you make becomes a rule in the show's skill, so each episode comes out right sooner than the last.

- 📄 Product requirements: [`docs/PRD.md`](docs/PRD.md)

## Status

| Milestone (from the PRD) | State |
|---|---|
| M1: Bible & references | ✅ record format, cast / places / props / wardrobe, reference frames, usage rules, characters over time |
| M2: Shots & prompt assembly | ✅ shot lists linked to the Bible, prompt assembly with model adapters, coverage, MCP server |
| M3: Generation & ledger | 🟡 ledger and verdicts done; calling image/video providers is next |
| M4: Review & learning loop | 🟡 rules (propose → adopt) done; judge integrations next |
| M5–M6: Pilot cut, episode 2 | ⏳ |

## Quick start

Requires Node 20+ and pnpm.

```bash
pnpm install
```

```bash
pnpm studio example
```

```bash
pnpm --filter @studio/web build && pnpm server
```

Open http://localhost:4317. For live-reloading UI development, run `pnpm dev` instead and open http://localhost:5173.

Data lives in `./studio-data` by default. Set `STUDIO_ROOT` to use another folder, such as a separate git repo per show.

## CLI

```bash
pnpm studio list
```

```bash
pnpm studio coverage tidewatch
```

```bash
pnpm studio prompt tidewatch S01E01 SC01-SH01 cinematic
```

Other commands: `new`, `episode`, `show`, `adapters`, `rules`, `rule`, `adopt` and `reject`. Run `pnpm studio` with no arguments for help.

## Use it from Claude Code (MCP)

```bash
claude mcp add series-studio -e STUDIO_ROOT="$PWD/studio-data" -- pnpm --dir "$PWD" -s mcp
```

Claude then has 18 tools, including `get_series`, `save_character`, `save_asset`, `save_shots`, `assemble_prompt`, `coverage`, `log_generation`, `record_verdict` and `propose_rule`. Example asks:

- "Read the Tidewatch Bible and break the S01E01 script into shots."
- "Assemble the prompt for SC02-SH01 and tell me what references are missing."
- "That take had the lamp lit from below. Propose a rule so it doesn't happen again."

## The production record

```
studio-data/series/<slug>/
  series.yaml            title, logline, format (16:9 | 9:16 | 21:9), default model adapters
  bible.md               world, tone, story rules every episode inherits
  look.md                visual language (YAML frontmatter: style, palette, camera, lighting, avoid, formatRules)
  skill/SKILL.md         the show's skill
  skill/rules.yaml       rules learned from corrections (proposed → adopted)
  cast/<id>/character.yaml + refs/        locked prompt, reference frames, states over time
  places|props|wardrobe/<id>/asset.yaml + refs/   reference frames + usage rules (scoped by episode)
  seasons/<ss>/episodes/<ee>/episode.yaml, script.md, shots.yaml
  continuity.yaml
  ledger.jsonl           every generation (full prompt, refs, model, cost) and every verdict
```

Key ideas:
- **Canonical refs.** Only references marked `canonical: true` are sent to models. Other images are candidates.
- **Characters over time.** A state like `{from: S01E03, change: "scar on left cheek"}` changes the prompt (and optionally the refs) from that episode on.
- **Usage rules.** For example, `{text: "only wears the red scarf from S01E04", from: S01E04}`.
- **Adapters.** One shared shot description is rendered in each model's own prompt style, within that model's limits (reference count, duration, aspect ratio). Add a model by adding an adapter in `packages/core/src/adapters.ts`.

## Layout

```
packages/core     schemas, record I/O, prompt assembly, adapters, coverage (+ tests)
packages/cli      `pnpm studio …`
packages/mcp      MCP server for Claude
packages/server   local API + serves the built web app
apps/web          React UI
examples/         Tidewatch, an example series with placeholder reference frames
```

## Development

```bash
pnpm test
```

```bash
pnpm typecheck
```
