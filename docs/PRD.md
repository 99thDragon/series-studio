# Series Studio — Product Requirements Document

| | |
|---|---|
| **Owner** | 99thDragon |
| **Status** | Draft v0.1 |
| **Date** | 2026-11-01 |
| **Audience** | Single user (personal production tool) |

---

## 1. Overview

Series Studio is a personal production tool for making **long-running AI video series**: shows with recurring characters, wardrobe, props, locations and a consistent visual language across episodes and seasons.

The core idea is simple:

> **One clip can be good by luck; a series has to be tracked.**

Series Studio tracks the series. It holds a **Series Bible**, a **reference frame** for every character, outfit, prop and location (plus rules for when each is used or changed), and a **production record** of every script, shot, prompt, take and judgement. An AI agent (Claude) writes prompts and drives the video and image models using that record. The user directs, approves and corrects, and every correction becomes a reusable rule.

## 2. Problem

AI video tools are built for one-offs. Making a series with them breaks down in predictable ways:

- **Drift.** Faces, outfits, props and locations change from shot to shot and episode to episode.
- **No memory.** Each prompt starts from zero. Lessons learned in episode 1 ("motivated light", "staging in depth", "no voices in this shot") have to be re-typed or are lost.
- **Change over time isn't supported.** Characters age, get injured, wear disguises, lose weight. Off-the-shelf tools have no concept of "this character, in this state, from episode 3 on."
- **Scattered assets.** References, prompts, takes and notes live across chat logs, folders and provider dashboards, with no link between a final clip and the prompt and references that made it.
- **Model churn.** Each video model has its own prompt grammar and limits. Rewriting every prompt by hand for each model doesn't scale.

## 3. Inspiration: Rob's "Agentic Video Production" talk and Dagger Virtual Studio

The source is a 95-minute recorded talk, *Agentic Video Production*, in which Rob demos **Dagger Virtual Studio** and the workflow behind a real AI series (*1776*, four episodes). Timestamps below refer to that recording. This section describes his tool for reference only. Series Studio is an independent product built around the same principles.

### 3.1 The seven levels of agentic video production (≈0:01–0:07)
A pyramid where each level hands the agent more of the work, and *a person stays in the loop until the top*:

1. **Writes script and prompt.** A person pastes it into a renderer.
2. **Renders via tools.** Claude calls the video models itself through an MCP server (≈0:09).
3. **Learns the craft.** The visual language is taught to the agent through *skills* (≈0:16).
4. **A series, you in the loop.** Bible, tracked cast, reference frames (≈0:22). **← Series Studio's target level.**
5. Most of the production.
6. Autonomous, gated.
7. Full automation.

"The industry already does levels 1 and 2" (≈0:13). The interesting work starts at level 3.

### 3.2 Skills: teaching the visual language (≈0:16–0:21)
- A "video-shots" skill made of files: `SKILL.md` (≈442 lines) plus a `references/` folder (≈8 files, ≈1,364 lines) covering multishot, per-model guides (e.g. Seedance 2), ultrarealism, model portfolio, dialogue, director styles, filter craft, and the render backend.
- *"A skill tells the agent how to do what it doesn't know, or doesn't know well."*
- **One script, a prompt for each model:** Script (what happens, who says what) → Visual language (genre, shots, staging, light and sound, *from the skills*) → **Adapter** (one per model: its grammar and its limits). There's a shared core (subject, action, camera, light) that each model receives in its own format.
- *"Write the visual language once; adapt it for each model."*

### 3.3 What a series has to track (≈0:23, ≈0:35–0:36)
| Element | What it means |
|---|---|
| **Series Bible** | Story, style and the rules every episode inherits |
| **Characters** | "Consistency is essentially solved; you have to work harder *not* to have it" (with good reference frames) |
| **Characters over time** | They age, lose an ear, wear a disguise, lose weight. *Not in the tools out of the box* |
| **Wardrobe · Props · Locations** | **A reference frame for each, and rules for when to use or change it** |

*"Agents invent their own formats; a defined one lets Claude and the studio share a record."*

