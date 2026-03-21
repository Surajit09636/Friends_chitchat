# Friend's Chitchat

Friend's Chitchat is a full-stack encrypted chat application built with React and FastAPI.

It includes email-verified authentication, JWT-protected APIs, realtime WebSocket messaging, friend request workflows, per-message lifecycle controls (edit/delete), and browser-side end-to-end encryption (E2EE) using the Web Crypto API. The backend stores only encrypted chat payloads and encrypted private-key bundles.

This repository also contains an in-progress `backend/Max` workspace for small GPT training experiments.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation and Setup](#installation-and-setup)
- [API Endpoints](#api-endpoints)
- [Usage Instructions](#usage-instructions)
- [Folder Structure](#folder-structure)
- [Recent Updates / Changelog](#recent-updates--changelog)
- [Current Constraints](#current-constraints)

## Features

### Authentication and Accounts

- Signup with `name`, `username`, `email`, and password
- Login with email or username
- Duplicate protection for email and username
- Email verification flow before login is allowed
- Password reset flow with expiring one-time code
- JWT-based authentication for protected REST endpoints and WebSocket sessions
- Frontend token-expiry and unauthorized-session handling (`401` auto-redirect)

### End-to-End Encryption (E2EE)

- Browser generates ECDH P-256 identity key pair
- Private key is encrypted locally with password-derived AES-GCM key (PBKDF2-SHA256)
- Server stores encrypted private key bundle + public key only
- Shared conversation key is derived per friend via ECDH
- Message encryption/decryption happens in the browser
- Last-message preview and full chat history are decrypted client-side

### Friend Graph and Requests

- User search by name, username, or email
- Relationship state in search results (`none`, `friend`, `incoming_request`, `outgoing_request`)
- Friend requests: send, list pending, accept, decline
- Real-time friend-request notifications over WebSocket
- Remove friend (both directions), with request cleanup and realtime sync

### Messaging and Chat Lifecycle

- Realtime message send/receive over WebSocket (`/ws/messages`)
- Chat thread listing with latest message metadata
- Message history fetch per friend
- Edit own messages
- Delete message for me (`scope=me`)
- Delete message for everyone (`scope=everyone`, sender only)
- Clear entire conversation from current account
- Soft-delete visibility flags per participant

### Frontend UX

- Landing page, signup, login, verify-email, forgot-password flows
- Protected `/home` route
- Encryption unlock gate (password required to decrypt private key)
- Notification panel for incoming friend requests and status alerts
- Right-click context menu actions for messages and chat threads
- Light/dark theme toggle persisted in local storage
- Retry/backoff behavior for retryable API/network failures

### `backend/Max` (In Progress)

- TinyStories data download script
- SentencePiece BPE tokenizer training script
- Character-level GPT training script (`train_gpt.py`)
- Experimental notebook (`build.ipynb`)

## Tech Stack

### Backend

- Python, FastAPI, Uvicorn
- SQLAlchemy ORM
- PostgreSQL
- JWT auth via `python-jose`
- Password hashing via `passlib` + `bcrypt`
- Email sending via SMTP (`smtplib`)
- WebSocket realtime transport

### Frontend

- React 19 (Create React App)
- React Router DOM 7
- Axios
- Web Crypto API (ECDH, PBKDF2, AES-GCM)

### ML / GPT Workspace (`backend/Max`)

- PyTorch
- Hugging Face `datasets`
- SentencePiece

## Installation and Setup

### Prerequisites

- Python 3.10+
- Node.js + npm
- PostgreSQL
- SMTP credentials (for verification/reset emails)

### 1) Backend Setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env.dev`:

```ini
ENVIRONMENT=development
DATABASE_URL=postgresql://chatapp:yourpassword@localhost:5432/chatapp
SECRET_KEY=change-me
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_USE_TLS=true
```

Run backend:

```bash
cd backend
uvicorn app.main:app --reload
```

### 2) Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env` (or copy from `.env.example`):

```ini
REACT_APP_API_BASE_URL=http://127.0.0.1:8000
REACT_APP_WS_BASE_URL=ws://127.0.0.1:8000
```

Run frontend:

```bash
cd frontend
npm start
```

### 3) Optional Production Environment Selection

The backend chooses env file based on `ENVIRONMENT` at process start:

- `ENVIRONMENT=development` -> loads `backend/.env.dev`
- `ENVIRONMENT=production` -> loads `backend/.env.prod`

For production mode, set `ENVIRONMENT=production` in your shell or hosting environment before starting Uvicorn.

### 4) Optional `backend/Max` Workspace

This part is experimental and separate from the chat runtime.

Tokenizer training:

```bash
cd backend/Max
python tokenizer/train_bpe_tokenizer.py --input_file data/raw/tinystories.txt --output_dir output --vocab_size 8000
```

GPT training:

```bash
cd backend/Max
python scripts/train_gpt.py --data-path data/raw/tinystories.txt --checkpoint-path checkpoints/gpt_char.pt
```

Note: `data/raw/download_data.py` currently contains a hardcoded local Windows path and may require editing before use on another machine.

## API Endpoints

Base URL examples:

- Local: `http://127.0.0.1:8000`
- Production (frontend default fallback): `https://friends-chitchat-ypqb.onrender.com`

### Public REST Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Root endpoint (currently returns `null`) |
| `POST` | `/signup` | Register a new user |
| `POST` | `/login` | Login with email/username + password |
| `POST` | `/verification/request` | Request/resend verification code |
| `POST` | `/verification/confirm` | Verify email with code |
| `POST` | `/password/forgot` | Request password reset code |
| `POST` | `/password/reset` | Reset password with code |

### Authenticated REST Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/me` | Current user profile |
| `GET` | `/users/search?q=...` | Search users with relationship status |
| `POST` | `/friend-requests/{receiver_id}` | Send friend request |
| `GET` | `/friend-requests` | List pending incoming/outgoing requests |
| `POST` | `/friend-requests/{request_id}/accept` | Accept request |
| `POST` | `/friend-requests/{request_id}/decline` | Decline request |
| `POST` | `/friends/{friend_id}` | Backward-compatible alias to send request |
| `GET` | `/friends` | List friends |
| `DELETE` | `/friends/{friend_id}` | Remove friend (both directions) |
| `GET` | `/chats` | List chat threads |
| `GET` | `/chats/{friend_id}/messages` | List visible messages in a chat |
| `POST` | `/chats/{friend_id}/messages` | Send encrypted message via HTTP fallback |
| `PATCH` | `/chats/{friend_id}/messages/{message_id}` | Edit own message |
| `DELETE` | `/chats/{friend_id}/messages/{message_id}?scope=me` | Delete for current user |
| `DELETE` | `/chats/{friend_id}/messages/{message_id}?scope=everyone` | Delete for both users (sender only) |
| `DELETE` | `/chats/{friend_id}` | Clear conversation for current user |
| `GET` | `/crypto/profile` | Read encrypted key bundle |
| `POST` | `/crypto/profile` | Create/update encrypted key bundle |

### WebSocket Endpoint

| Protocol | Endpoint | Purpose |
| --- | --- | --- |
| `WS` | `/ws/messages?token=<jwt>` | Realtime encrypted messaging and friend/chat event sync |

## Usage Instructions

1. Start backend and frontend.
2. Create an account from `/signup`.
3. Verify your email on `/verify-email`.
4. Log in on `/login`.
5. Unlock encryption keys in `/home` with your account password.
6. Use "New chat" to search users and send friend requests.
7. Accept/decline incoming requests from notifications.
8. After acceptance, open chat and send messages.
9. Right-click messages to edit/delete; right-click a thread to remove friend or clear chat.

## Folder Structure

```text
backend/
  app/
    authentication/        # JWT + password utilities
    configaration/         # ENV loader + settings
    database_configure/    # SQLAlchemy engine + ORM models
    E2EE/                  # Crypto profile routes
    routers/               # Auth, user, chat, friend-request, verification, reset, websocket
    schema/                # Pydantic request/response schemas
    Websocket_configure/   # In-memory connection manager
  Max/                     # Experimental GPT/tokenizer workspace
  requirements.txt

frontend/
  src/
    api/                   # Axios clients + endpoint wrappers + ws helper
    auth/                  # Auth context
    crypto/                # Browser crypto context/service
    pages/                 # Route-level pages
    components/            # Shared UI components
    styles/                # CSS styles
```

## Recent Updates / Changelog

### 2026-03-19

- Added `backend/Max` workspace for GPT/tokenizer experimentation.
- Added tokenizer artifacts and tiny-model config placeholders.

### 2026-03-17

- Refined environment handling with `.env.dev` / `.env.prod` loader support.
- Updated database configuration around environment-driven `DATABASE_URL`.
- Improved signup/verification flows and frontend API base config (`frontend/.env.example`).
- Added Axios retry/backoff behavior for retryable network/server errors.

### 2026-03-15

- Added full friend-request lifecycle (send/list/accept/decline) and dedicated router.
- Added friend removal with realtime sync and request cleanup.
- Improved WebSocket + serialization event handling for friend and chat updates.
- Expanded chat UI behavior and deployment-related backend adjustments.

### 2026-03-14

- Added message lifecycle operations: edit, delete for me, delete for everyone.
- Added conversation clear endpoint and related realtime events.
- Enhanced notification section and context-menu interactions in chat UI.

### 2026-03-08

- Added browser-side E2EE key management and encrypted messaging flow.

### 2026-02-08 to 2026-02-21

- Initial project setup and rename to Friend's Chitchat.
- Implemented signup/login, email verification, password reset, and user search.

### Current Uncommitted Local Changes

- `backend/Max/scripts/build.ipynb` modified
- `backend/Max/scripts/train_gpt.py` added (new)

## Current Constraints

- WebSocket connection manager is in-memory and process-local.
- Multi-instance deployments require shared pub/sub (for example, Redis) for cross-instance fan-out.
- Startup uses `Base.metadata.create_all(...)` and runtime column backfill for `chatting`; production should use migration scripts.
- `backend/Max/run_pipeline.ps1` currently references script names that are not present in the current folder layout.
