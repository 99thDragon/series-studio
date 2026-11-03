"""The production record: plain JSON/Markdown files under series/<slug>/, media under media/ (git-ignored)."""
import json
import threading
import time
from pathlib import Path

_lock = threading.RLock()

ROOT = Path(__file__).resolve().parent.parent
SERIES = ROOT / "series" / "pilot"
MEDIA = ROOT / "media"


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def look() -> str:
    return (SERIES / "look.md").read_text(encoding="utf-8").strip()


def character() -> dict:
    return read_json(SERIES / "cast" / "rin" / "character.json", {})


def save_character(data: dict) -> None:
    write_json(SERIES / "cast" / "rin" / "character.json", data)


def shots() -> list[dict]:
    return read_json(SERIES / "episodes" / "01" / "shots.json", [])


def save_shots(data: list[dict]) -> None:
    with _lock:
        write_json(SERIES / "episodes" / "01" / "shots.json", data)


def update_shot(shot_id: str, **fields) -> None:
    """Read-modify-write one shot under a lock, so parallel renders don't overwrite each other."""
    with _lock:
        data = shots()
        for s in data:
            if s["id"] == shot_id:
                s.update(fields)
        write_json(SERIES / "episodes" / "01" / "shots.json", data)


def log(entry: dict) -> None:
    """Append one generation to the ledger: prompt, refs, model, params, cost, output."""
    entry = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **entry}
    path = SERIES / "ledger.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def ledger() -> list[dict]:
    path = SERIES / "ledger.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
