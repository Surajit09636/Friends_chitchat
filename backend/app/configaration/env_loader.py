import os
from pathlib import Path

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _normalize_environment(value: str | None) -> str:
    if not value:
        return "development"
    normalized = value.strip().lower()
    return normalized or "development"


def _env_filename_for(environment: str) -> str:
    return ".env.prod" if environment == "production" else ".env.dev"


def load_app_environment() -> tuple[str, Path]:
    environment = _normalize_environment(os.getenv("ENVIRONMENT"))
    env_path = BACKEND_ROOT / _env_filename_for(environment)
    if env_path.exists():
        # Keep hosting-platform environment variables as highest priority.
        load_dotenv(dotenv_path=env_path, override=False)
    return environment, env_path


ENVIRONMENT, ENV_FILE_PATH = load_app_environment()
