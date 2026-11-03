"""Series Studio (build-night slice): one character, consistent shots. Run: .venv\\Scripts\\uvicorn app:app --port 8800"""
import threading
import traceback

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from studio import record, render

app = FastAPI(title="Series Studio")
record.MEDIA.mkdir(exist_ok=True)
app.mount("/media", StaticFiles(directory=record.MEDIA), name="media")

# key ("ref" or "SH01:frame") -> {"status": "running" | "done" | "error", "error": str}
jobs: dict[str, dict] = {}


def _start(key: str, fn, *args):
    if jobs.get(key, {}).get("status") == "running":
        raise HTTPException(409, f"{key} is already running")
    jobs[key] = {"status": "running"}

    def work():
        try:
            fn(*args)
            jobs[key] = {"status": "done"}
        except Exception as e:  # report the real error to the UI, never invent output
            traceback.print_exc()
            jobs[key] = {"status": "error", "error": (str(e) or type(e).__name__)[:400]}

    threading.Thread(target=work, daemon=True).start()
    return {"ok": True}


@app.get("/")
def index():
    return FileResponse(record.ROOT / "web" / "index.html")


@app.get("/api/state")
def state():
    ledger = record.ledger()
    credits = sum(e.get("credits") or 0 for e in ledger)
    shots = record.shots()
    for s in shots:
        s["frame_prompt"] = render.frame_prompt(s)
        s["take_prompt"] = render.take_prompt(s)
    return {
        "bible": (record.SERIES / "bible.md").read_text(encoding="utf-8"),
        "look": record.look(),
        "character": record.character(),
        "shots": shots,
        "cameras": list(render.CAMERA),
        "jobs": jobs,
        "ledger": ledger[::-1],
        "credits": round(credits, 2),
        "usd": round(credits / 211, 2),
    }


class CharacterIn(BaseModel):
    locked: str


@app.post("/api/reference")
def make_reference(body: CharacterIn):
    return _start("ref", render.reference, body.locked)


class ShotIn(BaseModel):
    id: str
    action: str
    camera: str


@app.post("/api/shots")
def save_shots(body: list[ShotIn]):
    old = {s["id"]: s for s in record.shots()}
    new = []
    for s in body:
        prev = old.get(s.id, {})
        new.append({"id": s.id, "action": s.action, "camera": s.camera,
                    "frame": prev.get("frame"), "take": prev.get("take")})
    record.save_shots(new)
    return {"ok": True}


def _require_shot(shot_id: str) -> None:
    if not any(s["id"] == shot_id for s in record.shots()):
        raise HTTPException(404, f"No shot {shot_id}")


@app.post("/api/shots/{shot_id}/frame")
def make_frame(shot_id: str):
    _require_shot(shot_id)
    return _start(f"{shot_id}:frame", render.frame, shot_id)


@app.post("/api/shots/{shot_id}/take")
def make_take(shot_id: str, final: bool = False):
    _require_shot(shot_id)
    return _start(f"{shot_id}:take", render.take, shot_id, not final)
