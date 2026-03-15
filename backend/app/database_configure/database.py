import os

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from ..configaration.env_loader import ENVIRONMENT

# SQLAlchemy database URL from environment variables.
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        f"DATABASE_URL is not set for ENVIRONMENT='{ENVIRONMENT}'. "
        "Set it in backend/.env.dev (development) or backend/.env.prod "
        "(production), or via hosting platform environment variables."
    )

# Engine and session factory for DB access.
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base class for ORM models.
Base = declarative_base()


def get_db():
    # Dependency that yields a DB session and guarantees cleanup.
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
