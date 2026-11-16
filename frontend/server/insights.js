// Product-level review intelligence: runs the NLP pipeline over a product's reviews and explains what it found.
import { PRODUCTS, BY_ID, fmt } from '../src/data.js'
import { analyzeText } from './nlp/analyze.js'
import { aspectsFor, aspectLabel } from './nlp/aspects.js'
import { reviewsFor } from './reviews.js'

const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)
const PRIOR = 3.9, PRIOR_WEIGHT = 4
const UNRELIABLE = new Set(['rating-higher-than-text', 'rating-lower-than-text', 'low-effort', 'all-caps', 'exaggerated'])

const cache = new Map()
/** Analysed reviews + aggregated insights for one product (cached; the data is deterministic). */
export function productInsights(id) {
  if (cache.has(id)) return cache.get(id)
  const p = BY_ID[id]
  if (!p) return null
  const { reviews, truth } = reviewsFor(p)
  const allowed = aspectsFor(p)
  const rows = reviews.map((rv) => ({ ...rv, analysis: analyzeText(rv.text, { stars: rv.stars, aspects: allowed }) }))
  const n = rows.length

  const sent = { positive: 0, mixed: 0, negative: 0 }
  let psum = 0, starSum = 0, unreliable = 0
  for (const r of rows) {
    sent[r.analysis.label]++; psum += r.analysis.p; starSum += r.stars
    if (r.analysis.flags.some((f) => UNRELIABLE.has(f))) unreliable++
  }
  const meanP = psum / n, textRating = 1 + 4 * meanP, starAvg = starSum / n
  const trust = 1 - unreliable / n
  // Rating you can lean on: average of what reviewers clicked and what they wrote, shrunk toward a prior when evidence is thin.
  const blended = 0.5 * starAvg + 0.5 * textRating
  const adjRating = (blended * n + PRIOR * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT)

  // Aspect table (aspect-based sentiment)
  const table = new Map()
  for (const r of rows) for (const a of r.analysis.aspects) {
    const t = table.get(a.key) || { key: a.key, label: a.label, mentions: 0, positive: 0, mixed: 0, negative: 0, best: null, worst: null }
    t.mentions++; t[a.sentiment]++
    if (a.sentiment === 'positive' && (!t.best || a.p > t.best.p)) t.best = { text: a.quote, p: a.p, author: r.author, stars: r.stars }
    if (a.sentiment === 'negative' && (!t.worst || a.p < t.worst.p)) t.worst = { text: a.quote, p: a.p, author: r.author, stars: r.stars }
    table.set(a.key, t)
  }
  const aspects = [...table.values()].filter((t) => t.mentions >= 2).map((t) => ({
    key: t.key, label: t.label, mentions: t.mentions, positive: t.positive, mixed: t.mixed, negative: t.negative,
    positivePct: pct(t.positive, t.mentions), negativePct: pct(t.negative, t.mentions),
    quote: t.positive >= t.negative ? t.best : t.worst,
  })).sort((a, b) => b.mentions - a.mentions)
  const pros = aspects.filter((a) => a.mentions >= 3 && a.positivePct >= 70).sort((a, b) => b.positivePct - a.positivePct || b.mentions - a.mentions)
  const cons = aspects.filter((a) => a.mentions >= 3 && a.negativePct >= 40).sort((a, b) => b.negativePct - a.negativePct || b.mentions - a.mentions)

  // Smart score: price position + review quality + how trustworthy the reviews are.
  const below = (1 - p.best.price / p.avgPrice) * 100
  const priceScore = clamp(50 + 3 * below, 0, 100)
  const reviewScore = clamp(((adjRating - 2) / 3) * 100, 0, 100)
  const smart = Math.round(0.4 * priceScore + 0.45 * reviewScore + 0.15 * trust * 100)

  const reasons = [], cautions = []
  if (below >= 8) reasons.push(`The best offer (${p.best.market}, ₹${fmt(p.best.price)}) is ${Math.round(below)}% below the average listing price.`)
  else if (below <= -5) cautions.push(`Even the top-ranked offer is ${Math.round(-below)}% above the average listing price.`)
  reasons.push(`${pct(sent.positive, n)}% of ${n} analysed reviews are positive and ${pct(sent.negative, n)}% negative; the text suggests ${round(textRating)}★ against ${p.rating.toFixed(1)}★ shown.`)
  if (pros[0]) reasons.push(`${pros[0].label} is praised: ${pros[0].positivePct}% positive across ${pros[0].mentions} mentions.`)
  if (cons[0]) cautions.push(`${cons[0].label} is the main complaint: ${cons[0].negativePct}% negative across ${cons[0].mentions} mentions.`)
  if (unreliable >= Math.max(2, n * 0.08)) cautions.push(`${unreliable} of ${n} reviews look unreliable (rating contradicts the text, or one-word praise), so they count for less.`)
  if (textRating + 0.5 < p.rating) cautions.push(`Written reviews are less enthusiastic than the ${p.rating.toFixed(1)}★ average suggests.`)
  if (p.best.stock === 'Only few left') cautions.push('Only a few units are left at the top-ranked offer.')
  const verdict = smart >= 75 ? 'Strong buy' : smart >= 62 ? 'Good choice' : smart >= 48 ? 'Okay, compare first' : 'Think twice'

  const out = {
    id, n, sentiment: { ...sent, positivePct: pct(sent.positive, n), mixedPct: pct(sent.mixed, n), negativePct: pct(sent.negative, n) },
    textRating: round(textRating), starAvg: round(starAvg), adjRating: round(adjRating), trust: round(trust, 2), unreliable,
    aspects, pros: pros.slice(0, 4), cons: cons.slice(0, 4), priceScore: Math.round(priceScore), reviewScore: Math.round(reviewScore), smart, verdict, reasons, cautions,
    rows, truth,
  }
  cache.set(id, out)
  return out
}

/** What the browser receives for one product (no per-review rows, no hidden truth). */
export const publicInsights = ({ rows, truth, ...rest }) => rest

/** Compact map for product cards and sorting: id -> small summary. Built once. */
let summary = null
export function summaryMap() {
  if (summary) return summary
  summary = {}
  for (const p of PRODUCTS) {
    const i = productInsights(p.id)
    summary[p.id] = { n: i.n, pos: i.sentiment.positivePct, neg: i.sentiment.negativePct, rt: i.adjRating, ss: i.smart, v: i.verdict, tr: i.trust }
  }
  return summary
}

/** Reviews of one product with their analysis, filtered / sorted / paged. */
export function listReviews(id, { sentiment, aspect, sort = 'helpful', limit = 8, offset = 0 } = {}) {
  const ins = productInsights(id)
  if (!ins) return null
  let rows = ins.rows
  if (['positive', 'mixed', 'negative'].includes(sentiment)) rows = rows.filter((r) => r.analysis.label === sentiment)
  if (aspect) rows = rows.filter((r) => r.analysis.aspects.some((a) => a.key === aspect))
  const by = { helpful: (a, b) => b.helpful - a.helpful, recent: (a, b) => b.date.localeCompare(a.date), high: (a, b) => b.stars - a.stars, low: (a, b) => a.stars - b.stars }[sort] || ((a, b) => b.helpful - a.helpful)
  rows = [...rows].sort(by)
  const slice = rows.slice(offset, offset + limit).map(({ _seeded, _truth, ...r }) => r)
  return { total: rows.length, reviews: slice, aspects: ins.aspects.map((a) => ({ key: a.key, label: a.label, mentions: a.mentions })) }
}
export { aspectLabel }
