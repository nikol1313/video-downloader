from datetime import datetime
from sqlalchemy.orm import Mapped , mapped_column , DeclarativeBase
from sqlalchemy import Integer, String, func, DateTime, CheckConstraint, Index

class Base(DeclarativeBase):
    pass

class Video(Base):
    __tablename__ = "videos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    url: Mapped[str] = mapped_column(String , nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    file_path: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
         CheckConstraint("status IN ('360p', '720p', '1080p')", name="check_status_values"),
         Index("idx_status_created", "status", "created_at")
                     )

    def __repr__(self):
        return f"<Video(id={self.id}, title={self.title}>"
