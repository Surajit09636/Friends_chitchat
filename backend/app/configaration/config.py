from pydantic_settings import BaseSettings, SettingsConfigDict

from .env_loader import ENVIRONMENT


class Settings(BaseSettings):
    environment: str = ENVIRONMENT
    database_url: str | None = None
    # JWT signing configuration.
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    # SMTP settings for email verification.
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    smtp_from_email: str
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(extra="ignore")


# Singleton settings instance used across the app.
settings = Settings()
