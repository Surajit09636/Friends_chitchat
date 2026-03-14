# Friend's Chitchat

Secure full-stack chat application built with React and FastAPI, featuring account verification, password recovery, JWT auth, realtime messaging, and browser-side end-to-end encryption (E2EE).

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Feature Set](#feature-set)
- [Security Model](#security-model)
- [API Reference](#api-reference)
- [Frontend Routes](#frontend-routes)
- [Environment Configuration](#environment-configuration)
- [Database Setup and Structure](#database-setup-and-structure)
- [Local Development Setup](#local-development-setup)
- [Project Structure](#project-structure)
- [Known Constraints](#known-constraints)

## Overview

Friend's Chitchat is a chat system where message encryption and decryption happen in the browser. The backend stores encrypted payloads, manages authentication, user relationships, and email-based account flows.

## Architecture

### Backend

- Framework: FastAPI
- ORM: SQLAlchemy
- Database: PostgreSQL
- Authentication: JWT (`python-jose`)
- Password hashing: `passlib` + `bcrypt`
- Email delivery: SMTP (`smtplib`)
- Realtime transport: WebSocket (`/ws/messages`)

### Frontend

- Framework: React (Create React App)
- Routing: React Router
- HTTP client: Axios
- Crypto: Web Crypto API (ECDH + AES-GCM + PBKDF2)

## Feature Set

### Account and Authentication

- User signup with `name`, `username`, `email`, and `password`
- Login using either email or username
- Case-insensitive email normalization to prevent duplicate accounts
- Unique username enforcement
- Email verification required before successful login
- Password reset with one-time code and expiration
- JWT access tokens with configurable expiration
- Protected backend routes via bearer token dependency
- Protected frontend route (`/home`) with token expiry checks
- Automatic client logout/redirect on unauthorized (`401`) API responses

### End-to-End Encryption (E2EE)

- Browser generates ECDH P-256 identity key pair
- Private key is encrypted locally using password-derived AES-GCM key
- Key derivation uses PBKDF2-SHA256 with per-user random salt
- Server stores only encrypted private key bundle and public key
- Shared conversation keys are derived per friend with ECDH
- Messages are encrypted/decrypted client-side before send/after receive
- Shared keys are cached in-memory per session for performance

### Chat and Contacts

- Search users by name, username, or email
- Add users as friends to start chats
- List all friends
- List chat threads with last-message metadata
- Load full message history for a selected friend chat
- Send encrypted messages (WebSocket primary path)
- HTTP message send fallback endpoint available
- Edit previously sent messages (sender only)
- Delete message for yourself (`scope=me`)
- Delete message for everyone (`scope=everyone`, sender only)
- Delete/clear entire conversation from your own account
- Soft-delete visibility flags per participant

### Realtime Messaging

- WebSocket authentication using JWT query token
- Multi-connection fan-out per user
- Live event stream includes new messages, edits, deletes, and conversation clears
- Frontend socket state indicator (`connecting`, `connected`, `disconnected`, `error`)

### Frontend UX

- Public landing page
- Signup, login, email verification, and forgot-password flows
- Secure chat unlock screen (password required to decrypt private key)
- Searchable chat list and searchable user list
- Context menu actions for message edit/delete and chat delete
- Light/dark theme toggle persisted in local storage
- Toast/status messaging for auth and recovery flows

## Security Model

- Passwords are hashed server-side with bcrypt before storage
- JWTs are verified on protected routes and WebSocket handshakes
- Email verification and reset codes are time-limited
- Email input is normalized (`trim + lowercase`) before lookup/storage
- Private encryption keys are never stored in plaintext on the backend
- Chat payload persistence is encrypted (`ciphertext` + `iv`) rather than plaintext

## API Reference

### Public Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Basic API reachability endpoint |
| `POST` | `/signup` | Register new user |
| `POST` | `/login` | Login with email/username + password |
| `POST` | `/verification/request` | Send/resend verification code |
| `POST` | `/verification/confirm` | Confirm email with code |
| `POST` | `/password/forgot` | Request password reset code |
| `POST` | `/password/reset` | Reset password using code |

### Authenticated REST Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/me` | Get current user profile |
| `GET` | `/users/search?q=...` | Search users (min query length 2) |
| `POST` | `/friends/{friend_id}` | Add friend |
| `GET` | `/friends` | List friends |
| `GET` | `/chats` | List chat threads with last message metadata |
| `GET` | `/chats/{friend_id}/messages` | List visible messages for chat |
| `POST` | `/chats/{friend_id}/messages` | Send encrypted message (HTTP fallback) |
| `PATCH` | `/chats/{friend_id}/messages/{message_id}` | Edit own encrypted message |
| `DELETE` | `/chats/{friend_id}/messages/{message_id}?scope=me` | Delete one message for current user |
| `DELETE` | `/chats/{friend_id}/messages/{message_id}?scope=everyone` | Delete one message for both users |
| `DELETE` | `/chats/{friend_id}` | Clear full conversation for current user |
| `GET` | `/crypto/profile` | Fetch encrypted key bundle |
| `POST` | `/crypto/profile` | Create/update encrypted key bundle |

### WebSocket Endpoint

| Protocol | Endpoint | Purpose |
| --- | --- | --- |
| `WS` | `/ws/messages?token=<jwt>` | Realtime encrypted message transport |

## Frontend Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page |
| `/login` | Public | Login |
| `/signup` | Public | Registration |
| `/verify-email` | Public | Verification code flow |
| `/forgot-password` | Public | Password reset flow |
| `/home` | Protected | Main chat UI |
| `*` | Public | Redirects to `/` |

## Environment Configuration

Create `backend/.env` with:

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

Notes:

- If `access_token_expire_minutes` is set to a positive value, `exp` is added to JWTs.
- Backend auto-creates database tables on startup for development.
- Backend also backfills newer `chatting` columns (`edited_at`, delete flags) if missing.

Frontend API defaults:

- HTTP API base URL: `http://127.0.0.1:8000` (see `frontend/src/api/axios.js`)
- WebSocket base URL: `ws://127.0.0.1:8000` (override with `REACT_APP_WS_BASE_URL`)

## Database Setup and Structure

### PostgreSQL Setup (Local)

Create a database user and database (replace values as needed):

```sql
CREATE USER chatapp WITH PASSWORD 'yourpassword';
CREATE DATABASE chatapp OWNER chatapp;
GRANT ALL PRIVILEGES ON DATABASE chatapp TO chatapp;
```

Set matching values in `backend/.env`:

```ini
database_hostname=localhost
database_port=5432
database_name=chatapp
database_username=chatapp
database_password=yourpassword
```

Start the backend once to auto-create tables:

```bash
cd backend
uvicorn app.main:app --reload
```

### Schema Structure

The backend uses SQLAlchemy models and creates these tables:

| Table | Purpose | Primary Key | Key Relationships |
| --- | --- | --- | --- |
| `users` | User account and crypto profile data | `id` | Referenced by `verified_users.owner_id`, `password_resets.owner_id`, `friends.owner_id`, `friends.friend_id`, `chatting.sender_id`, `chatting.receiver_id` |
| `verified_users` | Email verification state/code per user | `id` | `owner_id -> users.id` (`CASCADE`, unique one-to-one) |
| `password_resets` | Password reset code lifecycle per user | `id` | `owner_id -> users.id` (`CASCADE`, unique one-to-one) |
| `friends` | User-to-user contact mapping | `id` | `owner_id -> users.id`, `friend_id -> users.id`, unique pair on (`owner_id`, `friend_id`) |
| `chatting` | Encrypted message storage | `id` | `sender_id -> users.id`, `receiver_id -> users.id` |

### Chat Table Fields

`chatting` contains encryption and message-lifecycle fields:

- `ciphertext`, `iv`: encrypted payload
- `crypto_version`: crypto format/version marker
- `is_deleted_for_everyone`: delete-for-all state
- `deleted_for_sender`, `deleted_for_receiver`: per-user soft delete flags
- `edited_at`: timestamp when a message is edited
- `created_at`: message creation timestamp

### Migration Behavior

- Development startup runs `Base.metadata.create_all(...)` to create missing tables.
- Startup also runs defensive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for newer `chatting` columns to keep older local DBs compatible.
- For production environments, move schema changes to Alembic migration scripts.

## Local Development Setup

### Prerequisites

- Node.js + npm
- Python 3.x + pip
- PostgreSQL
- SMTP credentials for email flows

### Start Backend

```bash
cd backend
python -m venv .venv
# Activate the virtual environment in your shell
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Start Frontend

```bash
cd frontend
npm install
npm start
```

App URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`

## Project Structure

```text
backend/
  app/
    authentication/        # JWT + password utilities
    configaration/         # Environment settings
    database_configure/    # SQLAlchemy engine + models
    E2EE/                  # Crypto profile API
    routers/               # Auth, users, chat, verification, reset, websocket
    schema/                # Pydantic schemas
    Websocket_configure/   # Connection manager runtime
  requirements.txt

frontend/
  src/
    api/                   # Axios + endpoint wrappers + websocket helper
    auth/                  # Auth context
    crypto/                # Crypto context + browser crypto service
    pages/                 # UI routes
    components/            # Shared UI components
    styles/                # CSS
```

## Known Constraints

- WebSocket connection manager is in-memory and process-local.
- For multi-instance or multi-worker deployments, add a shared pub/sub layer (for example Redis) for cross-instance realtime fan-out.
