import { app } from './app.js'
import { pool, prepareDatabase } from './database.js'

const port = Number(process.env.PORT ?? 8080)
await prepareDatabase()
const server = app.listen(port, '0.0.0.0', () => console.log(`Server listening on ${port}`))

async function shutdown() {
  server.close()
  await pool.end()
}
process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })
