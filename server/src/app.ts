import express from 'express'
import { join } from 'node:path'
import client from 'prom-client'
import { createJob, deleteJob, findJob, listJobs, qualities, type Quality } from './database.js'
import { enqueueDownload, fileExtension, outputPath, removeFiles } from './downloader.js'

const publicDir = join(import.meta.dirname, '..', 'public')
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

function isQuality(value: unknown): value is Quality {
  return qualities.includes(value as Quality)
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const app = express()
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.on('finish', () => {
    requestCount.inc({ method: req.method, path: req.route?.path ?? 'unmatched', status: String(res.statusCode) })
  })
  next()
})
app.use(express.json())
app.use(express.static(publicDir))

app.get('/metrics', async (_req, res) => {
  res.type(client.register.contentType).send(await client.register.metrics())
})

app.post('/videos', async (req, res) => {
  const { url, quality } = req.body ?? {}
  if (!isWebUrl(url)) { res.status(422).json({ error: 'Enter an HTTP or HTTPS video URL.' }); return }
  if (!isQuality(quality)) { res.status(422).json({ error: 'Quality must be 360p, 720p, 1080p, or audio.' }); return }
  const job = await createJob(url, quality)
  enqueueDownload(job)
  res.status(201).json(job)
})

app.get('/videos', async (_req, res) => {
  res.json(await listJobs(20))
})

app.get('/videos/:jobId', async (req, res) => {
  const id = jobId(req.params.jobId)
  const job = id && await findJob(id)
  if (!job) { res.status(404).json({ error: 'Video job not found.' }); return }
  res.json(job)
})

app.get('/videos/:jobId/file', async (req, res, next) => {
  const id = jobId(req.params.jobId)
  const job = id && await findJob(id)
  if (!job) { res.status(404).json({ error: 'Video job not found.' }); return }
  if (job.status !== 'completed') { res.status(409).json({ error: `Video is ${job.status}.` }); return }
  const filename = `${job.title.replace(/[\\/:*?"<>|]/g, '_')}.${fileExtension(job.quality)}`
  res.download(outputPath(job), filename, error => {
    if (!error) return
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !res.headersSent) {
      res.status(404).json({ error: 'Video file not found on disk.' })
    } else {
      next(error)
    }
  })
})

// Running downloads cannot be cancelled yet, so only finished jobs can be deleted.
app.delete('/videos/:jobId', async (req, res) => {
  const id = jobId(req.params.jobId)
  const job = id && await findJob(id)
  if (!job) { res.status(404).json({ error: 'Video job not found.' }); return }
  if (job.status === 'queued' || job.status === 'downloading') {
    res.status(409).json({ error: 'Wait for the download to finish before deleting it.' })
    return
  }
  await removeFiles(job.id)
  await deleteJob(job.id)
  res.status(204).end()
})

// Client errors (such as invalid JSON bodies) carry their own status; anything else is a server bug.
app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error.status ?? 500
  if (status >= 500) console.error(error)
  if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message })
})
