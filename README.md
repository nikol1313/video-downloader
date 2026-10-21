# Video Downloader

A one-page React + TypeScript app with a Node.js + TypeScript API. PostgreSQL stores jobs; the server runs yt-dlp and FFmpeg to download videos. The server exposes Prometheus metrics at `/metrics`.

## Open the app

Install Docker, then run this from the project folder:

```bash
docker compose up --build
```

Open **http://localhost:8080** in Chrome. The first build downloads dependencies and can take a few minutes. Stop it with Ctrl+C. Job records and downloaded files persist in Docker volumes.

If port 8080 is already used, start with `APP_PORT=8081 docker compose up --build` and open **http://localhost:8081** instead.

To use a cookies file, put it at `cookies/youtube.txt` and set `YTDLP_COOKIES_FILE=/cookies/youtube.txt` in a project `.env` file before starting Compose. Leave it unset if you do not have cookies.

## Learn while editing

Node.js 24 and npm are needed for local development. Start PostgreSQL first:

```bash
docker compose up -d db
```

In one terminal, start the API:

```bash
cd server
npm ci
npm run dev
```

In a second terminal, start React:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173** for the live React preview. Vite sends `/videos` and `/download` requests to the API on port 8080. For local development, the server's default database URL is `postgresql://user:password@localhost:5432/app`.

If you run the API on a different port, start the Vite command with `API_PORT=8081 npm run dev` so its proxy uses that port.

The path through the code is:

1. [`frontend/src/App.tsx`](frontend/src/App.tsx) renders the page. `useState` holds form values and job results; event handlers respond to clicks.
2. [`frontend/src/api.ts`](frontend/src/api.ts) sends typed HTTP requests to the server.
3. [`server/src/app.ts`](server/src/app.ts) validates requests and defines API routes.
4. [`server/src/database.ts`](server/src/database.ts) reads and writes PostgreSQL jobs.
5. [`server/src/downloader.ts`](server/src/downloader.ts) starts yt-dlp as a child process and updates job status.

Try changing the heading in `App.tsx` while the Vite preview is open. Save the file and watch the browser update. That is React's development feedback loop; next, trace the `url` state from the input to `submit()`.

Build and test with `npm run build` in both folders and `npm test` in `server` while PostgreSQL is running. Docker builds the React assets into `app/static` and serves them on port 8080.
