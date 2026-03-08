# Friend's Chitchat

Full-stack authentication starter for a chat app. React frontend + FastAPI backend with PostgreSQL, JWT auth, and email verification.

**Features**
- Signup and login with email or username: Create accounts and authenticate using either an email address or a username.
- Case-insensitive email uniqueness enforcement: Emails are normalized so duplicates like `User@x.com` and `user@x.com` are rejected.
- Email verification flow with one-time codes: New users receive a one-time code to confirm ownership of their email.
- Password reset flow with one-time codes: Users can request a reset code and set a new password without exposing the old one.
- JWT-protected routes and client-side token checks: The API enforces JWT auth on protected endpoints and the client guards routes based on token presence.
- FastAPI REST API with SQLAlchemy models: Backend endpoints are built with FastAPI and data models use SQLAlchemy ORM.
- React SPA with guarded home page: The frontend is a single-page app and the home page is only accessible after login.

**Tech Stack**
- Frontend: React (Create React App), React Router, Axios
- Backend: FastAPI, SQLAlchemy, PostgreSQL, JWT (python-jose), Passlib bcrypt
- Email: SMTP for verification + reset codes

**Project Structure**
- `frontend/` React app
- `backend/` FastAPI app
- `backend/app/` API code
- `backend/app/routers/` route handlers
- `backend/requirements.txt` Python dependencies

**Prerequisites**
- Node.js and npm
- Python 3.x and pip
- PostgreSQL
- SMTP credentials for sending verification emails

**Configuration**
The backend reads settings from `backend/.env`. Example values:

```ini
database_hostname=localhost
database_port=5432
database_name=chatapp
database_username=chatapp
database_password=yourpassword
secret_key=change-me
algorithm=HS256
access_token_expire_minutes=60
smtp_host=smtp.example.com
smtp_port=587
smtp_user=youruser
smtp_password=yourpassword
smtp_from_email=no-reply@example.com
smtp_use_tls=true
```

The frontend is configured to call the API at `http://127.0.0.1:8000`. If you run the backend on a different host or port, update `frontend/src/api/axios.js`.

**Run The Backend**
1. Create and activate a virtual environment.
2. Install dependencies.
3. Start the API server.

```bash
cd backend
python -m venv .venv
# Activate your virtual environment in your shell.
pip install -r requirements.txt
uvicorn app.main:app --reload
```

On startup the app creates database tables automatically for development.

**Run The Frontend**
```bash
cd frontend
npm install
npm start
```

**API Endpoints**
- `POST /signup` Register a new user.
- `POST /login` Log in with email or username and receive a JWT.
- `GET /me` Return the authenticated user profile.
- `GET /users/search?q=...` Search users by name, username, or email (min 2 chars).
- `POST /verification/request` Send an email verification code.
- `POST /verification/confirm` Confirm email verification with a code.
- `POST /password/forgot` Send a password reset code.
- `POST /password/reset` Confirm reset code and update the password.
- `POST /friends/{friend_id}` Add a user as a friend.
- `GET /friends` List your friends.
- `GET /chats` List chat threads with last message metadata.
- `GET /chats/{friend_id}/messages` List message history with a friend.
- `POST /chats/{friend_id}/messages` Send an encrypted message (HTTP fallback).
- `GET /crypto/profile` Get the current user's E2EE key bundle.
- `POST /crypto/profile` Create/update the current user's E2EE key bundle.
- `WS /ws/messages` WebSocket for realtime encrypted messaging.
- `GET /` Basic health check.

**Frontend Routes**
- `/` Public landing page.
- `/login` Login page.
- `/signup` Signup page.
- `/forgot-password` Password reset flow.
- `/verify-email` Email verification flow.
- `/home` Protected app home.
- `*` Any unknown route redirects to `/`.

**Auth Flow**
1. Sign up with name, username, email, and password.
2. Request or resend a verification code by email.
3. Verify the email address with the code.
4. Log in to access the protected home page.

**Notes**
- Emails are normalized (trimmed + lowercased) and must be unique. Attempts to reuse the same email will return a `409` response.

**Password Reset Flow**
1. Request a reset code with your email.
2. Submit the reset code and new password.
3. Log in with your updated password.
