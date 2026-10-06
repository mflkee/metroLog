from functools import cached_property
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

CONFIG_FILE_PATH = Path(__file__).resolve()
BACKEND_ROOT = CONFIG_FILE_PATH.parents[2]
PROJECT_ROOT = CONFIG_FILE_PATH.parents[3]


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
    notification_queue_enabled: bool = False
    notification_queue_name: str = "notifications"
    notification_queue_job_timeout_seconds: int = 120
    notification_queue_result_ttl_seconds: int = 300
    notification_queue_failure_ttl_seconds: int = 86400
    upload_max_file_size_bytes: int = 25_000_000
    attachment_image_target_size_bytes: int = 2_000_000
    attachment_image_max_dimension_pixels: int = 2560
    arshin_api_base_url: str = "https://fgis.gost.ru/fundmetrology/eapi"
    arshin_public_results_base_url: str = "https://fgis.gost.ru/fundmetrology/cm/results/"
    arshin_public_etalons_base_url: str = "https://fgis.gost.ru/fundmetrology/cm/etalons/"
    arshin_api_timeout_seconds: float = 30.0
    arshin_api_max_retries: int = 5
    arshin_api_retry_base_seconds: float = 2.0
    arshin_api_retry_max_seconds: float = 45.0
    folder_refresh_max_attempts: int = 4
    folder_refresh_retry_base_seconds: float = 5.0
    folder_refresh_retry_max_seconds: float = 60.0
    attachment_storage_dir: str = "storage/equipment-attachments"
    mention_notifications_enabled: bool = False
    smtp_host: str | None = None
    smtp_port: int = 465
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "metroLog Robot"
    backend_cors_origins_raw: str = Field(
        default="http://localhost:5173",
        alias="BACKEND_CORS_ORIGINS",
    )

    model_config = SettingsConfigDict(
        env_file=(
            str(PROJECT_ROOT / ".env"),
            str(BACKEND_ROOT / ".env"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @cached_property
    def backend_cors_origins(self) -> list[str]:
        return [
            origin.strip() for origin in self.backend_cors_origins_raw.split(",") if origin.strip()
        ]

    @cached_property
    def attachment_storage_path(self) -> Path:
        return Path(self.attachment_storage_dir).expanduser().resolve()


settings = Settings()
