"""Prompt assembly + rendering through Comfy Router. Frames first (FLUX 3 image), then takes (FLUX 3 video, i2v)."""
import base64
import time
from pathlib import Path

import httpx
from comfy_sdk import Comfy
from dotenv import load_dotenv

from . import record

load_dotenv(record.ROOT / ".env")
_client = None

IMAGE_MODEL = "bfl/flux-3-image"
VIDEO_MODEL = "bfl/flux-3-video"

# Camera presets: how the still is framed, and how the video camera moves.
CAMERA = {
    "Static wide": ("wide establishing shot, eye level", "locked-off static camera, wide shot"),
    "Dolly in": ("medium shot, eye level", "slow smooth dolly in toward her face"),
    "Orbit": ("medium full shot", "camera slowly orbits around her"),
    "Crane up": ("low angle medium shot", "camera cranes up and back to reveal the street"),
    "Handheld follow": ("medium shot from behind and to the side", "handheld camera follows her with slight shake"),
}


def client() -> Comfy:
    global _client
    if _client is None:
        _client = Comfy()
    return _client


def _b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def _find_url(obj, exts=(".png", ".jpg", ".jpeg", ".webp", ".mp4")):
    """First http(s) URL in a model's output, preferring ones that look like media."""
    found = []

    def walk(o):
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, str) and o.startswith("http"):
            found.append(o)

    walk(obj)
    for u in found:
        if any(e in u.lower().split("?")[0] for e in exts):
            return u
    return found[0] if found else None


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=300, follow_redirects=True) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)
    return dest


def _run(kind: str, shot: str | None, model: str, args: dict, refs: list[str], dest: Path, timeout=900) -> dict:
    t = time.time()
    res = client().models.run_detailed(model, args, timeout=timeout)
    url = _find_url(res.output)
    if not url:
        raise RuntimeError(f"{model} returned no media URL: {str(res.output)[:300]}")
    _download(url, dest)
    entry = {
        "kind": kind,
        "shot": shot,
        "model": model,
        "prompt": args.get("prompt"),
        "params": {k: v for k, v in args.items() if k not in ("prompt", "images", "keyframes")},
        "refs": refs,
        # Router's header when present, else the provider-reported cost in the body (FLUX video).
        "credits": float(res.credits_used) if res.credits_used else res.output.get("cost"),
        "seconds": round(time.time() - t, 1),
        "output": str(dest.relative_to(record.ROOT)).replace("\\", "/"),
    }
    record.log(entry)
    return entry


def reference(description: str | None = None) -> dict:
    """Generate Rin's canonical reference frame from her locked prompt fragment."""
    ch = record.character()
    if description:
        ch["locked"] = description
    prompt = (
        f"Character reference, full body front view on a plain light grey background: {ch['locked']}. "
        "Neutral pose, arms at sides. Clean anime cel-shaded style."
    )
    dest = record.MEDIA / "refs" / f"rin-{int(time.time())}.png"
    entry = _run("reference", None, IMAGE_MODEL,
                 {"prompt": prompt, "aspect_ratio": "3:4", "resolution": "1k", "grounding": False}, [], dest)
    ch["ref"] = entry["output"]
    record.save_character(ch)
    return entry


def frame_prompt(shot: dict) -> str:
    ch = record.character()
    framing = CAMERA.get(shot["camera"], CAMERA["Static wide"])[0]
    return (
        f"{framing}. {shot['action']}. The character is {ch['locked']}, "
        f"exactly matching the reference image: same face, hair, outfit and colors. {record.look()}."
    )


def take_prompt(shot: dict) -> str:
    move = CAMERA.get(shot["camera"], CAMERA["Static wide"])[1]
    return f"{move}. {shot['action']}. Keep her face, hair and outfit consistent. {record.look()}."


def frame(shot_id: str) -> dict:
    """Frames first: a still for the shot, conditioned on the character's reference frame."""
    ch = record.character()
    if not ch.get("ref"):
        raise RuntimeError("Generate Rin's reference frame first")
    shots = record.shots()
    shot = next(s for s in shots if s["id"] == shot_id)
    prompt = frame_prompt(shot)
    dest = record.MEDIA / "frames" / f"{shot_id}-{int(time.time())}.png"
    entry = _run("frame", shot_id, IMAGE_MODEL,
                 {"prompt": prompt, "images": [_b64(record.ROOT / ch["ref"])], "aspect_ratio": "16:9",
                  "resolution": "1k", "grounding": False},
                 [ch["ref"]], dest)
    record.update_shot(shot_id, frame=entry["output"])
    return entry


def take(shot_id: str, draft: bool = True) -> dict:
    """Then video: animate the chosen frame with the shot's camera move."""
    shots = record.shots()
    shot = next(s for s in shots if s["id"] == shot_id)
    if not shot.get("frame"):
        raise RuntimeError("Generate a frame for this shot first")
    prompt = take_prompt(shot)
    dest = record.MEDIA / "takes" / f"{shot_id}-{int(time.time())}.mp4"
    entry = _run("take", shot_id, VIDEO_MODEL,
                 {"mode": "i2v", "keyframes": [_b64(record.ROOT / shot["frame"])], "prompt": prompt,
                  "duration": 5, "resolution": "hd", "aspect_ratio": "16:9", "draft": draft},
                 [shot["frame"]], dest, timeout=1200)
    record.update_shot(shot_id, take=entry["output"])
    return entry
