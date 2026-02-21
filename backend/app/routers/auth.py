from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..authentication import oauth2, utils

from ..database_configure import database, models

from ..schema import Schemas

# Auth-related endpoints.
router = APIRouter(tags=["Authentication"])


@router.post("/login", response_model=Schemas.Token)
def login(user_credentials: Schemas.UserLogin, db: Session = Depends(database.get_db)):
    # Look up the user by email or username.
    identifier = user_credentials.email.strip()
    normalized_email = utils.normalize_email(identifier)
    user = (
        db.query(models.User)
        .filter(
            or_(
                models.User.email == normalized_email,
                models.User.username == identifier,
            )
        )
        .first()
    )

    # Reject invalid credentials.
    if not user or not utils.verify_password(user_credentials.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid email/username or password",
        )

    verified = (
        db.query(models.UserVerified)
        .filter(
            models.UserVerified.owner_id == user.id,
            models.UserVerified.is_verified.is_(True),
        )
        .first()
    )
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified",
        )

    # Issue a JWT access token.
    access_token = oauth2.create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}
