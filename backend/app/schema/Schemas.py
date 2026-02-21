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

    model_config = ConfigDict(from_attributes=True)


class UserSummary(BaseModel):
    # Lightweight user info for search results.
    id: int
    username: str
    name: Optional[str] = None
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)


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
