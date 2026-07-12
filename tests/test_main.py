from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.responses import FileResponse
from httpx import ASGITransport, AsyncClient

STATIC_DIR = Path(__file__).resolve().parent.parent / "app" / "static"
app = FastAPI()


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@pytest.mark.asyncio
async def test_read_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
