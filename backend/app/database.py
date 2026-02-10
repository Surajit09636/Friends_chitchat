from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

# SQLAlchemy database URL built from environment settings.
SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.database_username}:{settings.database_password}@{settings.database_hostname}:{settings.database_port}/{settings.database_name}"

# Engine and session factory for DB access.
engine = create_engine(SQLALCHEMY_DATABASE_URL)
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
