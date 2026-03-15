import os

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from ..configaration.env_loader import ENVIRONMENT

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        f"DATABASE_URL is not set for ENVIRONMENT='{ENVIRONMENT}'. "
        "Set it in backend/.env.dev (development) or backend/.env.prod "
        "(production), or via hosting platform environment variables."
    )

engine = create_engine(
    DATABASE_URL,
    connect_args={"sslmode": "require"}  # Required for Supabase
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()