from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "Level Valley Farms Accounting"
    APP_VERSION: str = "1.0.0"
    DATABASE_URL: str = "sqlite+aiosqlite:///./level_valley.db"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    GOOGLE_MAPS_API_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
