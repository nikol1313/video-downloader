from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Quality(str, Enum):
    LOW = "360p"
    NORMAL = "720p"
    HIGH = "1080p"


class VideoStatus(str, Enum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"


class VideoBase(BaseModel):
    url: HttpUrl
    quality: Quality = Field(default=Quality.NORMAL, description="Requested video quality")
    status: VideoStatus = Field(default=VideoStatus.QUEUED, description="Download job status")
    title: str = Field(min_length=1, max_length=255)
    duration: int | None = Field(default=None, description="Video length in seconds")
    error_message: str | None = Field(default=None, max_length=500)


class VideoCreate(VideoBase):
    pass


class VideoSchema(VideoBase):
    id: int
    created_at: datetime = Field(default_factory=datetime.now)
    model_config = ConfigDict(from_attributes=True)
