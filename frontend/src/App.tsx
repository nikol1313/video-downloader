import { useEffect, useState } from 'react'
import { getFile, getJob, getJobs, startDownload, type Quality, type VideoJob } from './api'

type Notice = { text: string; kind: 'success' | 'error' | 'info' }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function NoticeBox({ notice }: { notice: Notice | null }) {
  return notice && <p className={`notice notice--${notice.kind}`} role="status">{notice.text}</p>
}

function duration(seconds: number | null): string {
  if (seconds === null) return 'Not available'
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function JobDetails({ job }: { job: VideoJob }) {
  return (
    <dl className="details">
      <dt>Job ID</dt><dd>{job.id}</dd>
      <dt>Title</dt><dd>{job.title}</dd>
      <dt>Quality</dt><dd>{job.quality}</dd>
      <dt>Duration</dt><dd>{duration(job.duration)}</dd>
      <dt>Status</dt><dd>{job.status}</dd>
      {job.error_message && <><dt>Error</dt><dd>{job.error_message}</dd></>}
      <dt>URL</dt><dd>{job.url}</dd>
      <dt>Created</dt><dd>{new Date(job.created_at).toLocaleString()}</dd>
    </dl>
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
  const [jobId, setJobId] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [startNotice, setStartNotice] = useState<Notice | null>(null)
  const [statusNotice, setStatusNotice] = useState<Notice | null>(null)
  const [downloadNotice, setDownloadNotice] = useState<Notice | null>(null)
  const [jobsNotice, setJobsNotice] = useState<Notice | null>(null)
  const [job, setJob] = useState<VideoJob | null>(null)
  const [jobs, setJobs] = useState<VideoJob[]>([])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!url.trim()) {
      setStartNotice({ text: 'Please enter a video URL.', kind: 'error' })
      return
    }
    setStartNotice({ text: 'Submitting…', kind: 'info' })
    try {
      const created = await startDownload(url.trim(), quality)
      setJobId(String(created.id))
      setJob(created)
      setStartNotice({ text: `Job ${created.id} started.`, kind: 'success' })
    } catch (error) {
      setStartNotice({ text: errorText(error), kind: 'error' })
    }
  }

  async function checkStatus(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!jobId.trim()) {
      setStatusNotice({ text: 'Please enter a Job ID.', kind: 'error' })
      return
    }
    try {
      const current = await getJob(jobId.trim())
      setJob(current)
      setStatusNotice(null)
    } catch (error) {
      setJob(null)
      setStatusNotice({ text: errorText(error), kind: 'error' })
    }
  }

  useEffect(() => {
    if (!autoRefresh || !jobId.trim()) return
    let active = true
    const refresh = async () => {
      try {
        const current = await getJob(jobId.trim())
        if (active) {
          setJob(current)
          setStatusNotice(null)
        }
      } catch (error) {
        if (active) setStatusNotice({ text: errorText(error), kind: 'error' })
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [autoRefresh, jobId])

  async function download() {
    if (!jobId.trim()) {
      setDownloadNotice({ text: 'Please enter a Job ID.', kind: 'error' })
      return
    }
    try {
      const blob = await getFile(jobId.trim())
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `${jobId.trim()}.mp4`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      setDownloadNotice({ text: 'Download started.', kind: 'success' })
    } catch (error) {
      setDownloadNotice({ text: errorText(error), kind: 'error' })
    }
  }

  async function refreshJobs() {
    try {
      const recent = await getJobs()
      setJobs(recent)
      setJobsNotice(recent.length ? null : { text: 'No jobs found.', kind: 'info' })
    } catch (error) {
      setJobsNotice({ text: errorText(error), kind: 'error' })
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
          <p>Paste a supported video URL and choose 360p, 720p, or 1080p. The app creates a download job and shows its current status. When processing finishes, you can save the file to your device. Recent jobs stay available so you can check them again.</p>
          <a className="primary-link" href="#download-form">Start downloading</a>
        </div>
      </header>

      <section className="step" id="download-form" aria-labelledby="start-heading">
        <h2 id="start-heading">Start a download</h2>
        <form onSubmit={submit}>
          <label htmlFor="url">Video URL</label>
          <input id="url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." required />
          <label htmlFor="quality">Quality</label>
          <select id="quality" value={quality} onChange={event => setQuality(event.target.value as Quality)}>
            <option value="360p">360p</option><option value="720p">720p</option><option value="1080p">1080p</option>
          </select>
          <button type="submit">Start download</button>
        </form>
        <NoticeBox notice={startNotice} />
      </section>

      <section className="step" aria-labelledby="status-heading">
        <h2 id="status-heading">Check status</h2>
        <form onSubmit={checkStatus}>
          <label htmlFor="job-id">Job ID</label>
          <input id="job-id" type="number" min="1" value={jobId} onChange={event => { setJobId(event.target.value); setJob(null) }} placeholder="Enter a job ID" />
          <button type="submit">Check status</button>
        </form>
        <label className="checkbox"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />Auto-refresh every 3 seconds</label>
        <NoticeBox notice={statusNotice} />
        {job && <JobDetails job={job} />}
      </section>

      <section className="step" aria-labelledby="download-heading">
        <h2 id="download-heading">Download the file</h2>
        <p>Uses the Job ID above. The file is available when its status is completed.</p>
        <button type="button" onClick={download}>Download file</button>
        <NoticeBox notice={downloadNotice} />
      </section>

      <section className="step" aria-labelledby="jobs-heading">
        <h2 id="jobs-heading">Recent jobs</h2>
        <button type="button" className="secondary" onClick={refreshJobs}>Refresh jobs</button>
        <NoticeBox notice={jobsNotice} />
        {jobs.length > 0 && <ul className="job-list">{jobs.map(recent => <li key={recent.id}><button type="button" onClick={() => { setJobId(String(recent.id)); setJob(recent) }}><strong>#{recent.id}</strong><span>{recent.title}</span><small>{recent.status}</small></button></li>)}</ul>}
      </section>
    </main>
  )
}
