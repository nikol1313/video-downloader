from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class ENV(BaseSettings):
    DATABASE: str = "postgresql+asyncpg://user:password@db:5432/app"
    DATABASE_URL: str | None = None

    @property
    def database_url(self) -> str:
        return self.DATABASE_URL or self.DATABASE

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )


env = ENV()
