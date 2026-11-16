import { useState, useEffect, useRef } from 'react'
import { api } from './api.js'
import { fmt } from './data.js'

const LBL = { positive: 'Positive', mixed: 'Mixed', negative: 'Negative' }
const Badge = ({ s }) => <span className={'sb ' + s}>{LBL[s] || s}</span>

/** Stacked positive / mixed / negative bar. */
const SplitBar = ({ pos, mixed, neg, h = 10 }) => (
  <div className="split" style={{ height: h }} role="img" aria-label={`${pos}% positive, ${mixed}% mixed, ${neg}% negative`}>
    <i className="p" style={{ width: pos + '%' }} /><i className="m" style={{ width: mixed + '%' }} /><i className="n" style={{ width: neg + '%' }} />
  </div>
)

function useFetch(path, deps) {
  const [st, setSt] = useState({ data: null, err: '', loading: true })
  useEffect(() => {
    let live = true
    setSt((s) => ({ ...s, loading: true, err: '' }))
    api('GET', path).then((data) => live && setSt({ data, err: '', loading: false })).catch((e) => live && setSt({ data: null, err: e.message, loading: false }))
    return () => { live = false }
  }, deps)
  return st
}

/** Highlights each sentence by what the model thinks of it. */
const Sentences = ({ list }) => <p className="sents">{list.map((s, i) => <span key={i} className={'sn ' + s.label} title={`${LBL[s.label]} · P(positive) = ${s.p.toFixed(2)}`}>{s.text} </span>)}</p>

const FLAG = {
  'rating-higher-than-text': 'Stars higher than the text', 'rating-lower-than-text': 'Stars lower than the text', 'low-effort': 'Very short review',
  'all-caps': 'ALL CAPS', exaggerated: 'Exaggerated',
}

export function Analysis({ a }) {
  return (
    <div className="analysis">
      <div className="row"><Badge s={a.label} /><span className="muted small">model confidence that the review is positive: <b>{Math.round(a.p * 100)}%</b></span></div>
      <Sentences list={a.sentences} />
      {a.aspects.length > 0 && <div className="tags">{a.aspects.map((x) => <span key={x.key} className={'tag2 ' + x.sentiment} title={x.quote}>{x.label}: {LBL[x.sentiment].toLowerCase()}</span>)}</div>}
      {a.flags.length > 0 && <div className="tags">{a.flags.map((f) => <span key={f} className="tag2 flag">⚠ {FLAG[f] || f}</span>)}</div>}
    </div>
  )
}

function ReviewList({ id, aspect, setAspect }) {
  const [sentiment, setSentiment] = useState(''), [sort, setSort] = useState('helpful'), [limit, setLimit] = useState(6)
  useEffect(() => { setLimit(6) }, [sentiment, sort, aspect, id])
  const q = new URLSearchParams({ sort, limit, ...(sentiment && { sentiment }), ...(aspect && { aspect }) }).toString()
  const { data, err, loading } = useFetch(`/products/${id}/reviews?${q}`, [id, q])
  return (
    <section>
      <div className="filters">
        <div className="tabs sm">{['', 'positive', 'mixed', 'negative'].map((s) => <button key={s} className={sentiment === s ? 'on' : ''} onClick={() => setSentiment(s)}>{s ? LBL[s] : 'All'}</button>)}</div>
        <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="helpful">Most helpful</option><option value="recent">Newest</option><option value="high">Highest stars</option><option value="low">Lowest stars</option></select></label>
        {aspect && <button className="chip" onClick={() => setAspect('')}>Topic: {data?.aspects.find((a) => a.key === aspect)?.label || aspect} ✕</button>}
      </div>
      {err && <p className="err">{err}</p>}
      {data && data.reviews.length === 0 && <p className="muted">No reviews match this filter.</p>}
      {data?.reviews.map((r) => (
        <article className="rv" key={r.id}>
          <div className="row spread"><span><b className="stars">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</b> <b>{r.title}</b></span><Badge s={r.analysis.label} /></div>
          <div className="muted small">{r.author} · {r.market} · {r.date}{r.verified ? ' · ✔ Verified purchase' : ''} · {r.helpful} found helpful</div>
          <Sentences list={r.analysis.sentences} />
          <div className="tags">
            {r.analysis.aspects.map((x) => <button key={x.key} className={'tag2 ' + x.sentiment} onClick={() => setAspect(x.key)} title="Show every review about this">{x.label}</button>)}
            {r.analysis.flags.map((f) => <span key={f} className="tag2 flag">⚠ {FLAG[f] || f}</span>)}
          </div>
        </article>))}
      {data && data.total > limit && <button className="btn" disabled={loading} onClick={() => setLimit((n) => n + 6)}>Show more ({data.total - limit} left)</button>}
    </section>
  )
}