### 3.4 Dagger Virtual Studio: the app (≈0:23–0:34)
"Built because nothing else did it." It's a distributed studio where artists collaborate without email, dailies go to clients, media is uploaded and tracked, and a trimmer exports to DaVinci Resolve.

Navigation observed in the demo (≈0:26):
- **Production:** Dashboard, Review Queue (with a pending count), Review Bench, Dailies, Room, Library
- **World:** Cast, Look, Places, Props, Wardrobe, Voices, Music
- **Episodes:** Film
- **Outputs:** Film, Trailer, + New output
- **Studio:** People, Shared with clients

A production pipeline header with progress per stage (≈0:27–0:30): **Story → Cast & places → Scenes & shots** (e.g. 1,105 shots) **→ References** (e.g. "62 without a picture") **→ Frames** (e.g. "20 / 1,104 chosen") **→ Takes** (e.g. "3 / 143 approved") **→ Cut**. Scenes appear as chips (SC01…SC143). Status lines like *"55 in the production · 13 without a reference · 2 extras stay unrendered until a scene needs them"* show the tool reasoning about coverage.

### 3.5 How the skill gets built from corrections (≈0:48–0:53)
- In episode 1, the same shot's prompt grew from **104 words (21 Jul) to 319 words (6 Aug)**. What changed: camera position, staging in depth, motivated light, no voices. *"Every rewrite came from correcting the agent; no prompt was edited by hand."*
- *"Each correction became a rule; the rules became the skill."*
- Inputs to the skill: **corrections** (director's notes on frames and cuts), a **research archive** (guides from X, Reddit and others; the vendor's own guide "isn't the best"), **knowledge bases** (e.g. Revolutionary War uniforms and weapons, from books), and a **standing instruction**: *at every step, abstract the rule, for this genre and others.*
- Loop: next episode → Claude writes prompts with the skills loaded → **renderers: frames first, then shots** → **judged** by Claude, Gemini and the director → back to corrections.
- Result: *"Episode 1 took a long time; episode 2, much less."* Episode 2 cost about **$38 in renders over 133 generations**. Its failure: *"it never learned to bail"*. Twelve takes fought one action before the scene was dropped. *"Not right the first time; right sooner each time."*

### 3.6 Three judges (≈0:54–0:55)
- **Claude reads frames**: the stills you sample. It can't hear the soundtrack without another tool.
- **Gemini watches the video**: motion and sound.
- **The director (you) is the third judge** and decides what passes.
- A repeated finding becomes **a rule in the skill**. Feedback improves the next frame or shot. *"Slop is a type of error; reduce it in the writing, the pictures and the sound."*

### 3.7 Backlot and "one record, many front ends" (≈0:56, ≈1:03)
- **Dagger Backlot:** every version of a shot, its prompt, and how it was made. Intervene by hand and the change goes back to Claude, which learns from it. Vertical shorts have their own visual-language rules, unlike 16:9 or 21:9.
- **One production record** (script, shots, prompts, takes, judgements, decisions), where *every take keeps its full prompt and references*. Front ends: the GUI, Claude Code (even from a phone), and other agents. *"The GUI and the conversation are equivalent; both write the same record."*

### 3.8 Supporting tech mentioned (≈1:10–1:35)
- **What makes a workflow agentic:** plan → tool action → result → reviewer (agent check, then a person), repeated until the result passes.
- **Edit:** FFmpeg from a cut manifest (a decision list and a render). **Inspect:** frames, timing, continuity, defects, with notes timestamped and checked by a person.
- **Render via one MCP server:** "one key, one command". It exposes tools like `list_models`, `model_params`, `compare_models`, `generate_image`, `generate_video`, `video_status`, `download_video`, `upload_asset`, `text_to_speech`, `transcribe`, `generation_cost`, `account_balance`.
- **Inputs that guide the video model:** storyboards, camera paths and depth guides. Claude driving **Blender** and **Unreal** for blockouts. **Draft, then finalize**: cheap draft renders before expensive finals.
- Knowledge accumulated as **≈7,300 lines of markdown** across skills.

## 4. Goals and non-goals

