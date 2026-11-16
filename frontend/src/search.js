import { PRODUCTS } from './data.js'
const SYN = { headphone: ['headset', 'earphone'], earphone: ['buds', 'earbud', 'headphone'], earbud: ['buds'], shoe: ['sneaker', 'footwear', 'running', 'sandal'], sneaker: ['shoe'], phone: ['smartphone', 'mobile'], mobile: ['smartphone', 'phone'], smartphone: ['phone', 'mobile'], laptop: ['notebook', 'macbook'], tv: ['television'], sunscreen: ['spf'], moisturizer: ['moisturiser', 'lotion', 'cream'], fryer: ['air fryer'], fridge: ['refrigerator'], ac: ['air conditioner'], watch: ['smartwatch', 'band'], dress: ['kurta', 'saree'], bag: ['backpack', 'handbag'] }
const STOP = new Set(['best', 'top', 'cheap', 'budget', 'affordable', 'premium', 'good', 'for', 'the', 'a', 'in', 'and', 'online', 'buy', 'product', 'products', 'under', 'below', 'value', 'me', 'on', 'of'])
const wordRe = (x) => new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:e?s)?\\b')
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

/** Scored matches [{p, rel}], best first. `search` below returns just the products. */
export function searchScored(query) {
  let q = (query || '').toLowerCase()
  const m = q.match(/(?:under|below|less than|within|upto|up to)\s*₹?\s*(\d[\d,]*)\s*(k)?/)
  let cap = null
  if (m) { cap = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1); q = q.replace(m[0], ' ') }
  const flags = { cheap: /budget|cheap|affordable/.test(q), premium: /premium|flagship|luxury/.test(q) }
  const terms = q.split(/[^a-z0-9'+-]+/).filter(Boolean).filter((w) => !STOP.has(w)).map(stem)
  const out = []
  for (const p of PRODUCTS) {
    if (cap && p.minPrice > cap) continue
    if (flags.premium && p.minPrice < 15000) continue
    const f = { n: p.name.toLowerCase(), b: p.brand.toLowerCase(), s: p.sub.toLowerCase(), c: p.category.toLowerCase(), k: p.keywords }
    let rel = 0, ok = true
    for (const t of terms) {
      // whole-word match (plural allowed), so "phone" no longer matches "Headphones" and "ac" no longer matches "Acer"
      const sc = (x) => { const re = wordRe(x); return re.test(f.n) || re.test(f.b) ? 4 : re.test(f.s) ? 4 : re.test(f.k) ? 2 : re.test(f.c) ? 2 : 0 }
      let s = sc(t)
      if (!s) s = Math.max(0, ...(SYN[t] || []).map((x) => Math.max(0, sc(x) - 0.5)))
      if (!s) { ok = false; break }
      rel += s
    }
    if (ok) out.push({ p, rel })
  }
  out.sort((a, b) => b.rel * 10 + b.p.aiScore - (a.rel * 10 + a.p.aiScore))
  if (flags.cheap) out.sort((a, b) => b.p.aiScore - a.p.aiScore + (a.p.minPrice - b.p.minPrice) / 500)
  return out
}

export const search = (query) => searchScored(query).map((x) => x.p)
