import { spawn } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { updateJob, type Quality } from './database.js'

export const downloadsDir = join(import.meta.dirname, '..', '..', 'downloads')

export async function runDownload(id: number, url: string, quality: Quality): Promise<void> {
  try {
    await updateJob(id, 'downloading')
    await mkdir(downloadsDir, { recursive: true })
    const cookies = process.env.YTDLP_COOKIES_FILE
    if (cookies) await stat(cookies)

    const args = [
      '--no-playlist', '--no-check-certificates', '--no-progress', '--no-simulate',
      '--js-runtimes', 'node',
      '--print-json', '--format', `bestvideo[height=${quality.slice(0, -1)}]+bestaudio/best`,
      '--merge-output-format', 'mp4', '--remux-video', 'mp4',
      '--output', join(downloadsDir, `${id}.%(ext)s`),
    ]
    if (cookies) args.push('--cookies', cookies)
    args.push(url)

    const info = await new Promise<{ title?: string; duration?: number }>((resolve, reject) => {
      const child = spawn('yt-dlp', args)
      let output = ''
      let errors = ''
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString().slice(0, 1_000_000 - output.length) })
      child.stderr.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(-4000) })
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) {
          const finalError = errors.match(/^ERROR:.*$/gm)?.at(-1)
          return reject(new Error(finalError ?? (errors.trim() || `yt-dlp exited with code ${code}`)))
        }
        try {
          const line = output.trim().split('\n').at(-1)
          resolve(line ? JSON.parse(line) as { title?: string; duration?: number } : {})
        } catch (error) { reject(error) }
      })
    })
    await updateJob(id, 'completed', {
      title: typeof info.title === 'string' ? info.title : undefined,
      duration: typeof info.duration === 'number' ? Math.trunc(info.duration) : undefined,
    })
  } catch (error) {
    console.error(`Download ${id} failed:`, error)
    try { await updateJob(id, 'failed', { error: error instanceof Error ? error.message : String(error) }) }
    catch (databaseError) { console.error(`Could not mark job ${id} as failed:`, databaseError) }
  }
}
