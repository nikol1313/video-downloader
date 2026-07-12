from sqlalchemy import desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import SQLAlchemyError
from app.db_tables import Video
from app.schemas import VideoCreate

async def create_video(db: AsyncSession, video: VideoCreate) -> Video | None:
    try:
        db_video = Video(**video.model_dump(mode="json"))
        db.add(db_video)
        await db.commit()
        await db.refresh(db_video)
        return db_video
    except SQLAlchemyError:
        await db.rollback()
        raise

async def get_video(db: AsyncSession, video_id: int) -> Video | None:
    try:
        result = await db.execute(select(Video).filter(Video.id == video_id))
        return result.scalar_one_or_none()
    except SQLAlchemyError:
        return None

async def get_videos(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 10) -> list[Video]:
        try:
            videos = await db.execute(select(Video).offset(skip).limit(limit).order_by(desc(Video.created_at)))
            return list(videos.scalars().all())
        except SQLAlchemyError:
            return []

async def delete_video(db: AsyncSession, video_id: int) -> bool:
    try:
        video = await get_video(db, video_id)
        if video:
            await db.delete(video)
            await db.commit()
            return True
        return False
    except SQLAlchemyError:
        await db.rollback()
        return False
