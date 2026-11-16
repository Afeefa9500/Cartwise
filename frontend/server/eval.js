// Measures the review-analysis pipeline against the opinions the demo-review generator actually wrote
// (reviews.js keeps them in `_truth`/`_seeded`). Run: node server/eval.js   (add --json to print machine-readable output)
import { PRODUCTS } from '../src/data.js'
import { productInsights } from './insights.js'

const rows = []
for (const p of PRODUCTS) for (const r of productInsights(p.id).rows) rows.push({ ...r, pid: p.id })

// 1) overall review sentiment vs the star rating the reviewer gave (ignoring reviews the generator made contradictory)
const clean = rows.filter((r) => !r._seeded.length)
const target = (s) => (s >= 4 ? 'positive' : s <= 2 ? 'negative' : 'mixed')
const decided = clean.filter((r) => r.stars !== 3)
const overallAcc = decided.filter((r) => (r.analysis.label === 'mixed' ? false : r.analysis.label === target(r.stars))).length / decided.length
const hardWrong = decided.filter((r) => r.analysis.label !== 'mixed' && r.analysis.label !== target(r.stars)).length / decided.length

// 2) aspect extraction + polarity vs the generator's truth
let tp = 0, fp = 0, fn = 0, polOk = 0, polN = 0, polMixed = 0
for (const r of clean) {
  const truth = new Map(r._truth.map((t) => [t.aspect, t.positive]))
  const got = new Map(r.analysis.aspects.map((a) => [a.key, a.sentiment]))
  for (const [k, pos] of truth) {
    if (got.has(k)) { tp++; polN++; const s = got.get(k); if (s === 'mixed') polMixed++; else if ((s === 'positive') === pos) polOk++ } else fn++
  }
  for (const k of got.keys()) if (!truth.has(k)) fp++
}
const prec = tp / (tp + fp), rec = tp / (tp + fn), f1 = (2 * prec * rec) / (prec + rec)

// 3) quality flags
const flagStats = {}
for (const kind of ['mismatch', 'low-effort']) {
  const seeded = rows.filter((r) => r._seeded.includes(kind))
  const hit = seeded.filter((r) => r.analysis.flags.some((f) => (kind === 'mismatch' ? f.startsWith('rating-') : f === 'low-effort'))).length
  const flagged = rows.filter((r) => r.analysis.flags.some((f) => (kind === 'mismatch' ? f.startsWith('rating-') : f === 'low-effort')))
  const correct = flagged.filter((r) => r._seeded.includes(kind)).length
  flagStats[kind] = { seeded: seeded.length, recall: +(hit / (seeded.length || 1)).toFixed(3), precision: +(correct / (flagged.length || 1)).toFixed(3) }
}

// 4) product level: does the aspect % positive track the hidden per-product aspect quality?
const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2 } return c / Math.sqrt(va * vb) }
const xs = [], ys = []
for (const p of PRODUCTS) { const i = productInsights(p.id); for (const a of i.aspects) if (a.mentions >= 3 && i.truth[a.key] !== undefined) { xs.push(a.positivePct / 100); ys.push(i.truth[a.key]) } }

const out = {
  reviews: rows.length, cleanReviews: clean.length,
  overallSentiment: { agreementWithStars: +overallAcc.toFixed(3), confidentlyWrong: +hardWrong.toFixed(3) },
  aspectExtraction: { precision: +prec.toFixed(3), recall: +rec.toFixed(3), f1: +f1.toFixed(3) },
  aspectPolarity: { accuracy: +(polOk / polN).toFixed(3), labelledMixed: +(polMixed / polN).toFixed(3), n: polN },
  flags: flagStats,
  productAspectCorrelation: { pearson: +corr(xs, ys).toFixed(3), n: xs.length },
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out))
else console.log(JSON.stringify(out, null, 2))
export default out
