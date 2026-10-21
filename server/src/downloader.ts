import { spawn } from 'node:child_process'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { setProgress, updateJob, type Quality, type VideoJob } from './database.js'

export const downloadsDir = join(import.meta.dirname, '..', '..', 'downloads')
const maxConcurrentDownloads = 2

// Videos are always remuxed to MP4 and audio is converted to MP3, so a file path depends only on the job.
export function fileExtension(quality: Quality): string {
  return quality === 'audio' ? 'mp3' : 'mp4'
}

export function outputPath(job: Pick<VideoJob, 'id' | 'quality'>): string {
  return join(downloadsDir, `${job.id}.${fileExtension(job.quality)}`)
}

const queue: VideoJob[] = []
let running = 0

export function enqueueDownload(job: VideoJob): void {
  queue.push(job)
  startNext()
}

function startNext(): void {
  while (running < maxConcurrentDownloads && queue.length > 0) {
    const job = queue.shift()!
    running++
    void runDownload(job.id, job.url, job.quality).finally(() => {
      running--
      startNext()
    })
  }
}

function formatArgs(quality: Quality): string[] {
  if (quality === 'audio') return ['--format', 'ba/b', '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0']
  return [
    // Prefer the requested height (or the closest one below it) and widely playable H.264/AAC streams.
    '--format', 'bv*+ba/b', '--format-sort', `res:${quality.slice(0, -1)},vcodec:h264,ext:mp4:m4a`,
    '--merge-output-format', 'mp4', '--remux-video', 'mp4',
  ]
}

type VideoInfo = { title?: unknown; duration?: unknown; format_id?: string; requested_formats?: Array<{ format_id: string }> }

async function runDownload(id: number, url: string, quality: Quality): Promise<void> {
  try {
    await updateJob(id, 'downloading')
    await mkdir(downloadsDir, { recursive: true })
    const cookies = process.env.YTDLP_COOKIES_FILE
    if (cookies) await stat(cookies)

    const args = [
      '--no-playlist', '--no-simulate', '--print-json',
      '--js-runtimes', 'node',
      '--progress', '--newline', '--progress-template', 'download:progress %(info.format_id)s %(progress._percent)s',
      ...formatArgs(quality),
      '--output', join(downloadsDir, `${id}.%(ext)s`),
    ]
    if (cookies) args.push('--cookies', cookies)
    args.push('--', url)

    await new Promise<void>((resolve, reject) => {
      const child = spawn('yt-dlp', args)
      // yt-dlp prints the video info as one JSON line before downloading, then one progress line per update.
      // A merged video downloads its video and audio streams one after another, each going from 0 to 100%.
      let streams: string[] = []
      let infoSaved = Promise.resolve()
      let reported = 0
      let saving = false
      let errors = ''
      createInterface({ input: child.stdout }).on('line', line => {
        const match = line.match(/^progress (\S+) ([\d.]+)$/)
        if (!match) {
          let info: VideoInfo
          try { info = JSON.parse(line) } catch { return }
          streams = info.requested_formats?.map(format => format.format_id) ?? [info.format_id ?? '']
          infoSaved = updateJob(id, 'downloading', {
            title: typeof info.title === 'string' ? info.title : undefined,
            duration: typeof info.duration === 'number' ? Math.trunc(info.duration) : undefined,
          }).catch(reject)
          return
        }
        const stream = Math.max(streams.indexOf(match[1]), 0)
        const progress = Math.floor((stream * 100 + Number(match[2])) / Math.max(streams.length, 1))
        // Skip updates while a write is in flight so the database never falls behind the download.
        if (progress <= reported || saving) return
        reported = progress
        saving = true
        void setProgress(id, progress).catch(reject).finally(() => { saving = false })
      })
      child.stderr.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(-4000) })
      child.on('error', reject)
      child.on('close', code => {
        // Wait for the title update so it cannot land after the job is marked completed.
        if (code === 0) return void infoSaved.then(resolve)
        const finalError = errors.match(/^ERROR:.*$/gm)?.at(-1)
        reject(new Error(finalError ?? (errors.trim() || `yt-dlp exited with code ${code}`)))
      })
    })
    await updateJob(id, 'completed')
  } catch (error) {
    console.error(`Download ${id} failed:`, error)
    await removeFiles(id).catch(cleanupError => console.error(`Could not clean up job ${id}:`, cleanupError))
    try { await updateJob(id, 'failed', { error: error instanceof Error ? error.message : String(error) }) }
    catch (databaseError) { console.error(`Could not mark job ${id} as failed:`, databaseError) }
  }
}

export async function removeFiles(id: number): Promise<void> {
  const files = await readdir(downloadsDir).catch(() => [])
  await Promise.all(files.filter(name => name.startsWith(`${id}.`)).map(name => rm(join(downloadsDir, name), { force: true })))
}
