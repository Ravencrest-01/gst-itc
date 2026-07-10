import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "ITC-Rec Engine"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173", "*"]
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/itc_rec_engine")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey_change_me_in_production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
