# Async Video Downloader

An asynchronous video downloader built with FastAPI, SQLAlchemy, PostgreSQL, and yt-dlp. The project includes a simple web interface for starting downloads and tracking their progress.

## Features

* Download videos from YouTube and other supported sites
* Select video quality (360p, 720p, 1080p)
* Asynchronous processing with FastAPI background tasks
* PostgreSQL database for tracking download jobs
* Simple frontend for submitting download requests and monitoring status
* Docker support for easy deployment

## Installation

### Using Docker

1. Create a `.env` file:

```env
DATABASE=postgresql+asyncpg://user:password@db:5432/app
```
and also put this url in alembic.ini `sqlalchemy.url =`

2. Build and start the application:

```bash
docker compose up --build
```

The application will be available at **http://localhost:8080**.

## AI

This project was developed by me, with AI used as a development aid. Specifically:

* The simple static index.html was generated with AI and then integrated into the application.
* AI was used to assist with debugging, troubleshooting during development.

All backend architecture, API design, database integration, Docker configuration, and application logic were implemented by me.
