from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .E2EE import crypto

from .database_configure import models
from .database_configure.database import engine
from .routers import auth, chat, forgotpassword, messages_ws, user, verification

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
app.include_router(chat.router)
app.include_router(crypto.router)
app.include_router(verification.router)
app.include_router(forgotpassword.router)
app.include_router(messages_ws.router)


@app.get("/")
def root():
    # Basic health-check endpoint.
    return 
