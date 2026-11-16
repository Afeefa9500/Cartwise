// CartWise shopping assistant. No external LLM: a small rule-based language-understanding layer (budget, preferences,
// comparisons, follow-ups) feeding a ranker that uses the review-sentiment results. Everything it says is computed
// from catalogue + review analysis, so every claim in a reply can be traced to numbers on the product page.
import { PRODUCTS, BY_ID, fmt } from '../src/data.js'
import { search, searchScored } from '../src/search.js'
import { ASPECTS, ALL_ASPECTS, aspectLabel, aspectsFor } from './nlp/aspects.js'
import { productInsights } from './insights.js'

const MAX_RESULTS = 5
const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|thousand|lakhs?|lacs?)?'
const CUR = '(?:rs\\.?|inr|₹)?\\s*'
const unit = (u) => (!u ? 1 : /^(k|thou)/.test(u) ? 1e3 : 1e5)
const toN = (n, u) => Math.round(Number(String(n).replace(/,/g, '')) * unit(u))
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

const FILLER = new Set(('i me my we you your please pls want wants need needs looking look for a an the some any one ones something anything show find get give recommend recommendation recommendations ' +
  'suggest suggestions which what whats is are was can could would should will do does me best good great nice better top cheap cheapest new latest buy purchase with that has have having ' +
  'and or to of in on at it this these those there their than then also too very really just only like love prefer preferably want tell about who whom whose why how when where me us them under below ' +
  'above over between from around approx approximately near within upto less more most least max maximum min minimum than budget affordable best-rated top-rated rated highly high low long lasting ' +
  'options option product products item items model models deal deals worth no not without dont doesnt isnt cant wont').split(/\s+/))
// words that are both an aspect cue and a real product noun must stay in the product query
const PRODUCT_NOUNS = new Set(PRODUCTS.flatMap((p) => (p.sub + ' ' + p.category).toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean).concat(['phone', 'phones', 'laptop', 'laptops', 'shoes', 'headphones', 'earphones', 'tv']))

