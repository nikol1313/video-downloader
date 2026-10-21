export type Quality = '360p' | '720p' | '1080p'

export type VideoJob = {
  id: number
  url: string
  quality: Quality
  status: 'queued' | 'downloading' | 'completed' | 'failed'
  title: string
  duration: number | null
  error_message: string | null
  created_at: string
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = body.detail
      return typeof detail === 'string' ? detail : JSON.stringify(detail)
    }
  } catch {
    // The server may return a plain-text error.
  }
  return response.statusText || 'Request failed'
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Error ${response.status}: ${await readError(response)}`)
  return response.json() as Promise<T>
}

export function startDownload(url: string, quality: Quality): Promise<VideoJob> {
  const params = new URLSearchParams({ url, quality })
  return fetch(`/videos?${params}`, { method: 'POST' }).then(json<VideoJob>)
}

export function getJob(id: string): Promise<VideoJob> {
  return fetch(`/videos/${encodeURIComponent(id)}`).then(json<VideoJob>)
}

export function getJobs(): Promise<VideoJob[]> {
  return fetch('/videos').then(json<VideoJob[]>)
}

export async function getFile(id: string): Promise<Blob> {
  const response = await fetch(`/download/${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error(`Error ${response.status}: ${await readError(response)}`)
  return response.blob()
}
