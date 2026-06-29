from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ENVIRONMENT: Literal["dev", "staging", "prod"] = "dev"
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    SEED_ADMIN_EMAIL: str = "admin@gstitc.com"
    SEED_ADMIN_PASSWORD: str = "adminpassword123"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
