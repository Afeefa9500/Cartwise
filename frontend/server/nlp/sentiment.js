// Review-sentiment inference: TF-IDF + logistic regression trained by ml/train.py (weights in model.json).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { features } from './tokenize.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const MODEL = JSON.parse(fs.readFileSync(path.join(here, 'model.json'), 'utf8'))

const index = new Map(MODEL.vocab.map((t, i) => [t, i]))
const lexPos = new Set(MODEL.lex_pos), lexNeg = new Set(MODEL.lex_neg)
const vader = MODEL.vader ? new Map(Object.entries(MODEL.vader).flatMap(([bin, words]) => words.map((w) => [w, Number(bin)]))) : null
export const THRESH = MODEL.thresholds // { neg: 0.40, pos: 0.60 }

/** Probability (0..1) that the text is positive. Empty / unseen-vocabulary text returns the model's prior. */
export function probPositive(text) {
  const counts = new Map()
  for (const f of features(text, lexPos, lexNeg, vader)) {
    const i = index.get(f)
    if (i !== undefined) counts.set(i, (counts.get(i) || 0) + 1)
  }
  let dot = 0, sq = 0
  for (const [i, c] of counts) { const v = (1 + Math.log(c)) * MODEL.idf[i]; dot += v * MODEL.coef[i]; sq += v * v }
  const z = MODEL.intercept + (sq > 0 ? dot / Math.sqrt(sq) : 0)
  return 1 / (1 + Math.exp(-z))
}

export const labelOf = (p) => (p >= THRESH.pos ? 'positive' : p <= THRESH.neg ? 'negative' : 'mixed')

/** Splits a review into sentences (keeps the originals for display). */
export function sentences(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Za-z0-9"'(])|\s*\n+\s*/).map((s) => s.trim()).filter((s) => /[a-z0-9]/i.test(s))
}

// ---- light spelling repair: reviews are full of swapped letters ("cehap", "rjeected"). A word the model has never seen is
// replaced only when swapping two neighbouring letters gives a word it knows, so real words are never touched.
const known = new Set(MODEL.vocab.filter((t) => /^[a-z]+$/.test(t)))
for (const w of MODEL.lex_pos) known.add(w)
for (const w of MODEL.lex_neg) known.add(w)
export function fixSpelling(text) {
  return String(text ?? '').replace(/[A-Za-z]{4,}/g, (w) => {
    const lw = w.toLowerCase()
    if (known.has(lw)) return w
    for (let i = 0; i < lw.length - 1; i++) {
      if (lw[i] === lw[i + 1]) continue
      const c = lw.slice(0, i) + lw[i + 1] + lw[i] + lw.slice(i + 2)
      if (known.has(c)) return w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? c[0].toUpperCase() + c.slice(1) : c
    }
    return w
  })
}
