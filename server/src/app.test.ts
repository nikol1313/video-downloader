import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { Server } from 'node:http'
import { app } from './app.js'
import { createJob, pool, prepareDatabase, updateJob } from './database.js'

let server: Server
let origin: string

before(async () => {
  await prepareDatabase()
  server = app.listen(0)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Server did not start')
  origin = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await pool.end()
})

function post(body: string) {
  return fetch(`${origin}/videos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}

test('serves the React page and metrics', async () => {
  const page = await fetch(origin)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<div id="root"><\/div>/)
  const metrics = await fetch(`${origin}/metrics`)
  assert.equal(metrics.status, 200)
  assert.match(await metrics.text(), /http_requests_total/)
})

test('rejects invalid download requests', async () => {
  assert.equal((await post(JSON.stringify({ url: 'file:///etc/passwd', quality: '720p' }))).status, 422)
  assert.equal((await post(JSON.stringify({ url: 'https://example.com/video', quality: '4k' }))).status, 422)
  const malformed = await post('{')
  assert.equal(malformed.status, 400)
  assert.ok(((await malformed.json()) as { error?: string }).error)
})

test('reads jobs and refuses files that are not ready', async () => {
  const job = await createJob('https://example.com/video', '720p')
  try {
    const status = await fetch(`${origin}/videos/${job.id}`)
    assert.equal(status.status, 200)
    const body = await status.json() as Record<string, unknown>
    assert.equal(body.id, job.id)
    assert.equal(body.status, 'queued')

    const recent = await fetch(`${origin}/videos`)
    assert.equal(recent.status, 200)
    assert.ok((await recent.json() as Array<{ id: number }>).some(item => item.id === job.id))

    assert.equal((await fetch(`${origin}/videos/${job.id}/file`)).status, 409)
    assert.equal((await fetch(`${origin}/videos/abc`)).status, 404)
  } finally {
    await pool.query('DELETE FROM videos WHERE id = $1', [job.id])
  }
})

test('deletes finished jobs only', async () => {
  const job = await createJob('https://example.com/song', 'audio')
  try {
    assert.equal((await fetch(`${origin}/videos/${job.id}`, { method: 'DELETE' })).status, 409)
    await updateJob(job.id, 'failed', { error: 'test' })
    assert.equal((await fetch(`${origin}/videos/${job.id}`, { method: 'DELETE' })).status, 204)
    assert.equal((await fetch(`${origin}/videos/${job.id}`)).status, 404)
  } finally {
    await pool.query('DELETE FROM videos WHERE id = $1', [job.id])
  }
})
