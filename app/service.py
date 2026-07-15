import asyncio
import os

import yt_dlp
from sqlalchemy.exc import SQLAlchemyError

from app.database import AsyncSessionLocal
from app.db_tables import Video
from app.envpy import env
from app.log_conf import get_logger
from app.schemas import VideoStatus

logger = get_logger(__name__)


def get_cookies_file() -> str | None:
    if not env.YTDLP_COOKIES_FILE:
        return None

    if not os.path.isfile(env.YTDLP_COOKIES_FILE):
        raise FileNotFoundError("err")

    return env.YTDLP_COOKIES_FILE


def build_ydl_opts(
    *,
    download_path: str | None = None,
    video_id: int | None = None,
    height: str | None = None,
):
    ydl_opts = {
        "quiet": True,
        "noplaylist": True,
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/91.0.4472.124 Safari/537.36"
        ),
        "nocheckcertificate": True,
    }

    if download_path is not None and video_id is not None:
        ydl_opts["outtmpl"] = os.path.join(download_path, f"{video_id}.%(ext)s")

    if height is not None:
        ydl_opts["format"] = f"bestvideo[height={height}]+bestaudio/best"

    cookies_file = get_cookies_file()
    if cookies_file:
        ydl_opts["cookiefile"] = cookies_file

    return ydl_opts


def get_video_quality_options(url: str):
    try:
        with yt_dlp.YoutubeDL(build_ydl_opts()) as ydl:
            info_dict = ydl.extract_info(url, download=False)
        quality_options = []
        for stream in info_dict.get("formats", []):
            if "height" in stream and stream["height"]:
                quality_options.append(f"{stream['height']}p")
        return sorted(set(quality_options), key=lambda x: int(x[:-1]))
    except yt_dlp.utils.DownloadError as e:
        logger.error(f"Download Error while fetching quality for {url}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error while fetching quality for {url}: {e}")
    return []


async def download_and_process_video(video_id: int, url: str, selected_quality: str):
    async with AsyncSessionLocal() as db:

        async def mark_failed(message: str):
            await db.rollback()
            video = await db.get(Video, video_id)
            if video:
                video.status = VideoStatus.FAILED.value
                video.error_message = message[:500]
                await db.commit()

        try:
            video = await db.get(Video, video_id)
            if video:
                video.status = VideoStatus.DOWNLOADING.value
                video.error_message = None
                await db.commit()

            download_path = "./downloads"
            if not os.path.isabs(download_path):
                app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                download_path = os.path.join(app_dir, download_path)
            download_path = os.path.normpath(download_path)
            os.makedirs(download_path, exist_ok=True)
            height = selected_quality.replace("p", "")

            ydl_opts = build_ydl_opts(
                download_path=download_path,
                video_id=video_id,
                height=height,
            )

            loop = asyncio.get_event_loop()

            def download():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    return info.get("title"), info.get("duration")

            video_title, video_duration = await loop.run_in_executor(None, download)

            video = await db.get(Video, video_id)
            if video:
                video.status = VideoStatus.COMPLETED.value
                video.error_message = None
                if video_title:
                    video.title = video_title[:255]
                if video_duration is not None:
                    video.duration = int(video_duration)
                await db.commit()
                logger.info(f"processed video {video_id}")
            else:
                logger.error(f"video {video_id} not found in DB after download")

        except yt_dlp.utils.DownloadError as e:
            logger.error(f"Download Error for {video_id}: {e}")
            await mark_failed(str(e))
        except OSError as e:
            logger.error(f"filesystem error for video {video_id}: {e}")
            await mark_failed(str(e))
        except SQLAlchemyError as e:
            logger.error(f"Database error for video {video_id}: {e}")
            await db.rollback()
        except Exception as e:
            logger.error(f"Unexpected error for video {video_id}: {e}")
            await mark_failed(str(e))
