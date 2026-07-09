# Async Video Downloader

A simple async video downloader built with FastAPI, SQLAlchemy, and yt-dlp.

## Features

- Download videos from YouTube and other supported sites
- Select video quality (360p, 720p, 1080p)
- Async processing with background tasks
- PostgreSQL database for tracking download jobs
- Docker support for easy deployment

## Installation

### Using Docker

1. Set up environment variables `.env`:
```
DATABASE=postgresql+asyncpg://user:password@localhost:5432/app
```
2. Run the docker:
```bash
docker compose up --build
```

app available at `http://localhost:8080`