### Goals
1. **Consistency across a series:** the same character, outfit, prop and place look the same in every shot unless the Bible says otherwise.
2. **Memory that compounds:** corrections become rules, and episode N+1 needs fewer takes than episode N.
3. **Full provenance:** every take traces back to its prompt, references, model, parameters, cost and judgement.
4. **Agent-first, GUI-second:** Claude can run the whole loop from a conversation. The UI is for seeing, choosing and correcting.
5. **Model-agnostic:** swap or add video and image models through adapters, without rewriting the Bible or skills.
6. **Cost awareness:** know what each shot, episode and season costs.

### Non-goals (v1)
- Multi-user collaboration, client sharing, permissions or billing (single user only).
- Training or fine-tuning custom models (LoRAs may come later).
- A full non-linear editor. v1 assembles cuts and exports to a real NLE (Resolve or Premiere).
- Levels 6–7 (unattended autonomous production).

## 5. Users and primary use cases

**Primary user:** the owner, a solo creator making AI series (anime-styled and live-action-styled), comfortable with Claude Code and the command line.

| # | Use case |
|---|---|
| U1 | Start a new series: write the Bible, define the look, and generate and approve reference frames for the cast, places, props and wardrobe |
| U2 | Write an episode script and have Claude break it into scenes and shots, linked to Bible entries |
| U3 | Generate key frames per shot (cheap), choose the best, then render video takes (expensive) |
| U4 | Review takes with AI judges, approve or reject with notes, and have those notes become rules |
| U5 | Track a character change over time (an injury in EP3, a new outfit in season 2) |
| U6 | Assemble an episode cut and export it, with a "previously on" recap pulled from the record |
| U7 | Run any of the above from a Claude Code conversation, including from a phone |

## 6. Core concepts and data model

All of this lives in **one production record**: a folder of human-readable files (Markdown and YAML/JSON) that works with git, plus a media store for images and video that stays out of git.

```
series/<series-slug>/
  bible.md                    # world, tone, rules every episode inherits
  look.md                     # visual language: art style, palette, lenses, aspect ratio
  skill/                      # the show's growing skill (rules learned from corrections)
    SKILL.md
    rules/*.md
  cast/<character>/
    character.yaml            # description, personality, voice, locked prompt fragments
    states.yaml               # time-based states: {from: S1E3, change: "scar over left eye"}
    refs/                     # canonical reference frames (turnaround, expressions)
  wardrobe/<item>.yaml + refs/
  props/<item>.yaml + refs/
  places/<location>.yaml + refs/
  voices/, music/
  seasons/<nn>/episodes/<nn>/
    script.md
    shots.yaml                # scene → shot list, each linked to Bible entries
    takes/                    # take metadata (media itself in the media store)
    cut.yaml                  # cut manifest / decision list
  continuity.yaml             # state carried across episodes
  ledger.jsonl                # every generation: prompt, refs, model, params, cost, verdict
```

| Entity | Key fields |
|---|---|
| **Series** | title, logline, format (16:9, 21:9 or 9:16 vertical), seasons |
| **Bible** | world, tone, story rules, "never do" list |
| **Look** | style, palette, lens and camera language, lighting rules, per-format rules (vertical ≠ widescreen) |
| **Character** | name, description, personality, voice id, **locked prompt fragment**, reference frames, **states over time** |
| **Wardrobe / Prop / Place** | description, reference frame(s), **usage rules** ("only at night", "from S1E4 on", "never in interiors") |
| **Episode → Scene → Shot** | shot: action, dialogue, camera, duration, linked cast, wardrobe, props and place, status |
| **Frame** | a still for a shot: prompt, refs used, model, cost, chosen? |
| **Take** | a video for a shot: source frame, prompt (full text), refs, model and params, cost, judge notes, verdict |
| **Judgement** | judge (Claude, Gemini or you), timestamped notes, pass/fail, rule proposed |
| **Rule** | text, origin (which take or note), scope (this shot, this series, this genre, global), status (proposed or adopted) |

**Coverage rules** (inspired by the demo): the system always knows which shots lack a reference, which cast members lack reference frames, and which extras don't need rendering until a scene uses them.

