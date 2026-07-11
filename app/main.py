import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession


from app.schemas import VideoCreate, VideoSchema, Quality
from app.db_crud import create_video, get_video
from app.service import download_and_process_video
from app.database import get_db, engine
from app.db_tables import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    max_retries = 3
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"Database connection failed (attempt {attempt + 1}/{max_retries})")
            await asyncio.sleep(retry_delay)
    yield


app = FastAPI(lifespan=lifespan)


STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.post("/videos", response_model=VideoSchema)
async def start_video_download(
        url: str,
        quality: Quality,
        background_tasks: BackgroundTasks,
        db: AsyncSession = Depends(get_db)
):
    initial_video_data = VideoCreate(
        url=url,
        status=quality.value,
        title="Downloading...",
        file_path="pending"
    )
    db_video = await create_video(db, initial_video_data)
    if not db_video:
        raise HTTPException(status_code=500, detail="Failed to initiate job.")

    background_tasks.add_task(
        download_and_process_video,
        video_id=db_video.id,
        url=url,
        selected_quality=quality.value
    )

    return db_video


@app.get("/videos/{job_id}", response_model=VideoSchema)
async def get_job_status(job_id: int, db: AsyncSession = Depends(get_db)):
    video = await get_video(db, video_id=job_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video job not found.")
    return video

@app.get("/download/{job_id}")
async def download_video_file(job_id: int, db: AsyncSession = Depends(get_db)):
    video = await get_video(db, video_id=job_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video job not found.")
    if video.file_path == "pending":
        raise HTTPException(status_code=400, detail="Video is still processing or the download failed. Check GET /videos/{job_id}.")
    if not os.path.exists(video.file_path):
        raise HTTPException(status_code=404, detail=f"File not found on disk: {video.file_path}")
    return FileResponse(
        path=video.file_path,
        filename=os.path.basename(video.file_path),
        media_type="video/mp4"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
