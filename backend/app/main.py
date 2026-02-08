from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .database import engine
from .routers import auth, user

# Create DB tables on startup (use Alembic for production migrations).
models.Base.metadata.create_all(bind=engine)

# FastAPI application instance.
app = FastAPI()

# Allow the React dev server to call the API.
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# CORS middleware for frontend requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules.
app.include_router(auth.router)
app.include_router(user.router)


@app.get("/")
def root():
    # Basic health-check endpoint.
    return {"message": "Hello World"}
