from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database connection settings.
    database_hostname: str
    database_port: str
    database_password: str
    database_name: str
    database_username: str
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

    class Config:
        # Load environment variables from the backend .env file.
        env_file = ".env"


# Singleton settings instance used across the app.
settings = Settings()
