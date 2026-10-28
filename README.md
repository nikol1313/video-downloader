# Video Downloader

An asynchronous video downloader built with Node.js, Express, TypeScript, PostgreSQL. The React and TypeScript web interface starts downloads and tracks their progress. Prometheus collects application metrics.

![Video Downloader demo](docs/demo.gif)

## Features

- Download videos from YouTube and other sites supported by yt-dlp
- Select 360p, 720p, or 1080p video, or audio only as MP3
- Watch download progress live
- Process downloads in the background with yt-dlp child processes, two at a time
- Store download jobs in PostgreSQL
- Start downloads, watch their status, and save files from a one-page React interface
- Expose Prometheus metrics at `/metrics`
- Run the app with Docker Compose

## Why i didnt host it:

This app is meant to run locally and is intentionally not hosted. Downloading from YouTube and many other sites is against their terms of service, and a public instance would let anyone use the server to download any content, including copyrighted material. Video sites also block downloads from cloud servers. The demo above shows the app running locally.

## Installation

### Using Docker

Build and start the application:

```bash
docker compose up --build
```

Open **http://localhost:8080**

Stop the application with Ctrl+C.
