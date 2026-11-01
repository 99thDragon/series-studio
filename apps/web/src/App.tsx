import { useCallback, useEffect, useState } from "react";
import {
  api,
  fileUrl,
  type AdapterInfo,
  type AssembledPrompt,
  type LedgerEntry,
  type LoadedEpisode,
  type LoadedSeries,
  type SeriesCoverage,
  type SeriesMeta,
} from "./api";

type View =
  | { name: "dashboard" }
  | { name: "bible" }
  | { name: "look" }
  | { name: "cast" }
  | { name: "places" | "props" | "wardrobe" }
  | { name: "rules" }
  | { name: "ledger" }
  | { name: "episode"; ref: string };

type Ref = { file: string; kind: string; label?: string; canonical: boolean };

export function App() {
  const [all, setAll] = useState<SeriesMeta[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [series, setSeries] = useState<LoadedSeries | null>(null);
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSeries().then((list) => {
      setAll(list);
      if (list.length) setSlug(list[0].slug);
    }, (e) => setError(e.message));
  }, []);

  const reload = useCallback(() => {
    if (!slug) return;
    api.series(slug).then(setSeries, (e) => setError(e.message));
  }, [slug]);
  useEffect(reload, [reload]);

  if (error) return <div className="empty">⚠ {error}</div>;
  if (!all) return <div className="empty">Loading…</div>;
  if (!all.length)
    return (
      <div className="empty">
        <h1>Series Studio</h1>
        <p>No series yet. Create one with <code>pnpm studio new my-show "My Show"</code>, or load the example with <code>pnpm studio example</code>.</p>
      </div>
    );

  const nav = (v: View, label: string, count?: number) => {
    const active = v.name === view.name && (v.name !== "episode" || (view.name === "episode" && view.ref === v.ref));
    return (
      <button key={label} className={`nav ${active ? "active" : ""}`} onClick={() => setView(v)}>
        <span>{label}</span>
        {count !== undefined && <span className="count">{count}</span>}
      </button>
    );
  };

  return (
    <div className="shell">
      <aside>
        <div className="brand">SERIES<br />STUDIO</div>
        <select value={slug ?? ""} onChange={(e) => { setSlug(e.target.value); setView({ name: "dashboard" }); }}>
          {all.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}
        </select>
        {series && (
          <>
            <div className="group">Production</div>
            {nav({ name: "dashboard" }, "Dashboard")}
            {nav({ name: "ledger" }, "Ledger")}
            <div className="group">World</div>
            {nav({ name: "bible" }, "Bible")}
            {nav({ name: "look" }, "Look")}
            {nav({ name: "cast" }, "Cast", series.cast.length)}
            {nav({ name: "places" }, "Places", series.places.length)}
            {nav({ name: "props" }, "Props", series.props.length)}
            {nav({ name: "wardrobe" }, "Wardrobe", series.wardrobe.length)}
            <div className="group">Skill</div>
            {nav({ name: "rules" }, "Rules", series.rules.filter((r) => r.status === "proposed").length || undefined)}
            <div className="group">Episodes</div>
            {series.episodes.map((e) => nav({ name: "episode", ref: e.ref }, `${e.ref} ${e.meta.title}`))}
          </>
        )}
      </aside>
      <main>
        {!series ? <p>Loading…</p> : (
          <>
            {view.name === "dashboard" && <Dashboard series={series} open={(ref) => setView({ name: "episode", ref })} />}
            {view.name === "bible" && <Bible series={series} onSaved={reload} />}
            {view.name === "look" && <LookView series={series} />}
            {view.name === "cast" && <CastView series={series} />}
            {(view.name === "places" || view.name === "props" || view.name === "wardrobe") && <AssetView series={series} kind={view.name} />}
            {view.name === "rules" && <RulesView series={series} onChange={reload} />}
            {view.name === "ledger" && <LedgerView slug={series.meta.slug} />}
            {view.name === "episode" && <EpisodeView series={series} epRef={view.ref} />}
          </>
        )}
      </main>
    </div>
  );
}

function Header({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <header className="head">
      <div className="kicker">{kicker}</div>
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </header>
  );
}

