import { useEffect, useState } from 'react'
import { deleteJob, fileUrl, getJobs, startDownload, type Quality, type VideoJob } from './api'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function duration(seconds: number | null): string | null {
  if (seconds === null) return null
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function statusText(job: VideoJob): string {
  if (job.status !== 'downloading') return job.status
  // yt-dlp still merges or converts the file after the last byte arrives.
  return job.progress === 100 ? 'processing' : `downloading ${job.progress}%`
}

function JobItem({ job, onDelete }: { job: VideoJob; onDelete: (job: VideoJob) => void }) {
  const finished = job.status === 'completed' || job.status === 'failed'
  const details = [job.quality === 'audio' ? 'MP3' : job.quality, duration(job.duration), statusText(job)].filter(Boolean).join(' · ')
  return (
    <li className="job">
      <strong>#{job.id}</strong>
      <div>
        <span className="job-title">{job.title}</span>
        <small>{details}</small>
        {job.status === 'downloading' && <progress max={100} value={job.progress} aria-label={`Job ${job.id} progress`} />}
        {job.error_message && <small className="job-error">{job.error_message}</small>}
      </div>
      <div className="job-actions">
        {job.status === 'completed' && <a className="button" href={fileUrl(job.id)} download>Download</a>}
        {finished && <button type="button" className="secondary" onClick={() => onDelete(job)}>Delete</button>}
      </div>
    </li>
  )
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [url, setUrl] = useState('')
  const [quality, setQuality] = useState<Quality>('720p')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<VideoJob[]>([])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  async function refreshJobs() {
    try {
      setJobs(await getJobs())
    } catch (error) {
      setError(errorText(error))
    }
  }

  useEffect(() => { void refreshJobs() }, [])

  // Keep polling while any job is still in progress.
  const hasActiveJobs = jobs.some(job => job.status === 'queued' || job.status === 'downloading')
  useEffect(() => {
    if (!hasActiveJobs) return
    const timer = window.setInterval(refreshJobs, 2000)
    return () => window.clearInterval(timer)
  }, [hasActiveJobs])

  async function remove(job: VideoJob) {
    setError(null)
    try {
      await deleteJob(job.id)
      setJobs(current => current.filter(item => item.id !== job.id))
    } catch (error) {
      setError(errorText(error))
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await startDownload(url.trim(), quality)
      setJobs(current => [created, ...current])
      setUrl('')
    } catch (error) {
      setError(errorText(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <div className="topbar">
          <span>Video Downloader</span>
          <button type="button" className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          </button>
        </div>
        <div className="hero-content">
          <h1>Download a video.</h1>
          <p>Paste a link from YouTube or any site yt-dlp supports, pick a video quality or audio only, and save the file when it is ready.</p>
          <a className="button" href="#download-form">Start downloading</a>
        </div>
      </header>

      <section className="step" id="download-form" aria-labelledby="start-heading">
        <h2 id="start-heading">Start a download</h2>
        <form onSubmit={submit}>
          <label htmlFor="url">Video URL</label>
          <input id="url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required />
          <label htmlFor="quality">Quality</label>
          <select id="quality" value={quality} onChange={event => setQuality(event.target.value as Quality)}>
            <option value="360p">360p</option><option value="720p">720p</option><option value="1080p">1080p</option><option value="audio">Audio only (MP3)</option>
          </select>
          <button type="submit" disabled={submitting}>{submitting ? 'Starting…' : 'Start download'}</button>
        </form>
        {error && <p className="notice" role="alert">{error}</p>}
      </section>

      <section className="step" aria-labelledby="jobs-heading">
        <h2 id="jobs-heading">Downloads</h2>
        {jobs.length > 0
          ? <ul className="job-list">{jobs.map(job => <JobItem key={job.id} job={job} onDelete={remove} />)}</ul>
          : <p>No downloads yet.</p>}
      </section>
    </main>
  )
}
