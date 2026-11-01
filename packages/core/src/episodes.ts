import type { EpisodeRef } from "./schema.ts";

export function parseEpisodeRef(ref: string): { season: number; episode: number } {
  const m = /^S(\d{2})E(\d{2})$/.exec(ref);
  if (!m) throw new Error(`Invalid episode ref "${ref}" (expected like S01E03)`);
  return { season: Number(m[1]), episode: Number(m[2]) };
}

export function episodeRef(season: number, episode: number): EpisodeRef {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

/** Compare two episode refs: negative if a < b. */
export function compareEpisodes(a: string, b: string): number {
  const x = parseEpisodeRef(a);
  const y = parseEpisodeRef(b);
  return x.season - y.season || x.episode - y.episode;
}

/** True if `ep` is inside the inclusive range [from, until]. Missing bounds are open. */
export function inRange(ep: string, from?: string, until?: string): boolean {
  if (from && compareEpisodes(ep, from) < 0) return false;
  if (until && compareEpisodes(ep, until) > 0) return false;
  return true;
}
