from datetime import datetime, timedelta, timezone
import random
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..authentication import utils
from ..configaration.config import settings
from ..database_configure import database, models
from ..schema import Schemas

# Password reset-related endpoints.
router = APIRouter(tags=["Password"])

PASSWORD_RESET_EXPIRE_MINUTES = 15


def generate_reset_code() -> str:
    # Generate a 6-digit numeric reset code.
    return f"{random.randint(100000, 999999)}"


def send_reset_email(recipient: str, code: str) -> None:
    # Send a password reset email via SMTP using configured settings.
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP is not configured")

    message = EmailMessage()
    message["Subject"] = "Reset your password"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        f"Your password reset code is {code}. "
        f"It expires in {PASSWORD_RESET_EXPIRE_MINUTES} minutes."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


@router.post("/password/forgot", response_model=Schemas.Message)
def request_password_reset(payload: Schemas.PasswordResetRequest,db: Session = Depends(database.get_db),):
    # Create or refresh a password reset code and email it to the user.
    normalized_email = utils.normalize_email(payload.email)
    user = db.query(models.User).filter(models.User.email == normalized_email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    code = generate_reset_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)

    reset = (db.query(models.PasswordReset).filter(models.PasswordReset.owner_id == user.id).first())

    if reset:
        reset.code = code
        reset.expires_at = expires_at
        reset.used_at = None
    else:
        reset = models.PasswordReset(
            owner_id=user.id,
            code=code,
            expires_at=expires_at,
        )
        db.add(reset)

    try:
        send_reset_email(user.email, code)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not send reset email",
        )

    return {"message": "Password reset code sent"}


@router.post("/password/reset", response_model=Schemas.Message)
def confirm_password_reset(
    payload: Schemas.PasswordResetConfirm,
    db: Session = Depends(database.get_db),
):
    # Validate a reset code and update the user password.
    normalized_email = utils.normalize_email(payload.email)
    user = db.query(models.User).filter(models.User.email == normalized_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    reset = (
        db.query(models.PasswordReset)
        .filter(models.PasswordReset.owner_id == user.id)
        .first()
    )

    if not reset or not reset.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset not requested",
        )

    if reset.used_at is not None:
        return {"message": "Password already reset"}

    code = payload.code.strip()
    if reset.code != code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset code",
        )

    if reset.expires_at and reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset code expired",
        )

    user.password = utils.hash_password(payload.new_password)
    reset.used_at = datetime.now(timezone.utc)
    reset.code = None
    reset.expires_at = None
    db.commit()

    return {"message": "Password updated"}
