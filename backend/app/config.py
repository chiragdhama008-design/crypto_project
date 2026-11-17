"""
ChainGuard Configuration Engine.
Loads environment variables, validates Supabase credentials, and configures runtime settings.
"""

import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # App Information
    APP_NAME: str = "ChainGuard Forensic Intelligence Platform"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = Field(default=False, env="DEBUG")

    # Optional Admin Key (if set in hosted deployments, required via X-Admin-Key for /api/ml/train and /api/dataset/ingest)
    ADMIN_API_KEY: str = Field(default="", env="ADMIN_API_KEY")

    # Supabase PostgreSQL
    SUPABASE_URL: str = Field(default="", env="SUPABASE_URL")
    SUPABASE_ANON_KEY: str = Field(default="", env="SUPABASE_ANON_KEY")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="", env="SUPABASE_SERVICE_ROLE_KEY")
    DATABASE_URL: str = Field(default="", env="DATABASE_URL")

    # Dataset directory
    DATASET_PATH: str = Field(
        default="data/elliptic_bitcoin_dataset",
        env="DATASET_PATH"
    )

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"

    # ML Model Settings
    MODEL_CACHE_DIR: str = "models"
    ACTIVE_MODEL: str = "gradient_boosting"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def has_supabase_db(self) -> bool:
        return bool(self.DATABASE_URL and self.DATABASE_URL.startswith("postgres"))

    @property
    def has_supabase_api(self) -> bool:
        return bool(self.SUPABASE_URL and (self.SUPABASE_SERVICE_ROLE_KEY or self.SUPABASE_ANON_KEY))

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
