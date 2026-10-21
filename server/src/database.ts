import pg from 'pg'

export const qualities = ['360p', '720p', '1080p', 'audio'] as const
export type Quality = typeof qualities[number]
export type Status = 'queued' | 'downloading' | 'completed' | 'failed'
export type VideoJob = {
  id: number
  url: string
  quality: Quality
  status: Status
  title: string
  duration: number | null
  error_message: string | null
  progress: number
  created_at: Date
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/app',
})

export async function prepareDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      url VARCHAR NOT NULL,
      quality VARCHAR(10) NOT NULL,
      status VARCHAR(20) NOT NULL CONSTRAINT check_status_values CHECK (status IN ('queued', 'downloading', 'completed', 'failed')),
      title VARCHAR(255) NOT NULL,
      error_message VARCHAR(500),
      duration INTEGER,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_status_created ON videos (status, created_at)')
  // Upgrade tables created by earlier versions of the app.
  await pool.query('DROP INDEX IF EXISTS ix_videos_title')
  await pool.query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0')
  await pool.query(`
    ALTER TABLE videos DROP CONSTRAINT IF EXISTS check_quality_values,
      ADD CONSTRAINT check_quality_values CHECK (quality IN (${qualities.map(quality => `'${quality}'`).join(', ')}))
  `)
}

// The download queue lives in memory, so jobs left unfinished by a previous process can never complete.
export async function failInterruptedJobs(): Promise<void> {
  await pool.query(
    `UPDATE videos SET status = 'failed', error_message = 'Server restarted before the download finished.', updated_at = now()
      WHERE status IN ('queued', 'downloading')`,
  )
}

const columns = 'id, url, quality, status, title, duration, error_message, progress, created_at'

export async function createJob(url: string, quality: Quality): Promise<VideoJob> {
  const result = await pool.query<VideoJob>(
    `INSERT INTO videos (url, quality, status, title) VALUES ($1, $2, 'queued', $3) RETURNING ${columns}`,
    [url, quality, url.slice(0, 255)],
  )
  return result.rows[0]
}

export async function findJob(id: number): Promise<VideoJob | null> {
  const result = await pool.query<VideoJob>(`SELECT ${columns} FROM videos WHERE id = $1`, [id])
  return result.rows[0] ?? null
}

export async function listJobs(limit: number): Promise<VideoJob[]> {
  const result = await pool.query<VideoJob>(
    `SELECT ${columns} FROM videos ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  )
  return result.rows
}

export async function updateJob(id: number, status: Status, details?: { title?: string; duration?: number; error?: string }): Promise<void> {
  await pool.query(
    `UPDATE videos SET status = $2, title = COALESCE($3, title), duration = COALESCE($4, duration),
      error_message = $5, updated_at = now() WHERE id = $1`,
    [id, status, details?.title?.slice(0, 255) ?? null, details?.duration ?? null, details?.error?.slice(0, 500) ?? null],
  )
}

export async function setProgress(id: number, progress: number): Promise<void> {
  await pool.query(`UPDATE videos SET progress = $2, updated_at = now() WHERE id = $1 AND status = 'downloading'`, [id, progress])
}

export async function deleteJob(id: number): Promise<void> {
  await pool.query('DELETE FROM videos WHERE id = $1', [id])
}
