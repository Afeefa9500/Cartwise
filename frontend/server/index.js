import './env.js'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { ROOT } from './env.js'
import { router } from './routes.js'
import { aiRouter } from './ai-routes.js'
import { purge, FILE } from './db.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001
const DIST = path.join(ROOT, 'dist')
if (process.env.TRUST_PROXY) app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  })
  next()
})

app.use('/api', express.json({ limit: '20kb' }))
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  // Cross-site request protection: browsers send Origin on writes; it must match this site.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const o = req.get('origin')
    if (o) { try { if (new URL(o).host !== req.get('host')) throw 0 } catch { return res.status(403).json({ error: 'Blocked cross-site request' }) } }
  }
  next()
})
app.use('/api', aiRouter)
// Live product search is handled by the Python/FastAPI service. The RapidAPI key stays server-side.
app.get('/api/live/search', async (req, res) => {
  const query = String(req.query.q || '').trim()
  if (!query || query.length > 180) return res.status(400).json({ error: 'Enter a product search (max 180 characters).' })
  const base = (process.env.CARTWISE_PYTHON_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  try {
    const upstream = await fetch(`${base}/api/search?${new URLSearchParams({ q: query, limit: '20' })}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(35000) })
    const payload = await upstream.json()
    return res.status(upstream.status).json(payload)
  } catch (error) {
    return res.status(502).json({ status: 'BACKEND_UNAVAILABLE', message: 'Live search service is unavailable. Start the FastAPI backend and check CARTWISE_PYTHON_API_URL.' })
  }
})
app.get('/api/live/usage', async (_req, res) => {
  const base = (process.env.CARTWISE_PYTHON_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  try { const r = await fetch(`${base}/api/usage`, { signal: AbortSignal.timeout(5000) }); return res.status(r.status).json(await r.json()) }
  catch { return res.status(502).json({ error: 'Usage monitor unavailable' }) }
})
app.use('/api', router)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(DIST))
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
} else {
  app.get('/', (req, res) => res.type('text').send('CartWise API is running. For the website run "npm run dev" (opens http://localhost:5173) or "npm start".'))
}

app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body' })
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server' })
})

setInterval(purge, 10 * 60e3).unref()
purge()
app.listen(PORT, () => console.log(`CartWise server on http://localhost:${PORT}  (database: ${FILE})`))
  .on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Close the other program or set PORT in .env.` : e); process.exit(1) })