/** The "review analysis" block of a product page. */
export function ReviewInsights({ p }) {
  const { data: d, err, loading } = useFetch(`/products/${p.id}/insights`, [p.id])
  const [aspect, setAspect] = useState('')
  useEffect(() => { setAspect('') }, [p.id])
  if (loading && !d) return <p className="muted">Analysing reviews…</p>
  if (err) return <p className="err">Review analysis unavailable: {err}</p>
  const s = d.sentiment
  return (
    <section className="ri">
      <h2 className="h2">🧠 Review analysis <span className="muted small">NLP model reads {d.n} customer reviews</span></h2>
      <div className="stats">
        <div><small>Verdict</small><b>{d.verdict}</b></div><div><small>Smart score</small><b>{d.smart}/100</b></div>
        <div><small>Stars shown → from text</small><b>{d.starAvg}★ → {d.textRating}★</b></div><div><small>Adjusted rating</small><b>{d.adjRating}★</b></div>
        <div><small>Review trust</small><b className={d.trust >= 0.9 ? 'green' : d.trust >= 0.8 ? 'amber' : 'red'}>{Math.round(d.trust * 100)}%</b></div>
      </div>
      <div className="panel wide">
        <div className="row spread"><b>What reviewers feel</b><span className="muted small">{s.positivePct}% positive · {s.mixedPct}% mixed · {s.negativePct}% negative</span></div>
        <SplitBar pos={s.positivePct} mixed={s.mixedPct} neg={s.negativePct} h={14} />
        {(d.pros.length > 0 || d.cons.length > 0) && <div className="proscons">
          <div><b className="green">👍 Praised</b>{d.pros.length ? d.pros.map((a) => <div key={a.key}>{a.label} <span className="muted small">{a.positivePct}% positive</span></div>) : <div className="muted small">Nothing stands out</div>}</div>
          <div><b className="red">👎 Complaints</b>{d.cons.length ? d.cons.map((a) => <div key={a.key}>{a.label} <span className="muted small">{a.negativePct}% negative</span></div>) : <div className="muted small">No repeated complaints</div>}</div>
        </div>}
        <ul className="why">{d.reasons.map((t, i) => <li key={'r' + i}>{t}</li>)}{d.cautions.map((t, i) => <li key={'c' + i} className="amber">⚠ {t}</li>)}</ul>
      </div>
      <h3 className="h3">By topic <span className="muted small">click a row to read those reviews</span></h3>
      <div className="aspects">
        {d.aspects.map((a) => (
          <button key={a.key} className={'asp' + (aspect === a.key ? ' on' : '')} onClick={() => setAspect(aspect === a.key ? '' : a.key)}>
            <span className="an">{a.label}</span><SplitBar pos={a.positivePct} mixed={100 - a.positivePct - a.negativePct} neg={a.negativePct} h={8} /><span className="muted small">{a.mentions} mentions</span>
          </button>))}
      </div>
      <h3 className="h3">Reviews</h3>
      <ReviewList id={p.id} aspect={aspect} setAspect={setAspect} />
      <p className="note">Reviews are generated demo text (a real store feed would plug into <code>server/reviews.js</code>). The sentiment model is real: logistic regression trained on human-labelled review sentences, see the <a href="#/review-ai">Review AI page</a>.</p>
    </section>
  )
}

