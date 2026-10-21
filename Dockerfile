FROM node:24-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-alpine AS server-build
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:24-alpine
RUN apk add --no-cache ffmpeg python3 py3-pip && python3 -m venv /opt/yt-dlp && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp==2026.8.19
ENV PATH="/opt/yt-dlp/bin:$PATH"
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY --from=server-build /build/server/dist ./server/dist
COPY --from=frontend-build /build/server/public ./server/public
RUN mkdir -p downloads
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
