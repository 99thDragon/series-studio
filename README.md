# Series Studio

A personal production studio for **AI-generated series**: shows with recurring characters, places and a consistent look, not one-off clips.

Everything lives in a single production record: the series Bible, characters, wardrobe, props, locations, reference frames, scripts, shots, prompts, takes and review notes. Claude and a web UI both read and write that same record. Every correction you make turns into a rule in the show's "skill", so each episode comes out right sooner than the last.

- 📄 Product requirements: [`docs/PRD.md`](docs/PRD.md)

## Build-night slice (Open Source Higgsfield, Comfy NYC, Nov 2 2026)

The first working piece: **one character, consistent shots.** Built on the Comfy Developer Platform (Comfy Router), all on **FLUX 3**.

1. **Cast.** A character's locked prompt fragment produces one canonical reference frame (`bfl/flux-3-image`).
2. **Frames first.** Each shot (action + camera preset) gets a still, conditioned on the reference image so the face, hair and outfit stay the same.
3. **Then video.** Each chosen frame is animated with the shot's camera move (`bfl/flux-3-video`, image-to-video). Draft first, final when it's right.
4. **Ledger.** Every generation is logged to `series/pilot/ledger.jsonl` with its full prompt, references, model, params, credits and time.

The demo scene, "Last Delivery" EP01, is 3 shots of Rin. It cost about 148 credits (~$0.70) end to end.

### Run it

Requires Python 3.10+ and a Comfy API key from [platform.comfy.org](https://platform.comfy.org).

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
echo COMFY_API_KEY=your-key > .env
.venv\Scripts\uvicorn app:app --port 8800
```

Open http://localhost:8800, generate the reference frame, then **Frame all shots**, then **Draft take all shots**, then **Play all takes in order**.

### Layout

```
app.py                     FastAPI server + background render jobs
studio/record.py           the production record (files under series/, media under media/)
studio/render.py           prompt assembly, camera presets, FLUX 3 image + video calls, ledger
web/index.html             the studio UI
series/pilot/              bible.md, look.md, cast/rin/character.json, episodes/01/shots.json, ledger.jsonl
media/                     reference frames, frames, takes (git-ignored)
```

Media never goes in git. Secrets live in `.env` (git-ignored).

## License

MIT