function Dashboard({ series, open }: { series: LoadedSeries; open: (ref: string) => void }) {
  const [cov, setCov] = useState<SeriesCoverage | null>(null);
  useEffect(() => { api.coverage(series.meta.slug).then(setCov); }, [series]);
  if (!cov) return <p>Loading…</p>;
  const missing = (label: string, xs: string[]) => (
    <div className={`stat ${xs.length ? "warn" : "good"}`}>
      <div className="num">{xs.length}</div>
      <div>{label}</div>
      {xs.length > 0 && <div className="small">{xs.join(", ")}</div>}
    </div>
  );
  return (
    <>
      <Header kicker={`${series.meta.genre || "series"} · ${series.meta.format}`} title={series.meta.title} sub={series.meta.logline} />
      <div className="stats">
        <div className="stat"><div className="num">{cov.castInProduction}</div><div>cast in the production</div>
          {cov.extrasUnrendered.length > 0 && <div className="small">{cov.extrasUnrendered.length} extras stay unrendered until a scene needs them</div>}</div>
        {missing("cast without a reference", cov.castMissingRefs)}
        {missing("places without a reference", cov.placesMissingRefs)}
        {missing("props / wardrobe without a reference", [...cov.propsMissingRefs, ...cov.wardrobeMissingRefs])}
        <div className="stat"><div className="num">{cov.rules.adopted}</div><div>rules in the skill</div><div className="small">{cov.rules.proposed} proposed</div></div>
        <div className="stat"><div className="num">${cov.spendUsd.toFixed(2)}</div><div>spent on renders</div></div>
      </div>
      <h2>Episodes</h2>
      {cov.episodes.length === 0 && <p className="muted">No episodes yet.</p>}
      {cov.episodes.map((e) => (
        <div key={e.ref} className="card episode" onClick={() => open(e.ref)}>
          <div className="row"><strong>{e.ref}</strong><span>{e.title}</span><span className="muted">${e.spendUsd.toFixed(2)}</span></div>
          <div className="pipeline">
            {e.pipeline.map((p) => (
              <div key={p.stage} className="stage">
                <div className="label">{p.stage}</div>
                <div className="bar"><div style={{ width: `${p.total ? (100 * p.done) / p.total : 0}%` }} /></div>
                <div className="small">{p.done}/{p.total} · {p.note}</div>
              </div>
            ))}
          </div>
          {e.unknownEntities.length > 0 && <div className="warnline">⚠ {e.unknownEntities.join("; ")}</div>}
        </div>
      ))}
    </>
  );
}

function Bible({ series, onSaved }: { series: LoadedSeries; onSaved: () => void }) {
  const [text, setText] = useState(series.bible);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => setText(series.bible), [series.bible]);
  const save = async () => {
    setState("saving");
    await api.saveBible(series.meta.slug, text);
    setState("saved");
    onSaved();
  };
  return (
    <>
      <Header kicker="World" title="Series Bible" sub="Story, style and the rules every episode inherits." />
      <textarea className="editor" value={text} onChange={(e) => { setText(e.target.value); setState("idle"); }} />
      <div className="row">
        <button className="primary" onClick={save} disabled={state === "saving" || text === series.bible}>Save</button>
        {state === "saved" && <span className="muted">Saved</span>}
      </div>
    </>
  );
}

function LookView({ series }: { series: LoadedSeries }) {
  const l = series.look;
  const rows: [string, string][] = [["Style", l.style], ["Palette", l.palette], ["Camera", l.camera], ["Lighting", l.lighting], ["Avoid", l.avoid.join(", ")]];
  return (
    <>
      <Header kicker="World" title="Look" sub="The visual language: written once, adapted for each model." />
      <dl className="look">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="muted">—</span>}</dd></div>)}</dl>
      {Object.entries(l.formatRules).map(([fmt, rules]) => (
        <div key={fmt} className="card"><strong>{fmt} rules</strong><ul>{rules.map((r) => <li key={r}>{r}</li>)}</ul></div>
      ))}
      {series.lookNotes && <pre className="notes">{series.lookNotes}</pre>}
      <p className="muted small">Edit <code>look.md</code> or use the <code>save_look</code> MCP tool.</p>
    </>
  );
}