const ORD = [[/\b(first|1st|top|number one|#1)\b/, 0], [/\b(second|2nd|#2)\b/, 1], [/\b(third|3rd|#3)\b/, 2], [/\b(fourth|4th|#4)\b/, 3], [/\b(fifth|5th|#5)\b/, 4]]

export function parseBudget(q) {
  q = q.toLowerCase()
  let m
  if ((m = q.match(new RegExp(`(?:between|from)\\s*${CUR}${NUM}\\s*(?:and|to|-)\\s*${CUR}${NUM}`)))) {
    const hi = toN(m[3], m[4]); let lo = toN(m[1], m[2] || (Number(m[1]) < 1000 ? m[4] : undefined))
    return { min: Math.min(lo, hi), max: Math.max(lo, hi), span: m[0] }
  }
  if ((m = q.match(new RegExp(`${CUR}${NUM}\\s*(?:-|to)\\s*${CUR}${NUM}\\s*(?:rs|rupees|inr)?`))) && (m[2] || m[4] || Number(m[1].replace(/,/g, '')) >= 500)) {
    const hi = toN(m[3], m[4]), lo = toN(m[1], m[2] || (Number(m[1]) < 1000 ? m[4] : undefined))
    if (hi > lo && hi >= 500) return { min: lo, max: hi, span: m[0] }
  }
  if ((m = q.match(new RegExp(`(?:under|below|less than|within|upto|up to|max(?:imum)?|not more than|budget(?: of| is)?|cheaper than)\\s*${CUR}${NUM}`)))) return { min: 0, max: toN(m[1], m[2]), span: m[0] }
  if ((m = q.match(new RegExp(`(?:around|about|approx(?:imately)?|near|roughly)\\s*${CUR}${NUM}`)))) { const v = toN(m[1], m[2]); return { min: Math.round(v * 0.8), max: Math.round(v * 1.2), span: m[0] } }
  if ((m = q.match(new RegExp(`(?:above|over|more than|at least|minimum|min)\\s*${CUR}${NUM}`)))) return { min: toN(m[1], m[2]), max: Infinity, span: m[0] }
  if ((m = q.match(new RegExp(`(?:₹|rs\\.?\\s*)\\s*${NUM}|${NUM}\\s*(?:rs\\b|rupees|inr)|\\b(\\d+(?:\\.\\d+)?)\\s*(k|lakhs?|lacs?)\\b`)))) {
    const v = m[1] ? toN(m[1], m[2]) : m[3] ? toN(m[3], m[4]) : toN(m[5], m[6])
    return { min: 0, max: v, span: m[0] }
  }
  return null
}

function wantedAspects(q) {
  const hits = []
  for (const k of ALL_ASPECTS) if (['delivery', 'packaging', 'service'].includes(k) ? ASPECTS[k].re.test(q) : ASPECTS[k].re.test(q)) hits.push(k)
  return hits.filter((k) => !(k === 'value' && !/\b(value|worth|affordable)\b/.test(q))) // "budget"/"price" are handled as budget, not as an aspect
}

/** Words that belong to the product description, with budget phrases, preference cues and filler removed. */
function productQuery(q, budget) {
  if (budget) q = q.replace(budget.span, ' ')
  const cues = new Set()
  for (const k of ALL_ASPECTS) for (const w of q.match(new RegExp(ASPECTS[k].re.source, 'gi')) || []) for (const t of w.toLowerCase().split(/[^a-z0-9]+/)) if (!PRODUCT_NOUNS.has(t)) cues.add(t)
  const words = q.toLowerCase().split(/[^a-z0-9'+-]+/).filter((w) => w && !FILLER.has(w) && !cues.has(w))
  let keep = [...words]
  if (keep.length > 1) keep = keep.filter((w) => w !== 'gaming') // use-case, handled as a performance preference below
  if (/\b(premium|flagship|luxury|high[- ]end)\b/.test(q)) keep.push('premium')
  return keep.join(' ')
}

/** All query words must match; if nothing does, drop the least useful word until something does. */
function relaxedSearch(query) {
  const words = query.split(/\s+/).filter(Boolean)
  const strong = (hits) => { const top = hits[0]?.rel || 0; return hits.filter((h) => h.rel >= 0.7 * top).map((h) => h.p) } // drop weak category-only matches
  let hits = searchScored(words.join(' '))
  if (hits.length || words.length < 2) return { list: strong(hits), used: words.join(' ') }
  for (let i = words.length - 1; i >= 0; i--) {
    const alt = words.filter((_, j) => j !== i)
    const h = searchScored(alt.join(' '))
    if (h.length) return { list: strong(h), used: alt.join(' '), dropped: words[i] }
  }
  return { list: [], used: query }
}

const nameTokens = (p) => p.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
/** A specific product named in free text ("iphone 16", "galaxy a55"); null when the text is generic or ambiguous. */
export function findProduct(text) {
  const q = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w) && !['phone', 'laptop', 'reviews', 'review', 'reviewers', 'reviewer', 'say', 'says', 'people', 'customers', 'users', 'think', 'thinks', 'feedback', 'compare', 'vs', 'versus', 'difference', 'between', 'worth', 'verdict', 'complain', 'complaints', 'pros', 'cons'].includes(w))
  if (!q.length) return null
  const hits = PRODUCTS.map((p) => ({ p, t: nameTokens(p) })).filter(({ t }) => q.every((w) => t.includes(w) || t.some((x) => x.startsWith(w) && w.length >= 4)))
  if (!hits.length) return null
  hits.sort((a, b) => a.t.length - b.t.length || b.p.aiScore - a.p.aiScore)
  const best = hits[0]
  if (q.length === 1 && hits.length > 1 && hits[1].t.length === best.t.length) return null
  if (q.length === 1 && hits.length > 3) return null
  return best.p
}

function offerWithin(p, b) {
  if (!b) return p.best
  const ok = p.offers.filter((o) => o.stock !== 'Out of stock' && o.price >= b.min && o.price <= b.max)
  return ok.sort((x, y) => y.score - x.score)[0] || null
}
const aspectScore = (ins, key) => {
  const a = ins.aspects.find((x) => x.key === key)
  return a ? (100 * (a.positive + 0.5 * a.mixed + 1)) / (a.mentions + 2) : 45
}

function card(p, offer, wanted, ins) {
  const lines = (wanted.length ? wanted.filter((k) => aspectsFor(p).includes(k)) : ins.pros.map((x) => x.key)).slice(0, 3)
    .map((k) => { const a = ins.aspects.find((x) => x.key === k); return a ? { key: k, label: a.label, pct: a.positivePct, neg: a.negativePct, n: a.mentions } : null }).filter(Boolean)
  return { id: p.id, name: p.name, brand: p.brand, sub: p.sub, price: offer.price, market: offer.market, rating: p.rating, textRating: ins.textRating,
    positive: ins.sentiment.positivePct, smart: ins.smart, verdict: ins.verdict, aspects: lines, caution: ins.cautions[0] || null }
}

function rank(cands, wanted, budget, mode) {
  const scored = []
  const prices = cands.map((p) => p.minPrice), lo = Math.min(...prices), hi = Math.max(...prices)
  for (const p of cands) {
    const offer = offerWithin(p, budget)
    if (!offer) continue
    const ins = productInsights(p.id)
    const use = wanted.filter((k) => aspectsFor(p).includes(k))
    const fit = use.length ? use.reduce((s, k) => s + aspectScore(ins, k), 0) / use.length : null
    const cheap = hi > lo ? 100 * (1 - (offer.price - lo) / (hi - lo)) : 50
    let score = fit === null ? ins.smart : 0.5 * fit + 0.5 * ins.smart
    if (mode === 'cheapest') score = 0.75 * cheap + 0.25 * ins.smart
    else if (mode === 'budget') score = 0.5 * cheap + 0.5 * score
    else if (budget && Number.isFinite(budget.max) && offer.price < budget.max * 0.5) score -= 4 // best "under X" usually means near X
    if (ins.trust < 0.85) score -= 3
    scored.push({ p, offer, ins, score, fit })
  }
  return scored.sort((a, b) => b.score - a.score)
}

const money = (n) => '₹' + fmt(n)
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1])
const budgetText = (b) => (!b ? '' : b.min && Number.isFinite(b.max) ? ` between ${money(b.min)} and ${money(b.max)}` : Number.isFinite(b.max) ? ` under ${money(b.max)}` : ` above ${money(b.min)}`)

function compareReply(a, b) {
  const A = productInsights(a.id), B = productInsights(b.id)
  const shared = A.aspects.filter((x) => B.aspects.some((y) => y.key === x.key) && x.mentions >= 3).slice(0, 4)
  const rows = [
    { label: 'Best price', a: money(a.best.price) + ' on ' + a.best.market, b: money(b.best.price) + ' on ' + b.best.market },
    { label: 'Rating shown', a: a.rating.toFixed(1) + '★', b: b.rating.toFixed(1) + '★' },
    { label: 'Rating from review text', a: A.textRating + '★', b: B.textRating + '★' },
    { label: 'Positive reviews', a: A.sentiment.positivePct + '%', b: B.sentiment.positivePct + '%' },
    ...shared.map((x) => { const y = B.aspects.find((z) => z.key === x.key); return { label: x.label, a: x.positivePct + '% positive', b: y.positivePct + '% positive' } }),
    { label: 'CartWise smart score', a: A.smart + '/100', b: B.smart + '/100' },
  ]
  const wins = { a: [], b: [] }
  if (Math.abs(a.best.price - b.best.price) / Math.max(a.best.price, b.best.price) > 0.05) (a.best.price < b.best.price ? wins.a : wins.b).push('price')
  for (const x of shared) { const y = B.aspects.find((z) => z.key === x.key); if (Math.abs(x.positivePct - y.positivePct) >= 15) (x.positivePct > y.positivePct ? wins.a : wins.b).push(x.label.toLowerCase()) }
  const lead = A.smart === B.smart ? null : A.smart > B.smart ? [a, A, b, B, wins.a, wins.b] : [b, B, a, A, wins.b, wins.a]
  let text
  if (!lead) text = `${a.name} and ${b.name} are level on our smart score (${A.smart}/100). Choose on price and the aspects you care about.`
  else {
    const [w, wi, l, li, ww, lw] = lead
    text = `${w.name} comes out ahead: smart score ${wi.smart} vs ${li.smart}.`
    if (ww.length) text += ` It is stronger on ${list(ww)}.`
    if (lw.length) text += ` ${l.name} is better on ${list(lw)}, so pick it if that matters most to you.`
  }
  return { text, table: { columns: [a.name, b.name], rows }, ids: [a.id, b.id] }
}

function verdictReply(p) {
  const i = productInsights(p.id)
  const parts = [`${p.name}: ${i.verdict} (smart score ${i.smart}/100).`, ...i.reasons]
  if (i.cautions.length) parts.push('Watch out: ' + i.cautions.join(' '))
  return parts.join(' ')
}

function reviewsReply(p) {
  const i = productInsights(p.id)
  const bits = [`${i.sentiment.positivePct}% of ${i.n} reviews I analysed for ${p.name} are positive, ${i.sentiment.negativePct}% negative.`]
  if (i.pros.length) bits.push('Reviewers like: ' + list(i.pros.map((a) => `${a.label.toLowerCase()} (${a.positivePct}%)`)) + '.')
  if (i.cons.length) bits.push('Common complaints: ' + list(i.cons.map((a) => `${a.label.toLowerCase()} (${a.negativePct}% negative)`)) + '.')
  const q = (i.pros[0] || i.aspects[0])?.quote
  if (q) bits.push(`One review says: “${q.text}”`)
  return bits.join(' ')
}

const SUGGEST = ['Best phone under 30000', 'Headphones with good battery and sound', 'Compare iPhone 16 vs Samsung Galaxy S25', 'Is Sony WH-1000XM5 worth it?', 'Quiet air cooler under 10000']
const GREETING = 'Hi! I am the CartWise assistant. Tell me what you are looking for, your budget and what matters to you (for example “a phone under 30000 with great battery”), and I will rank products using prices and what customers actually write in reviews. I can also compare two products or tell you whether one is worth buying.'

/**
 * @param message user text
 * @param ctx     what the previous reply parsed: { query, budget, wanted, mode, ids }
 */
export function reply(message, ctx = {}) {
  const raw = String(message || '').trim().slice(0, 300)
  const q = raw.toLowerCase()
  const prev = { query: typeof ctx.query === 'string' ? ctx.query.slice(0, 120) : '', budget: ctx.budget || null, wanted: Array.isArray(ctx.wanted) ? ctx.wanted.filter((k) => ALL_ASPECTS.includes(k)) : [], mode: ctx.mode || '', ids: Array.isArray(ctx.ids) ? ctx.ids.filter((id) => BY_ID[id]).slice(0, 10) : [] }
  const out = (o) => ({ products: [], suggestions: [], ...o })
  if (!q) return out({ reply: GREETING, suggestions: SUGGEST, parsed: prev })
  if (/^(hi|hello|hey|namaste|help|what can you do|who are you)\b/.test(q) && q.split(/\s+/).length <= 5) return out({ reply: GREETING, suggestions: SUGGEST, parsed: prev })

  // ---- references to earlier results ("the second one", "top 2")
  const ordinal = ORD.find(([re]) => re.test(q))
  const refd = ordinal && prev.ids[ordinal[1]] ? BY_ID[prev.ids[ordinal[1]]] : null

  // ---- comparison
  let cm = q.match(/(?:compare|difference between)\s+(.+?)\s+(?:and|with|to|vs\.?|versus|&)\s+(.+)/) || q.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/) || q.match(/^(.+?)\s+or\s+(.+?)\??$/)
  if (/\b(compare|comparison)\b/.test(q) && /\b(top|first|these|them|both)\b/.test(q) && prev.ids.length >= 2) cm = [null, prev.ids[0], prev.ids[1]]
  if (cm) {
    const a = cm[1] && BY_ID[cm[1].toUpperCase()] ? BY_ID[cm[1].toUpperCase()] : findProduct(cm[1] || ''), b = cm[2] && BY_ID[cm[2].toUpperCase()] ? BY_ID[cm[2].toUpperCase()] : findProduct(cm[2] || '')
    if (a && b && a.id !== b.id) {
      const c = compareReply(a, b)
      return out({ reply: c.text, table: c.table, products: [a, b].map((p) => card(p, p.best, [], productInsights(p.id))), parsed: { query: a.sub.toLowerCase(), budget: null, wanted: [], mode: '', ids: c.ids }, suggestions: [`What do reviewers say about ${a.name}?`, `What do reviewers say about ${b.name}?`] })
    }
    if (/\b(compare|vs|versus|difference)\b/.test(q)) return out({ reply: 'Tell me the two products to compare by name, for example “compare iPhone 16 and Samsung Galaxy S25”.', parsed: prev, suggestions: ['Compare iPhone 16 vs Samsung Galaxy S25', 'Compare Sony WH-1000XM5 and Bose QuietComfort Headphones'] })
  }

  // ---- reviews / verdict about one product
  const asksReviews = /\b(reviews?|what (?:do|are) (?:people|customers|users|reviewers) say|feedback|complain\w*|pros and cons)\b/.test(q)
  const asksVerdict = /\b(worth|should i (?:buy|get)|good (?:buy|choice|phone|laptop)|is it good|is the .* good|recommend(?:ed)?\?|verdict|reliable|safe to buy)\b/.test(q) || /^is .+ (?:good|worth it)/.test(q)
  if (asksReviews || asksVerdict) {
    const named = refd || findProduct(q.replace(/\b(reviews?|worth it|worth|should i buy|should i get|is|the|what do people say about|about|for|of|good|buy)\b/g, ' ')) || (/\b(it|this|that|one)\b/.test(q) && prev.ids[0] ? BY_ID[prev.ids[0]] : null)
    if (named) {
      const ins = productInsights(named.id)
      return out({ reply: asksReviews ? reviewsReply(named) + ' ' + (asksVerdict ? verdictReply(named) : '') : verdictReply(named), products: [card(named, named.best, [], ins)], parsed: { query: named.sub.toLowerCase(), budget: null, wanted: [], mode: '', ids: [named.id] }, suggestions: ['Show cheaper options', `Show similar ${named.sub.toLowerCase()} products`] })
    }
  }

  // ---- recommendation / search
  let budget = parseBudget(q)
  const wanted = wantedAspects(q)
  let mode = /\b(cheapest|lowest price|least expensive|most affordable)\b/.test(q) ? 'cheapest' : /\b(budget|cheap|affordable|low[- ]cost)\b/.test(q) ? 'budget' : ''
  let query = productQuery(q, budget)
  const followUp = !query && (budget || wanted.length || /\b(cheaper|more|else|other|another|different|premium|better)\b/.test(q) || mode)
  if (followUp && prev.query) {
    query = prev.query
    if (!budget && /\bcheaper|lower|less expensive\b/.test(q) && prev.ids.length) {
      const ps = prev.ids.map((id) => BY_ID[id].best.price).sort((a, b) => a - b)
      budget = { min: 0, max: Math.floor(ps[Math.floor(ps.length / 2)] * 0.85), span: '' }
    } else if (!budget && prev.budget) budget = { min: prev.budget.min || 0, max: prev.budget.max ?? Infinity, span: '' }
  }
  if (/\b(cheaper|lower|less expensive)\b/.test(q) && !mode) mode = 'budget'
  if (/\bgaming\b/.test(q) && !wanted.includes('performance')) wanted.push('performance')
  const wantedAll = [...new Set([...(followUp && prev.wanted.length ? prev.wanted : []), ...wanted])]
  if (budget && budget.max === null) budget.max = Infinity
  if (!query) {
    return out({ reply: wantedAll.length || budget ? `Happy to help${budget ? ` with a${budgetText(budget)} budget` : ''}. What kind of product are you after (phone, laptop, headphones, shoes, sunscreen...)?` : 'I did not catch a product there. Try something like “best headphones under 5000” or “compare iPhone 16 and Galaxy S25”.', parsed: { ...prev, budget, wanted: wantedAll, mode }, suggestions: SUGGEST })
  }

  const found = relaxedSearch(query)
  let cands = found.list
  if (!cands.length) return out({ reply: `I could not find anything matching “${query}”. Try a broader word such as phone, laptop, headphones, shoes, sunscreen or air fryer.`, parsed: { ...prev, query: '', budget, wanted: wantedAll, mode }, suggestions: SUGGEST })
  const ranked = rank(cands, wantedAll, budget, mode)
  if (!ranked.length) {
    const cheapest = [...cands].sort((a, b) => a.minPrice - b.minPrice)[0]
    return out({ reply: `Nothing matches “${found.used}”${budgetText(budget)}. The cheapest is ${cheapest.name} at ${money(cheapest.minPrice)}, so you may need to raise the budget a little.`, products: [card(cheapest, cheapest.best, [], productInsights(cheapest.id))], parsed: { query: found.used, budget, wanted: wantedAll, mode, ids: [cheapest.id] }, suggestions: [`Show ${found.used} under ${Math.ceil(cheapest.minPrice / 1000) * 1000 + 2000}`] })
  }
  const top = ranked.slice(0, MAX_RESULTS)
  const cards = top.map((r) => card(r.p, r.offer, wantedAll, r.ins))
  const usable = wantedAll.filter((k) => aspectsFor(top[0].p).includes(k))
  const how = usable.length ? ` ranked for ${list(usable.map((k) => aspectLabel(k).toLowerCase()))}` : ''
  let text = `Here ${top.length === 1 ? 'is the best match' : `are the top ${top.length} matches`} for “${found.used}”${budgetText(budget)}${how}, using price plus what reviewers write.`
  if (found.dropped) text += ` (I ignored “${found.dropped}” because nothing matched it.)`
  const t = top[0]
  text += ` My pick: ${t.p.name} at ${money(t.offer.price)} on ${t.offer.market}. ${t.ins.sentiment.positivePct}% of its reviews are positive`
  const strong = usable.length ? t.ins.aspects.filter((a) => usable.includes(a.key)).sort((a, b) => b.positivePct - a.positivePct)[0] : t.ins.pros[0]
  text += strong ? `, and ${strong.label.toLowerCase()} is rated well (${strong.positivePct}% positive).` : '.'
  if (t.ins.cautions[0] && !/^Even the top/.test(t.ins.cautions[0])) text += ' Note: ' + t.ins.cautions[0]
  return out({ reply: text, products: cards, parsed: { query: found.used, budget, wanted: wantedAll, mode, ids: top.map((r) => r.p.id) },
    suggestions: [top.length > 1 ? 'Compare the top 2' : null, 'Show cheaper options', `What do reviewers say about ${t.p.name}?`].filter(Boolean) })
}
