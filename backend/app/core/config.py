from functools import cached_property
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "metroLog API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me"
    access_token_ttl_hours: int = 12
    bootstrap_admin_first_name: str = "Bootstrap"
    bootstrap_admin_last_name: str = "Administrator"
    bootstrap_admin_patronymic: str = ""
    bootstrap_admin_email: str = "admin@metrolog.local"
    bootstrap_admin_password: str = "ChangeMe123"
    frontend_app_url: str = "http://localhost:5173"
    database_url: str = "postgresql+psycopg://metrolog:metrolog@127.0.0.1:5432/metrolog"
    redis_url: str = "redis://127.0.0.1:6379/0"
    arshin_api_base_url: str = "https://fgis.gost.ru/fundmetrology/eapi"
    arshin_public_results_base_url: str = "https://fgis.gost.ru/fundmetrology/cm/results/"
    arshin_api_timeout_seconds: float = 30.0
    attachment_storage_dir: str = "storage/equipment-attachments"
    backend_cors_origins_raw: str = Field(
        default="http://localhost:5173",
        alias="BACKEND_CORS_ORIGINS",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @cached_property
    def backend_cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.backend_cors_origins_raw.split(",")
            if origin.strip()
        ]

    @cached_property
    def attachment_storage_path(self) -> Path:
        return Path(self.attachment_storage_dir).expanduser().resolve()


settings = Settings()
