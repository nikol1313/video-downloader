import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_read_root():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_list_videos():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/videos")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_nonexistent_video():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/videos/99999")
    assert response.status_code == 404
