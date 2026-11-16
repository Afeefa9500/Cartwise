// Public (no sign-in needed) endpoints for the review analysis and the shopping assistant.
import express from 'express'
import { BY_ID } from '../src/data.js'
import { productInsights, publicInsights, summaryMap, listReviews } from './insights.js'
import { analyzeText } from './nlp/analyze.js'
import { MODEL } from './nlp/sentiment.js'
import { reply } from './assistant.js'
import { limited } from './security.js'

export const aiRouter = express.Router()
const bad = (res, status, error) => res.status(status).json({ error })
const validId = (id) => typeof id === 'string' && Object.hasOwn(BY_ID, id)
const int = (v, d, lo, hi) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d }

/** Small per-card summary for every product: { id: { n, pos, neg, rt, ss, v, tr } }. */
aiRouter.get('/insights/summary', (req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(summaryMap()) })

/** Full review analysis of one product (sentiment split, aspect table, pros/cons, smart score, cautions). */
aiRouter.get('/products/:id/insights', (req, res) => {
  if (!validId(req.params.id)) return bad(res, 404, 'Product not found')
  res.json(publicInsights(productInsights(req.params.id)))
})

/** The analysed reviews themselves, filterable: ?sentiment=positive|mixed|negative &aspect=battery &sort=helpful|recent|high|low &limit &offset */
aiRouter.get('/products/:id/reviews', (req, res) => {
  if (!validId(req.params.id)) return bad(res, 404, 'Product not found')
  const { sentiment, aspect, sort } = req.query
  res.json(listReviews(req.params.id, {
    sentiment: typeof sentiment === 'string' ? sentiment : undefined, aspect: typeof aspect === 'string' ? aspect.slice(0, 20) : undefined,
    sort: typeof sort === 'string' ? sort : undefined, limit: int(req.query.limit, 8, 1, 30), offset: int(req.query.offset, 0, 0, 1000),
  }))
})

/** Run the trained model on any text a visitor types. Body: { text, stars? } */
aiRouter.post('/analyze', (req, res) => {
  if (limited('analyze:' + req.ip, 60, 60e3)) return bad(res, 429, 'Slow down a little')
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1500) : ''
  if (!text) return bad(res, 400, 'Write a review to analyse')
  const stars = Number.isInteger(req.body.stars) && req.body.stars >= 1 && req.body.stars <= 5 ? req.body.stars : undefined
  res.json(analyzeText(text, { stars }))
})

/** Shopping assistant. Body: { message, ctx } where ctx is the `parsed` object of the previous reply. */
aiRouter.post('/assistant', (req, res) => {
  if (limited('assist:' + req.ip, 40, 60e3)) return bad(res, 429, 'Slow down a little')
  res.json(reply(req.body?.message, req.body?.ctx && typeof req.body.ctx === 'object' ? req.body.ctx : {}))
})

/** What the model is and how well it did on held-out human-labelled data (from ml/train.py). */
aiRouter.get('/model', (req, res) => res.json({
  kind: MODEL.kind, trainedOn: MODEL.trained_on, thresholds: MODEL.thresholds, features: MODEL.vocab.length, metrics: MODEL.metrics,
}))
