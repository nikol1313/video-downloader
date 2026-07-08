from pydantic import HttpUrl , BaseModel , ConfigDict , Field , model_validator
from typing import Optional
from enum import Enum
from datetime import datetime
import os

class Quality(str, Enum):
    LOW = "360p"
    NORMAL = "720p"
    HIGH = "1080p"

class VideoBase(BaseModel):
    url: HttpUrl
    status: Quality = Field(default=Quality.NORMAL, description="Quality of Video")
    title: str = Field(min_length=1 , max_length=255)

class VideoCreate(VideoBase):
    file_path: Optional[str]

    @model_validator(mode='after')
    def validate_path(self) -> 'VideoCreate':
        if self.file_path and not  os.path.exists(self.file_path):
            raise ValueError("Path not found on disk")
        return self

class VideoSchema(VideoBase):
    id: int
    created_at: datetime = Field(default_factory=datetime.now())

    model_config = ConfigDict(from_attributes=True)