import os
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from schemas import VideoCreate, VideoSchema, Quality
from db_crud import create_video, get_video
from service import download_and_process_video
from database import get_db

app = FastAPI()


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
        selected_quality=quality.value,
        download_path="./downloads"
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

    if video.file_path == "pending" or not os.path.exists(video.file_path):
        raise HTTPException(status_code=400, detail="Video is still processing or file missing.")
    return FileResponse(
        path=video.file_path,
        filename=os.path.basename(video.file_path),
        media_type="video/mp4"
    )