// Review analysis: overall sentiment + aspect-based sentiment + quality flags, for one piece of text.
import { probPositive, labelOf, sentences, fixSpelling, THRESH } from './sentiment.js'
import { ALL_ASPECTS, aspectLabel, clauses, mentioned } from './aspects.js'

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d
const words = (s) => (s.match(/[A-Za-z0-9']+/g) || []).length
const neutralish = (p) => p > THRESH.neg && p < THRESH.pos

// Phrases a bag-of-words model cannot get right because the negation flips a "bad" noun into praise or a "good" noun into a complaint.
const NO_PROBLEM = /\b(?:no|without|never|zero|free of|(?:barely|hardly|not) any|nothing)\s+(?:\w+\s+){0,2}?(?:shrink\w*|fad(?:e|ed|ing)|lag\w*|nois\w*|irritat\w*|break ?outs?|dryness|greas\w*|stick(?:y|iness)|residue|distortion|vibration\w*|heating|overheat\w*|drain\w*|disconnect\w*|damage\w*|scratch\w*|leak\w*|smell|odou?r|rash\w*|pain|fatigue|issues?|problems?|complaints?|white cast|stains?|defects?|hassle|delay\w*|flicker\w*|hangs?)\b/i
const NOT_BAD = /\bnot\s+(?:too\s+|very\s+|at all\s+)?(?:overpowering|greasy|heavy|harsh|tight|loose|noisy|bulky|flimsy|slow|laggy|sticky|itchy|cheap|dull|thin|rough|hot|bad|poor|complicated|confusing|disappointing)\b/i
const NO_BENEFIT = /\b(?:no|zero|without|not any|hardly any|barely any)\s+(?:\w+\s+)?(?:results?|improvement|difference|effect|update|response|reply|support|help|refund|replacement|coverage|benefit)\b|\bnot\s+(?:effective|worth|comfortable|durable|good|great|recommended|satisfied|happy|as described)\b/i
/** Returns a probability override for clauses these patterns decide, else null. */
const NEG_VERB = /\b(?:drains?|drained|draining|overheat\w*|heats? up|lags?|laggy|hangs?|hanging|breaks?|broke|broken|cracked?|leaks?|leaking|peeled?|peeling|wears? out|stopped working|stops working)\b/i
const NEGATED = /\b(?:not|no|never|without|barely|hardly|doesn'?t|don'?t|didn'?t|isn'?t|wasn'?t)\b/i
const REPEAT = /\b(?:would|will|definitely|surely|gladly|happily)\b[^.!?]{0,20}\b(?:buy|recommend|order|purchase|get)\b[^.!?]{0,12}\bagain\b|\bwould (?:highly |definitely )?recommend\b/i
const LET_DOWN = /\bexpected (?:much |a lot |far )?(?:better|more)\b|\bcould (?:have )?(?:been )?(?:be )?(?:much )?better\b|\bnot what i expected\b/i
const MEH = /\baverage (?:product|quality|performance|phone|one)\b|\bso-?so\b|\bnothing special\b|\bjust (?:ok|okay)\b|\bmediocre\b/i
const NO_QUESTIONS = /\bno questions asked\b/i
const ruleProb = (t) => (REPEAT.test(t) && !NEGATED.test(t) ? 0.9 : LET_DOWN.test(t) ? 0.12 : MEH.test(t) ? 0.5 : NO_QUESTIONS.test(t) ? 0.88 : NO_BENEFIT.test(t) ? 0.12 : NO_PROBLEM.test(t) || NOT_BAD.test(t) ? 0.85 : NEG_VERB.test(t) && !NEGATED.test(t) ? 0.15 : null)

/**
 * @param text   review text
 * @param opts   { stars?: 1..5, aspects?: allowed aspect keys }
 * @returns { p, label, sentences:[{text,p,label}], aspects:[{key,label,p,sentiment,quote}], flags:[] }
 */
export function analyzeText(text, opts = {}) {
  const allowed = opts.aspects || ALL_ASPECTS
  text = fixSpelling(text)
  const sents = sentences(text).map((s) => ({ text: s, p: ruleProb(s) ?? probPositive(s) }))
  // Overall: length-weighted average of sentence probabilities (the model was trained on sentences).
  let wsum = 0, psum = 0
  for (const s of sents) { const w = Math.sqrt(Math.max(1, words(s.text))); wsum += w; psum += w * s.p }
  const p = wsum ? psum / wsum : probPositive(text)

  const found = new Map() // aspect -> best (most opinionated) mention in this review
  for (const s of sents) {
    for (const c of clauses(s.text, allowed)) {
      const keys = mentioned(c.text, allowed)
      if (!keys.length) continue
      let cp = ruleProb(c.text) ?? probPositive(c.text)
      if (neutralish(cp) && c.parent !== c.text) cp = probPositive(c.parent) // "great camera and battery": inherit
      if (neutralish(cp)) cp = cp * 0.5 + s.p * 0.5 // still unsure: lean on the whole sentence
      for (const k of keys) {
        const prev = found.get(k)
        if (!prev || Math.abs(cp - 0.5) > Math.abs(prev.p - 0.5)) found.set(k, { key: k, label: aspectLabel(k), p: round(cp), sentiment: labelOf(cp), quote: c.text.trim() })
      }
    }
  }

  const flags = []
  const stars = opts.stars
  if (stars) {
    if (stars >= 4 && p <= 0.3) flags.push('rating-higher-than-text')
    if (stars <= 2 && p >= 0.7) flags.push('rating-lower-than-text')
  }
  const w = words(text)
  if (w <= 3 && (!stars || stars >= 4)) flags.push('low-effort')
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length > 12 && text.replace(/[^A-Z]/g, '').length / letters.length > 0.7) flags.push('all-caps')
  if (/(.)\1{4,}|!{4,}/.test(text)) flags.push('exaggerated')

  return { p: round(p), label: labelOf(p), sentences: sents.map((s) => ({ text: s.text, p: round(s.p), label: labelOf(s.p) })), aspects: [...found.values()], flags }
}
