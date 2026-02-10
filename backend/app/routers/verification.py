from datetime import datetime, timedelta, timezone
import random
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import Schemas, database, models
from ..config import settings

# Verification-related endpoints.
router = APIRouter(tags=["Verification"])

VERIFICATION_CODE_EXPIRE_MINUTES = 10


def generate_verification_code() -> str:
    # Generate a 6-digit numeric code for email verification.
    return f"{random.randint(100000, 999999)}"


def send_verification_email(recipient: str, code: str) -> None:
    # Send a verification email via SMTP using configured settings.
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP is not configured")

    message = EmailMessage()
    message["Subject"] = "Verify your email"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        f"Your verification code is {code}. "
        f"It expires in {VERIFICATION_CODE_EXPIRE_MINUTES} minutes."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


def is_user_verified(db: Session, user_id: int) -> bool:
    # Check whether a user has already verified their email.
    verification = (
        db.query(models.UserVerified)
        .filter(
            models.UserVerified.owner_id == user_id,
            models.UserVerified.is_verified.is_(True),
        )
        .first()
    )
    return verification is not None


@router.post("/verification/request", response_model=Schemas.Message)
def request_verification(
    payload: Schemas.EmailVerificationRequest,
    db: Session = Depends(database.get_db),
):
    # Create or refresh a verification code and email it to the user.
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if is_user_verified(db, user.id):
        return {"message": "Email already verified"}

    code = generate_verification_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_EXPIRE_MINUTES)

    verification = (
        db.query(models.UserVerified)
        .filter(models.UserVerified.owner_id == user.id)
        .first()
    )

    if verification:
        verification.code = code
        verification.expires_at = expires_at
        verification.is_verified = False
        verification.verified_at = None
    else:
        verification = models.UserVerified(
            owner_id=user.id,
            code=code,
            expires_at=expires_at,
            is_verified=False,
        )
        db.add(verification)

    try:
        send_verification_email(user.email, code)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not send verification email",
        )

    return {"message": "Verification code sent"}


@router.post("/verification/confirm", response_model=Schemas.Message)
def confirm_verification(
    payload: Schemas.EmailVerificationConfirm,
    db: Session = Depends(database.get_db),
):
    # Validate a submitted verification code and mark the email as verified.
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    verification = (
        db.query(models.UserVerified)
        .filter(models.UserVerified.owner_id == user.id)
        .first()
    )

    if not verification:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code not requested",
        )

    if verification.is_verified:
        return {"message": "Email already verified"}

    code = payload.code.strip()
    if not verification.code or verification.code != code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code",
        )

    if not verification.expires_at or verification.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired",
        )

    verification.is_verified = True
    verification.verified_at = datetime.now(timezone.utc)
    verification.code = None
    verification.expires_at = None
    db.commit()

    return {"message": "Email verified"}
