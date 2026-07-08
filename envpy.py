from pydantic_settings import BaseSettings, SettingsConfigDict

class ENV(BaseSettings):
    DATABASE: str

    model_config = SettingsConfigDict(env_file=".env")

env = ENV()