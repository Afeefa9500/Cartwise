// Unit tests for the NLP layer: JS inference must match scikit-learn, and the model must behave sensibly.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { probPositive, labelOf, sentences, fixSpelling, MODEL } from './nlp/sentiment.js'
import { analyzeText } from './nlp/analyze.js'

const here = path.dirname(fileURLToPath(import.meta.url))
let pass = 0, failed = 0
const t = (name, fn) => { try { fn(); pass++; console.log('ok   ' + name) } catch (e) { failed++; console.log('FAIL ' + name + ' -> ' + e.message) } }
const ok = (c, m) => { if (!c) throw new Error(m) }

t('JS inference matches scikit-learn on the parity fixture', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(here, 'nlp/parity.json'), 'utf8'))
  ok(rows.length > 30, 'fixture too small')
  for (const r of rows) {
    const p = probPositive(r.text)
    ok(Math.abs(p - r.p) < 2e-4, `"${r.text.slice(0, 50)}": js ${p.toFixed(6)} vs python ${r.p}`)
  }
})
t('model metadata is present', () => { ok(MODEL.metrics.cv5.acc > 0.75, 'cv accuracy missing'); ok(MODEL.vocab.length === MODEL.coef.length && MODEL.coef.length === MODEL.idf.length, 'shape mismatch') })
t('clear positives and negatives', () => {
  for (const s of ['Excellent phone, the battery is amazing and the camera is superb.', 'Delivery was fast and the packaging was perfect. Very happy!']) ok(labelOf(probPositive(s)) === 'positive', s)
  for (const s of ['Terrible quality, it broke after two days. Total waste of money.', 'Very disappointed, the sound is awful and the seller never replied.']) ok(labelOf(probPositive(s)) === 'negative', s)
})
t('negation flips meaning', () => {
  ok(probPositive('The battery is good.') > probPositive('The battery is not good.') + 0.2, 'not good should be clearly lower')
  ok(probPositive('The screen is bad.') < probPositive('The screen is not bad.') - 0.1, 'not bad should be higher')
})
t('empty text is safe', () => { const p = probPositive(''); ok(p > 0 && p < 1, 'p out of range'); ok(sentences('').length === 0, 'no sentences') })
t('sentence splitter', () => {
  const s = sentences('Great phone. Battery is bad! But the camera is good?\nShips fast.')
  ok(s.length === 4, 'expected 4 sentences, got ' + JSON.stringify(s))
})

const lab = (x) => analyzeText(x).label
t('spelling repair fixes swapped letters but leaves real words alone', () => {
  ok(fixSpelling('The design looks cehap') === 'The design looks cheap', fixSpelling('The design looks cehap'))
  ok(fixSpelling('The battery lasts long') === 'The battery lasts long', 'real words must not change')
})
t('rule layer: "no <problem>" is praise, "no results" is a complaint', () => {
  ok(lab('No lag, no heating, it runs smoothly.') === 'positive', 'no lag')
  ok(lab('No shrinking after a wash.') === 'positive', 'no shrinking')
  ok(lab('I saw no results even after weeks of use.') === 'negative', 'no results')
  ok(lab('Replaced it quickly with no questions asked.') === 'positive', 'no questions asked')
})
t('rule layer: common review phrases', () => {
  ok(lab('Would buy again.') === 'positive', 'would buy again')
  ok(lab('I would not buy this again.') === 'negative', 'would not buy again')
  ok(lab('Expected much better.') === 'negative', 'expected better')
  ok(lab('Average product for the price.') === 'mixed', 'average')
  ok(lab('The battery drains very fast.') === 'negative', 'drains fast')
})
t('aspect-based: each opinion gets its own aspect', () => {
  const a = analyzeText('Great camera but the battery drains fast. Delivery was late.')
  const m = Object.fromEntries(a.aspects.map((x) => [x.key, x.sentiment]))
  ok(m.camera === 'positive' && m.battery === 'negative' && m.delivery === 'negative', JSON.stringify(m))
})
t('quality flags: stars contradicting the text, one-word praise, shouting', () => {
  ok(analyzeText('Terrible. Stopped working after two days.', { stars: 5 }).flags.includes('rating-higher-than-text'), 'mismatch')
  ok(analyzeText('Nice', { stars: 5 }).flags.includes('low-effort'), 'low effort')
  ok(analyzeText('THIS IS THE BEST PRODUCT EVER MADE').flags.includes('all-caps'), 'caps')
})

console.log(`\n${pass} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