## 7. Key workflows

### 7.1 Series setup
1. User and Claude co-write `bible.md` and `look.md`.
2. Claude proposes the cast, places, props and wardrobe from the Bible.
3. For each, Claude generates reference-frame candidates (character turnarounds and expressions; establishing shots of places). The user picks the canonical ones, and they're locked.
4. The user (or Claude) writes the usage rules for each reference.

### 7.2 Episode production loop (the heart of the product)
```
script ──► shot breakdown ──► prompt assembly ──► FRAMES (cheap) ──► choose
                                   ▲                                    │
                                   │                                    ▼
                            skill rules ◄── corrections ◄── JUDGES ◄── TAKES (video)
                                                         (Claude · Gemini · you)
```
1. **Script → shots.** Claude splits the script into scenes and shots, linking each shot to the Bible entries it uses (who, what they wear, where, which props).
2. **Prompt assembly.** For each shot, the shared core (subject, action, camera, light) is built from the Bible, the linked entries' locked fragments, the shot's current character *states*, and the show's skill rules. A **model adapter** then renders it in the target model's grammar, attaching the right reference images.
3. **Frames first.** Generate key frames for each shot (cheap, fast) and choose one.
4. **Then shots.** Generate video takes from the chosen frame and references (image→video). A draft-quality option comes first, then the final.
5. **Judge.** Claude reviews sampled frames for consistency, anatomy, wardrobe and continuity. Gemini reviews motion and sound. The user makes the final call with notes.
6. **Learn.** Claude turns notes into proposed **rules** with a scope. The user adopts or rejects them, and adopted rules go into `skill/`.
7. **Bail rule.** If a shot fails *N* takes (default 5) or exceeds a cost cap, the system stops and suggests rewriting or dropping the shot instead of fighting it.

### 7.3 Cut and export
Assemble approved takes per a `cut.yaml` manifest with FFmpeg. Add voice (TTS) and music tracks. Export the MP4 and an EDL/XML for Resolve or Premiere. Optionally generate a "previously on" recap from earlier episodes' approved takes.

### 7.4 Continuity across episodes
After each episode, Claude updates `continuity.yaml` (injuries, outfits, possessions, time of day, relationships) and proposes new character **states**. The next episode's prompt assembly uses them automatically.

## 8. Functional requirements

### MVP (v1)
| ID | Requirement |
|---|---|
| F1 | Create a series. Edit the Bible and Look as Markdown |
| F2 | Cast, wardrobe, props and places library, with reference frames, locked prompt fragments and usage rules |
| F3 | Character **states over time** (scoped by season and episode) |
| F4 | Episode script editor. Claude-generated shot breakdown linked to Bible entries |
| F5 | Prompt assembly engine with **per-model adapters** (start with 1 image model and 1–2 image→video models) |
| F6 | Frame generation and selection per shot |
| F7 | Video take generation from the chosen frame and references; async status polling |
| F8 | **Ledger**: every generation logged with full prompt, refs, model, params, cost and verdict |
| F9 | Review queue: approve or reject takes with notes. Claude frame-review and Gemini video-review notes shown inline with timestamps |
| F10 | Corrections → proposed rules → adopted into the series skill |
| F11 | Coverage dashboard: shots without refs, cast without refs, frames chosen, takes approved, spend |
| F12 | Pipeline progress bar per episode: Story → Cast & places → Shots → References → Frames → Takes → Cut |
| F13 | **MCP server** exposing the record and actions to Claude Code (list, read and update entities; assemble prompt; generate; judge; adopt rule) |
| F14 | Bail rule and per-shot / per-episode cost caps |
| F15 | Cut assembly from a manifest (FFmpeg) and export MP4 + EDL |

### Later (v2+)
- Voice: per-character TTS voices, lip-sync.
- Music and sound-effects generation per scene.
- Automated continuity checker (a vision model compares each take to its reference frames and states).
- Blockout guidance: Blender or Unreal camera paths and depth guides as model inputs.
- Vertical-short mode with its own visual-language rules and an automatic reframe.
- "Previously on" and trailer generation.
- Optional sharing (read-only dailies link) if it becomes more than a personal tool.

