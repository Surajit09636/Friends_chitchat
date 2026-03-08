from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict


class UserBase(BaseModel):
    # Shared user fields.
    email: EmailStr
    username: str
    name: Optional[str] = None


class UserCreate(UserBase):
    # Fields required for registration.
    password: str


class UserOut(UserBase):
    # Fields returned in API responses.
    id: int
    created_at: datetime
    # Public encryption key (optional for older accounts).
    public_key: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserSummary(BaseModel):
    # Lightweight user info for search results.
    id: int
    username: str
    name: Optional[str] = None
    email: EmailStr
    # Public ECDH key used to derive shared chat keys.
    public_key: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FriendOut(UserSummary):
    # Lightweight friend info.
    pass


class ChatMessageCreate(BaseModel):
    # Payload for sending a message.
    ciphertext: str
    iv: str


class ChatMessageOut(BaseModel):
    # Message returned in chat history.
    id: int
    sender_id: int
    receiver_id: int
    ciphertext: str
    iv: str
    crypto_version: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatThreadOut(BaseModel):
    # Chat list item with last message info.
    friend: FriendOut
    last_message_ciphertext: Optional[str] = None
    last_message_iv: Optional[str] = None
    last_message_version: Optional[int] = None
    last_time: Optional[datetime] = None


class CryptoProfileIn(BaseModel):
    # Client-provided encrypted private key bundle.
    public_key: str
    encrypted_private_key: str
    key_salt: str
    key_iv: str
    key_version: int = 1


class CryptoProfileOut(CryptoProfileIn):
    # Echoes the stored crypto profile.
    pass


class UserLogin(BaseModel):
    # Login credentials (email or username + password).
    email: str
    password: str


class Token(BaseModel):
    # JWT access token response.
    access_token: str
    token_type: str


class TokenData(BaseModel):
    # Data extracted from a verified token.
    id: Optional[int] = None


class EmailVerificationRequest(BaseModel):
    # Request a verification code for a given email.
    email: EmailStr


class EmailVerificationConfirm(BaseModel):
    # Verify an email with a code.
    email: EmailStr
    code: str


class PasswordResetRequest(BaseModel):
    # Request a password reset code.
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    # Reset a password with a verification code.
    email: EmailStr
    code: str
    new_password: str


class Message(BaseModel):
    # Simple message response.
    message: str
