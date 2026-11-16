// Port of ml/nlp_features.py: tokenizer with negation scoping + feature extraction. Must stay identical to the Python
// version, because the model weights were trained on its output (server/nlp-test.js checks parity with scikit-learn).
const TOKEN_RE = /[a-z0-9]+(?:'[a-z]+)?|[.!?,;:()\[\]"]/g
const PUNCT = new Set(['.', '!', '?', ',', ';', ':', '(', ')', '[', ']', '"'])
const NEGATORS = new Set(['not', 'no', 'never', 'none', 'nothing', 'neither', 'nor', 'cannot', 'without', 'hardly', 'barely', 'scarcely',
  'dont', 'doesnt', 'didnt', 'isnt', 'wasnt', 'cant', 'wont', 'couldnt', 'wouldnt', 'shouldnt', 'havent', 'hasnt', 'arent', 'werent', 'aint'])
const CONTRAST = new Set(['but', 'however', 'although', 'though', 'yet', 'except'])
const PASS = new Set(['a', 'an', 'the', 'very', 'too', 'really', 'so', 'at', 'all', 'be', 'been', 'is', 'are', 'was', 'were',
  'that', 'it', 'to', 'of', 'even', 'quite', 'just', 'much', 'more', 'any'])
const WINDOW = 3
const isNegator = (w) => NEGATORS.has(w) || w.endsWith("n't")

export function tokens(text) {
  const t = String(text ?? '').toLowerCase().replace(/’/g, "'")
  const out = []
  let left = 0
  for (const m of t.matchAll(TOKEN_RE)) {
    const w = m[0]
    if (PUNCT.has(w)) { left = 0; out.push([w, null, false]); continue }
    if (CONTRAST.has(w)) { left = 0; out.push([w, w, false]); continue }
    if (isNegator(w)) { left = WINDOW; out.push([w, w, false]); continue }
    if (left > 0 && !PASS.has(w)) { left -= 1; out.push(['not_' + w, w, true]) } else out.push([w, w, false])
  }
  return out
}

export function features(text, lexPos, lexNeg, vader) {
  const feats = []
  let prev = null
  for (const [tok, base, neg] of tokens(text)) {
    if (base === null) { prev = null; continue }
    feats.push(tok)
    if (prev !== null) feats.push(prev + '_' + tok)
    prev = tok
    if (lexPos.has(base)) feats.push(neg ? '__LN__' : '__LP__')
    else if (lexNeg.has(base)) feats.push(neg ? '__LP__' : '__LN__')
    if (vader && vader.has(base)) {
      const v = neg ? -vader.get(base) : vader.get(base)
      feats.push('__V' + (v > 0 ? 'P' : 'N') + Math.abs(v) + '__')
    }
  }
  return feats
}