/** Review AI page: type any review and watch the trained model read it, plus the model card. */
export function ReviewAI() {
  const [text, setText] = useState('The camera is stunning but the battery drains very fast. Delivery was late and the packaging was torn.')
  const [stars, setStars] = useState(0), [res, setRes] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const model = useFetch('/model', []).data
  const run = async (e) => {
    e?.preventDefault(); setBusy(true); setErr('')
    try { setRes(await api('POST', '/analyze', { text, ...(stars && { stars }) })) } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  useEffect(() => { run() }, [])
  const m = model?.metrics
  return (
    <main className="wrap">
      <h2 className="h2">🧠 Review AI</h2>
      <p className="muted">Paste or write a customer review. The model splits it into sentences, scores each one, finds the product topics (battery, delivery, fit…) and rates the opinion on every topic. It also warns when the stars and the words disagree.</p>
      <form className="panel wide" onSubmit={run}>
        <textarea className="ta" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} aria-label="Review text" />
        <div className="row spread">
          <label className="muted small">Stars given (optional) <select value={stars} onChange={(e) => setStars(Number(e.target.value))}><option value="0">–</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★</option>)}</select></label>
          <button className="btn solid" disabled={busy || !text.trim()}>{busy ? 'Analysing…' : 'Analyse review'}</button>
        </div>
        <div className="chips">{['Not good at all, I wouldn\'t buy it again.', 'Fits perfectly and the fabric is soft, but delivery took two weeks.', 'No lag, no heating, battery easily lasts two days. Paisa vasool!', 'Stopped working after a week. Seller refused the refund.'].map((x) => <button type="button" key={x} className="chip" onClick={() => setText(x)}>{x}</button>)}</div>
        {err && <p className="err">{err}</p>}
        {res && <Analysis a={res} />}
      </form>
      {model && <div className="panel wide">
        <h3>About the model</h3>
        <p className="muted small">{model.kind === 'lr+lex+vader' ? 'TF-IDF word + bigram features with negation tagging, the Hu & Liu opinion lexicon and the VADER valence lexicon, fed into logistic regression' : model.kind}. {fmt(model.features)} features, trained on {fmt(model.trainedOn.hu_liu)} product-review sentences (Hu &amp; Liu), {fmt(model.trainedOn.tackstrom)} (Täckström &amp; McDonald) and {fmt(model.trainedOn.seed)} hand-written shopping sentences. A short rule layer handles phrases like “no lag”, “no results” and swapped-letter typos.</p>
        {m && <div className="stats">
          <div><small>Cross-validated accuracy</small><b>{(m.cv5.acc * 100).toFixed(1)}%</b></div>
          <div><small>Train on one dataset, test on another</small><b>{(m.hl_to_tk_electronics.acc * 100).toFixed(0)}–{(m.tk_to_hl.acc * 100).toFixed(0)}%</b></div>
          <div><small>Chance level</small><b>50%</b></div>
        </div>}
        <p className="note">Accuracy was measured on sentences the model never saw, from datasets with human labels. It is binary (positive / negative); scores between {model.thresholds.neg} and {model.thresholds.pos} are shown as “mixed”. Weaker on sarcasm, Hinglish and non-English text.</p>
      </div>}
    </main>
  )
}

/** Floating shopping-assistant chat. */
export function Assistant({ S }) {
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState([]), [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const ctx = useRef({}), end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy, open])
  const send = async (m) => {
    m = (m ?? text).trim(); if (!m || busy) return
    setText(''); setMsgs((x) => [...x, { me: true, text: m }]); setBusy(true)
    try {
      const r = await api('POST', '/assistant', { message: m, ctx: ctx.current })
      ctx.current = r.parsed || {}
      setMsgs((x) => [...x, { text: r.reply, products: r.products, table: r.table, suggestions: r.suggestions }])
    } catch (e) { setMsgs((x) => [...x, { text: e.message, err: true }]) } finally { setBusy(false) }
  }
  useEffect(() => { if (open && !msgs.length) send('hi') }, [open])
  if (!open) return <button className="fab" onClick={() => setOpen(true)} aria-label="Open the shopping assistant">🤖 Ask CartWise</button>
  const last = msgs[msgs.length - 1]
  return (
    <aside className="chat" role="dialog" aria-label="CartWise assistant">
      <div className="chead"><b>🤖 CartWise assistant</b><button className="ico" onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
      <div className="cmsgs">
        {msgs.map((m, i) => (
          <div key={i} className={'msg ' + (m.me ? 'me' : 'bot') + (m.err ? ' bad' : '')}>
            <p>{m.text}</p>
            {m.table && <div className="tablewrap"><table className="cmp"><thead><tr><th></th>{m.table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{m.table.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.a}</td><td>{r.b}</td></tr>)}</tbody></table></div>}
            {m.products?.map((p) => (
              <div className="mini" key={p.id}>
                <a href={'#/product/' + p.id} onClick={() => setOpen(false)}><b>{p.name}</b></a>
                <div className="small">₹{fmt(p.price)} on {p.market} · ★{p.rating.toFixed(1)} shown, {p.textRating}★ from text · {p.positive}% positive · {p.verdict}</div>
                {p.aspects.map((a) => <span key={a.key} className={'tag2 ' + (a.pct >= 60 ? 'positive' : a.neg >= 40 ? 'negative' : 'mixed')}>{a.label} {a.pct}%</span>)}
                <div><button className="btn small" onClick={() => S.addCart(p.id)}>🛒 Add</button></div>
              </div>))}
          </div>))}
        {busy && <div className="msg bot"><p className="muted">Thinking…</p></div>}
        <div ref={end} />
      </div>
      {last?.suggestions?.length > 0 && !busy && <div className="chips cs">{last.suggestions.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>}
      <form className="cform" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="e.g. best phone under 30000 with great battery" aria-label="Message" />
        <button className="btn solid" disabled={busy || !text.trim()}>Send</button>
      </form>
    </aside>
  )
}
