from collections.abc import AsyncIterator
from datetime import datetime
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app import main
from app.database import get_db
from app.schemas import Quality, VideoStatus


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async def override_get_db():
        yield object()

    main.app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    main.app.dependency_overrides.clear()


def make_video(
    *,
    video_id: int = 1,
    status: VideoStatus = VideoStatus.QUEUED,
    title: str = "Example video",
    quality: Quality = Quality.NORMAL,
):
    return SimpleNamespace(
        id=video_id,
        url="https://example.com/watch?v=abc",
        quality=quality.value,
        status=status.value,
        title=title,
        duration=None,
        error_message=None,
        created_at=datetime(2026, 1, 1, 12, 0, 0),
    )


@pytest.mark.asyncio
async def test_read_root_serves_index(client: AsyncClient):
    response = await client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


@pytest.mark.asyncio
async def test_start_video_download_creates_job_and_schedules_background_task(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    created_payloads = []
    scheduled_tasks = []

    async def fake_create_video(db, video):
        created_payloads.append(video)
        return make_video(video_id=42, status=video.status, title=video.title, quality=video.quality)

    async def fake_download_and_process_video(**kwargs):
        scheduled_tasks.append(kwargs)

    monkeypatch.setattr(main, "create_video", fake_create_video)
    monkeypatch.setattr(main, "download_and_process_video", fake_download_and_process_video)

    response = await client.post(
        "/videos",
        params={"url": "https://example.com/watch?v=abc", "quality": "720p"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": 42,
        "url": "https://example.com/watch?v=abc",
        "quality": "720p",
        "status": "queued",
        "title": "Downloading...",
        "duration": None,
        "error_message": None,
        "created_at": "2026-01-01T12:00:00",
    }
    assert len(created_payloads) == 1
    assert created_payloads[0].status == VideoStatus.QUEUED
    assert created_payloads[0].title == "Downloading..."
    assert scheduled_tasks == [
        {
            "video_id": 42,
            "url": "https://example.com/watch?v=abc",
            "selected_quality": "720p",
        }
    ]


@pytest.mark.asyncio
async def test_start_video_download_returns_500_when_job_creation_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_create_video(db, video):
        return None

    monkeypatch.setattr(main, "create_video", fake_create_video)

    response = await client.post(
        "/videos",
        params={"url": "https://example.com/watch?v=abc", "quality": "720p"},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to initiate job."}


@pytest.mark.asyncio
async def test_list_video_jobs_passes_pagination_to_crud(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    calls = []

    async def fake_get_videos(db, skip: int, limit: int):
        calls.append({"skip": skip, "limit": limit})
        return [make_video(video_id=2, status=VideoStatus.COMPLETED)]

    monkeypatch.setattr(main, "get_videos", fake_get_videos)

    response = await client.get("/videos", params={"skip": 5, "limit": 25})

    assert response.status_code == 200
    assert response.json()[0]["id"] == 2
    assert calls == [{"skip": 5, "limit": 25}]


@pytest.mark.asyncio
async def test_get_job_status_returns_404_for_missing_video(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_get_video(db, video_id: int):
        return None

    monkeypatch.setattr(main, "get_video", fake_get_video)

    response = await client.get("/videos/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Video job not found."}


@pytest.mark.asyncio
async def test_download_video_file_rejects_unfinished_job(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_get_video(db, video_id: int):
        return make_video(video_id=video_id, status=VideoStatus.DOWNLOADING)

    monkeypatch.setattr(main, "get_video", fake_get_video)

    response = await client.get("/download/7")

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Video is still processing or the download failed. Check GET /videos/{job_id}."
    }


@pytest.mark.asyncio
async def test_download_video_file_returns_file_for_completed_job(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, tmp_path
):
    fake_app_dir = tmp_path / "app"
    fake_app_dir.mkdir()
    downloads_dir = tmp_path / "downloads"
    downloads_dir.mkdir()
    video_file = downloads_dir / "7.mp4"
    video_file.write_bytes(b"video bytes")

    async def fake_get_video(db, video_id: int):
        return make_video(video_id=video_id, status=VideoStatus.COMPLETED)

    monkeypatch.setattr(main, "get_video", fake_get_video)
    monkeypatch.setattr(main, "__file__", str(fake_app_dir / "main.py"))

    response = await client.get("/download/7")

    assert response.status_code == 200
    assert response.content == b"video bytes"
    assert response.headers["content-disposition"] == 'attachment; filename="7.mp4"'