function Refs({ slug, base, refs }: { slug: string; base: string; refs: Ref[] }) {
  if (!refs.length) return <div className="noref">No reference frame</div>;
  return (
    <div className="refs">
      {refs.map((r) => (
        <figure key={r.file} className={r.canonical ? "canon" : "candidate"} title={r.canonical ? "canonical (locked)" : "candidate"}>
          <img src={fileUrl(slug, `${base}/${r.file}`)} alt={r.label ?? r.kind} loading="lazy" />
          <figcaption>{r.label ?? r.kind}{r.canonical ? " 🔒" : ""}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function CastView({ series }: { series: LoadedSeries }) {
  return (
    <>
      <Header kicker="World" title="Cast" sub="Canonical reference frames are locked and sent to models. Characters change over time through states." />
      <div className="grid">
        {series.cast.map((c) => (
          <div key={c.id} className="card">
            <div className="row"><strong>{c.name}</strong>{c.extra && <span className="tag">extra</span>}<code className="muted">{c.id}</code></div>
            <p>{c.description}</p>
            <Refs slug={series.meta.slug} base={`cast/${c.id}`} refs={c.refs} />
            {c.prompt && <p className="small"><span className="muted">Locked prompt:</span> {c.prompt}</p>}
            {c.personality && <p className="small"><span className="muted">Personality:</span> {c.personality}</p>}
            {c.states.length > 0 && (
              <div className="states">
                <div className="muted small">Over time</div>
                {c.states.map((s, i) => <div key={i} className="state"><code>{s.from}{s.until ? `–${s.until}` : "+"}</code> {s.change}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function AssetView({ series, kind }: { series: LoadedSeries; kind: "places" | "props" | "wardrobe" }) {
  const title = { places: "Places", props: "Props", wardrobe: "Wardrobe" }[kind];
  return (
    <>
      <Header kicker="World" title={title} sub="A reference frame for each, and rules for when to use or change it." />
      <div className="grid">
        {series[kind].map((a) => (
          <div key={a.id} className="card">
            <div className="row"><strong>{a.name}</strong><code className="muted">{a.id}</code>{a.owner && <span className="tag">{a.owner}</span>}</div>
            <p>{a.description}</p>
            <Refs slug={series.meta.slug} base={`${kind}/${a.id}`} refs={a.refs} />
            {a.rules.length > 0 && (
              <ul className="rules">{a.rules.map((r, i) => <li key={i}>{r.text}{(r.from || r.until) && <code> {r.from ?? ""}–{r.until ?? ""}</code>}</li>)}</ul>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function RulesView({ series, onChange }: { series: LoadedSeries; onChange: () => void }) {
  const set = async (id: string, status: "adopted" | "rejected") => {
    await api.setRule(series.meta.slug, id, status);
    onChange();
  };
  const groups = ["proposed", "adopted", "rejected"] as const;
  return (
    <>
      <Header kicker="Skill" title="Rules" sub="Each correction becomes a rule; the rules become the skill. Adopted rules go into every prompt." />
      {groups.map((g) => {
        const rules = series.rules.filter((r) => r.status === g);
        if (!rules.length) return null;
        return (
          <section key={g}>
            <h2>{g[0].toUpperCase() + g.slice(1)} <span className="muted">({rules.length})</span></h2>
            {rules.map((r) => (
              <div key={r.id} className="card rule">
                <div className="row"><code>{r.id}</code><span className="tag">{r.scope}</span>{r.origin && <span className="muted small">← {r.origin}</span>}</div>
                <p>{r.text}</p>
                {g === "proposed" && (
                  <div className="row">
                    <button className="primary" onClick={() => set(r.id, "adopted")}>Adopt</button>
                    <button onClick={() => set(r.id, "rejected")}>Reject</button>
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {series.rules.length === 0 && <p className="muted">No rules yet. They appear as you correct shots.</p>}
    </>
  );
}

function LedgerView({ slug }: { slug: string }) {
  const [rows, setRows] = useState<LedgerEntry[] | null>(null);
  useEffect(() => { api.ledger(slug).then(setRows); }, [slug]);
  if (!rows) return <p>Loading…</p>;
  return (
    <>
      <Header kicker="Production" title="Ledger" sub="Every generation keeps its full prompt and references, plus every judgement." />
      {rows.length === 0 ? <p className="muted">Nothing generated yet.</p> : (
        <table>
          <thead><tr><th>ID</th><th>When</th><th>What</th><th>Shot</th><th>Model / judge</th><th>Cost / verdict</th></tr></thead>
          <tbody>
            {rows.map((r) => r.type === "generation" ? (
              <tr key={r.id} title={r.prompt}><td><code>{r.id}</code></td><td>{r.at.slice(0, 16).replace("T", " ")}</td><td>{r.kind}</td><td>{r.episode} {r.shot}</td><td>{r.model}</td><td>${r.costUsd.toFixed(2)}</td></tr>
            ) : (
              <tr key={r.id} className="verdict"><td><code>{r.id}</code></td><td>{r.at.slice(0, 16).replace("T", " ")}</td><td>verdict on {r.generation}</td><td></td><td>{r.judge}</td><td>{r.verdict}{r.notes ? ` — ${r.notes}` : ""}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function EpisodeView({ series, epRef }: { series: LoadedSeries; epRef: string }) {
  const slug = series.meta.slug;
  const [ep, setEp] = useState<LoadedEpisode | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [tab, setTab] = useState<"shots" | "script">("shots");
  useEffect(() => { setEp(null); setShot(null); api.episode(slug, epRef).then(setEp); }, [slug, epRef]);
  if (!ep) return <p>Loading…</p>;
  const name = (id: string, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? `⚠ ${id}`;
  return (
    <>
      <Header kicker={`Episode · ${ep.ref}`} title={ep.meta.title} sub={ep.meta.logline} />
      <div className="tabs">
        <button className={tab === "shots" ? "active" : ""} onClick={() => setTab("shots")}>Scenes &amp; shots</button>
        <button className={tab === "script" ? "active" : ""} onClick={() => setTab("script")}>Script</button>
      </div>
      {tab === "script" ? <pre className="notes">{ep.script}</pre> : (
        <div className="episode-layout">
          <div>
            {ep.shots.scenes.length === 0 && <p className="muted">No shots yet. Ask Claude to break the script into shots (MCP tool <code>save_shots</code>).</p>}
            {ep.shots.scenes.map((sc) => (
              <section key={sc.id} className="scene">
                <div className="row"><span className="chip">{sc.id}</span><strong>{sc.place ? name(sc.place, series.places) : "—"}</strong><span className="muted">{sc.timeOfDay}</span></div>
                {sc.summary && <p className="muted small">{sc.summary}</p>}
                {sc.shots.map((sh) => (
                  <div key={sh.id} className={`card shot ${shot === sh.id ? "selected" : ""}`} onClick={() => setShot(sh.id)}>
                    <div className="row"><code>{sh.id}</code><span className={`tag status-${sh.status}`}>{sh.status}</span><span className="muted small">{sh.durationSec}s · {sh.camera}</span></div>
                    <p>{sh.action}</p>
                    {sh.dialogue && <p className="dialogue">“{sh.dialogue}”</p>}
                    <div className="small muted">
                      {sh.cast.map((c) => name(c.id, series.cast) + (c.wardrobe.length ? ` (${c.wardrobe.map((w) => name(w, series.wardrobe)).join(", ")})` : "")).join(" · ")}
                      {sh.props.length > 0 && ` · props: ${sh.props.map((p) => name(p, series.props)).join(", ")}`}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="side">{shot ? <PromptPanel slug={slug} epRef={ep.ref} shot={shot} defaultAdapter={series.meta.models.video} /> : <p className="muted">Select a shot to assemble its prompt.</p>}</div>
        </div>
      )}
    </>
  );
}

function PromptPanel({ slug, epRef, shot, defaultAdapter }: { slug: string; epRef: string; shot: string; defaultAdapter: string }) {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [adapter, setAdapter] = useState(defaultAdapter);
  const [p, setP] = useState<AssembledPrompt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.adapters().then(setAdapters); }, []);
  useEffect(() => {
    setP(null); setErr(null); setCopied(false);
    api.prompt(slug, epRef, shot, adapter).then(setP, (e) => setErr(e.message));
  }, [slug, epRef, shot, adapter]);
  return (
    <div className="card prompt">
      <div className="row">
        <strong>Prompt · {shot}</strong>
        <select value={adapter} onChange={(e) => setAdapter(e.target.value)}>
          {adapters.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      {err && <div className="warnline">⚠ {err}</div>}
      {p && (
        <>
          {p.warnings.map((w) => <div key={w} className="warnline">⚠ {w}</div>)}
          <pre>{p.prompt}</pre>
          {p.negative && <p className="small"><span className="muted">Negative:</span> {p.negative}</p>}
          <div className="muted small">{p.durationSec}s · {p.refs.length} reference{p.refs.length === 1 ? "" : "s"}</div>
          <div className="refs">
            {p.refs.map((r) => (
              <figure key={r.path} className="canon"><img src={fileUrl(slug, r.path)} alt={r.label} /><figcaption>{r.role}: {r.entity}</figcaption></figure>
            ))}
            {p.droppedRefs.map((r) => (
              <figure key={r.path} className="dropped" title="Dropped: over this model's reference limit"><img src={fileUrl(slug, r.path)} alt={r.label} /><figcaption>dropped: {r.entity}</figcaption></figure>
            ))}
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(p.prompt); setCopied(true); }}>{copied ? "Copied" : "Copy prompt"}</button>
        </>
      )}
    </div>
  );
}
