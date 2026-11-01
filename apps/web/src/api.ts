import type {
  AssembledPrompt,
  EpisodeCoverage,
  LedgerEntry,
  LoadedEpisode,
  LoadedSeries,
  ModelAdapter,
  Rule,
  SeriesCoverage,
  SeriesMeta,
} from "@studio/core";

export type { AssembledPrompt, EpisodeCoverage, LedgerEntry, LoadedEpisode, LoadedSeries, Rule, SeriesCoverage, SeriesMeta };
export type AdapterInfo = Omit<ModelAdapter, "render">;

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

const s = (slug: string) => `/api/series/${encodeURIComponent(slug)}`;

export const api = {
  listSeries: () => req<SeriesMeta[]>("/api/series"),
  adapters: () => req<AdapterInfo[]>("/api/adapters"),
  series: (slug: string) => req<LoadedSeries>(s(slug)),
  coverage: (slug: string) => req<SeriesCoverage>(`${s(slug)}/coverage`),
  ledger: (slug: string) => req<LedgerEntry[]>(`${s(slug)}/ledger`),
  episode: (slug: string, ref: string) => req<LoadedEpisode>(`${s(slug)}/episodes/${ref}`),
  prompt: (slug: string, ref: string, shot: string, adapter?: string) =>
    req<AssembledPrompt>(`${s(slug)}/episodes/${ref}/prompt/${encodeURIComponent(shot)}${adapter ? `?adapter=${adapter}` : ""}`),
  saveBible: (slug: string, markdown: string) =>
    req<{ ok: true }>(`${s(slug)}/bible`, { method: "PUT", body: JSON.stringify({ markdown }) }),
  setRule: (slug: string, id: string, status: Rule["status"]) =>
    req<Rule>(`${s(slug)}/rules/${id}`, { method: "POST", body: JSON.stringify({ status }) }),
};

export const fileUrl = (slug: string, rel: string) => `/files/${encodeURIComponent(slug)}/${rel}`;
