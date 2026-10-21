export type Quality = '360p' | '720p' | '1080p' | 'audio'

export type VideoJob = {
  id: number
  url: string
  quality: Quality
  status: 'queued' | 'downloading' | 'completed' | 'failed'
  title: string
  duration: number | null
  error_message: string | null
  progress: number
  created_at: string
}

async function check(response: Response): Promise<Response> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed with status ${response.status}`)
  }
  return response
}

async function json<T>(response: Response): Promise<T> {
  return (await check(response)).json() as Promise<T>
}

export function startDownload(url: string, quality: Quality): Promise<VideoJob> {
  return fetch('/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, quality }),
  }).then(json<VideoJob>)
}

export function getJobs(): Promise<VideoJob[]> {
  return fetch('/videos').then(json<VideoJob[]>)
}

export async function deleteJob(id: number): Promise<void> {
  await check(await fetch(`/videos/${id}`, { method: 'DELETE' }))
}

export function fileUrl(id: number): string {
  return `/videos/${id}/file`
}
