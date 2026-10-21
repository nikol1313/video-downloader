import express from 'express'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import client from 'prom-client'
import { createJob, findJob, listJobs, type Quality } from './database.js'
import { downloadsDir, runDownload } from './downloader.js'

const staticDir = join(import.meta.dirname, '..', '..', 'app', 'static')
const requestCount = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
})
client.collectDefaultMetrics()

function jobId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function pageNumber(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

export const app = express()
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.on('finish', () => {
    requestCount.inc({ method: req.method, path: req.route?.path ?? 'unmatched', status: String(res.statusCode) })
  })
  next()
})
app.use('/static', express.static(staticDir, { index: false }))

app.get('/', (_req, res) => res.sendFile(join(staticDir, 'index.html')))

app.get('/metrics', async (_req, res) => {
  res.type(client.register.contentType).send(await client.register.metrics())
})

app.post('/videos', async (req, res) => {
  const { url, quality } = req.query
  if (typeof url !== 'string' || typeof quality !== 'string') {
    res.status(422).json({ detail: 'A video URL and quality are required.' })
    return
  }
  let parsed: URL
  try { parsed = new URL(url) }
  catch { res.status(422).json({ detail: 'Enter a valid video URL.' }); return }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    res.status(422).json({ detail: 'Enter an HTTP or HTTPS video URL.' })
    return
  }
  if (!['360p', '720p', '1080p'].includes(quality)) {
    res.status(422).json({ detail: 'Quality must be 360p, 720p, or 1080p.' })
    return
  }
  const job = await createJob(url, quality as Quality)
  res.json(job)
  void runDownload(job.id, url, quality as Quality)
})

app.get('/videos', async (req, res) => {
  const skip = pageNumber(req.query.skip, 0)
  const limit = pageNumber(req.query.limit, 10)
  if (skip === null || limit === null || limit > 100) {
    res.status(422).json({ detail: 'skip must be nonnegative and limit must be between 0 and 100.' })
    return
  }
  res.json(await listJobs(skip, limit))
})

app.get('/videos/:jobId', async (req, res) => {
  const id = jobId(req.params.jobId)
  if (id === null) { res.status(422).json({ detail: 'Invalid Job ID.' }); return }
  const job = await findJob(id)
  if (!job) { res.status(404).json({ detail: 'Video job not found.' }); return }
  res.json(job)
})

app.get('/download/:jobId', async (req, res) => {
  const id = jobId(req.params.jobId)
  if (id === null) { res.status(422).json({ detail: 'Invalid Job ID.' }); return }
  const job = await findJob(id)
  if (!job) { res.status(404).json({ detail: 'Video job not found.' }); return }
  if (job.status !== 'completed') {
    res.status(400).json({ detail: 'Video is still processing or the download failed. Check GET /videos/{job_id}.' })
    return
  }
  const files = await readdir(downloadsDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const file = files.find(name => new RegExp(`^${id}\\.(mp4|mkv|webm)$`).test(name))
  if (!file) { res.status(404).json({ detail: 'Video file not found on disk.' }); return }
  res.download(join(downloadsDir, file), file)
})

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  if (!res.headersSent) res.status(500).json({ detail: 'Internal server error.' })
})
