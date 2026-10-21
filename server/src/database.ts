import pg from 'pg'

export type Quality = '360p' | '720p' | '1080p'
export type Status = 'queued' | 'downloading' | 'completed' | 'failed'
export type VideoJob = {
  id: number
  url: string
  quality: Quality
  status: Status
  title: string
  duration: number | null
  error_message: string | null
  created_at: Date
}

const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE ?? 'postgresql://user:password@localhost:5432/app'
export const pool = new pg.Pool({ connectionString: databaseUrl.replace('postgresql+asyncpg://', 'postgresql://') })

// Keep the table and constraints compatible with the original FastAPI app.
export async function prepareDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      url VARCHAR NOT NULL,
      quality VARCHAR(10) NOT NULL CONSTRAINT check_quality_values CHECK (quality IN ('360p', '720p', '1080p')),
      status VARCHAR(20) NOT NULL CONSTRAINT check_status_values CHECK (status IN ('queued', 'downloading', 'completed', 'failed')),
      title VARCHAR(255) NOT NULL,
      error_message VARCHAR(500),
      duration INTEGER,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_status_created ON videos (status, created_at)')
  await pool.query('CREATE INDEX IF NOT EXISTS ix_videos_title ON videos (title)')
}

const columns = 'id, url, quality, status, title, duration, error_message, created_at'

export async function createJob(url: string, quality: Quality): Promise<VideoJob> {
  const result = await pool.query<VideoJob>(
    `INSERT INTO videos (url, quality, status, title) VALUES ($1, $2, 'queued', 'Downloading...') RETURNING ${columns}`,
    [url, quality],
  )
  return result.rows[0]
}

export async function findJob(id: number): Promise<VideoJob | null> {
  const result = await pool.query<VideoJob>(`SELECT ${columns} FROM videos WHERE id = $1`, [id])
  return result.rows[0] ?? null
}

export async function listJobs(skip: number, limit: number): Promise<VideoJob[]> {
  const result = await pool.query<VideoJob>(
    `SELECT ${columns} FROM videos ORDER BY created_at DESC, id DESC OFFSET $1 LIMIT $2`,
    [skip, limit],
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