## 9. AI and provider strategy

| Role | Approach |
|---|---|
| **Planner / writer / prompt author** | Claude (via Claude Code or the API) with the series skill loaded |
| **Frame judge** | Claude vision on sampled stills |
| **Video judge** | A video-understanding model that watches motion and sound (e.g. Gemini) |
| **Reference and key-frame images** | Image model with strong reference/character consistency (swappable) |
| **Video** | Image→video models that accept reference images (swappable; current-generation candidates evaluated at build time) |
| **Voice** | TTS provider (e.g. ElevenLabs) |
| **Transport** | One MCP render server or aggregator API (one key, many models), with each model behind an **adapter** that knows its grammar, limits, parameters and cost |

Model choice is configuration, not code. Each adapter declares its max duration, aspect ratios, number of reference images, prompt style and price.

## 10. Technical approach (suggested)

- **Local-first web app** (e.g. Next.js or SvelteKit) reading and writing the file-based production record. No database is needed for v1; an index can be rebuilt from the files.
- **Media store** on local disk, or object storage (e.g. S3/R2) for large takes; the record holds paths and hashes.
- **MCP server** (TypeScript) over the same record, so Claude Code and the GUI are equivalent front ends.
- **Skills** stored as Markdown inside each series (`skill/`), plus shared global skills (shot craft, per-model guides) that carry across shows and genres.
- **Retrieval over the Bible and skill**, so prompt assembly pulls only the relevant rules and entries for each shot.
- **FFmpeg** for frame sampling, cuts and exports.
- Secrets in `.env`. Media never committed.

## 11. Success metrics

| Metric | Target |
|---|---|
| Takes per approved shot | Falls episode over episode (EP2 ≤ 60% of EP1) |
| Character consistency | ≥ 90% of approved takes judged "on-model" against reference frames |
| Render cost per finished minute | Tracked; trending down across episodes |
| Time to finish an episode | Falls episode over episode |
| Rules adopted per episode | High early, then levelling off as the skill matures |
| Hand-edited prompts | ~0. Fixes go through corrections, not manual prompt edits |

## 12. Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M1: Bible & references** | F1–F3, file format, reference library UI | One series with a Bible, 3 characters, 2 places and locked reference frames |
| **M2: Shots & prompt assembly** | F4–F5, MCP server (read and assemble) | Script → shot list → assembled, model-specific prompts with refs |
| **M3: Generation & ledger** | F6–F8, F11–F12, F14 | Frames and takes generated through Claude; every generation logged with cost |
| **M4: Review & learning loop** | F9–F10 | Judges' notes in the UI; corrections become adopted rules |
| **M5: Pilot episode** | F15 | A complete 2–5 minute pilot cut and exported |
| **M6: Episode 2** | — | Fewer takes per shot than the pilot, which shows the skill is compounding |

## 13. Risks and open questions

| Risk | Mitigation |
|---|---|
| Model drift and churn (models change monthly) | Adapters plus per-model guides in skills; re-validate on model updates |
| Cost runaway on video takes | Frames-first, draft-then-final, bail rule, cost caps, ledger |
| Characters changing over time are unsupported by models | Explicit states, with alternate reference frames per state |
| Judge disagreement or false passes | The user is always the final judge; judge notes are advisory |
| Provider terms of service and likeness rights | Original characters only; no real-person likenesses without consent; check each provider's terms |
| Skill bloat (thousands of lines of rules) | Rule scopes, retrieval, periodic consolidation of the skill |

**Open questions**
1. Which first show? (Anime-style, which ties into the Love Live!-style research in Animastery, or live-action-style?)
2. Which image and video models make up the starting portfolio, and through one aggregator or direct APIs?
3. Target format for the first series: widescreen episodes or vertical shorts?
4. Local disk only, or cloud storage for takes from day one?
5. How much should run unattended (level 5) versus always waiting for approval?

---

*Source: the "Agentic Video Production" talk recording (≈95 min). Timestamps are approximate (±1 min) and come from sampled frames.*
