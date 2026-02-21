from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..authentication import oauth2, utils

from ..database_configure import database, models

from ..schema import Schemas

# User-related endpoints.
router = APIRouter(tags=["Users"])


@router.post("/signup", response_model=Schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(user: Schemas.UserCreate, db: Session = Depends(database.get_db)):
    # Ensure email/username are unique.
    normalized_email = utils.normalize_email(user.email)
    normalized_username = user.username.strip()

    email_exists = (
        db.query(models.User)
        .filter(func.lower(models.User.email) == normalized_email)
        .first()
    )
    if email_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    username_exists = (
        db.query(models.User)
        .filter(models.User.username == normalized_username)
        .first()
    )
    if username_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already registered",
        )

    # Hash the password before saving.
    hashed_password = utils.hash_password(user.password)
    new_user = models.User(
        email=normalized_email,
        username=normalized_username,
        name=user.name,
        password=hashed_password,
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered",
        )
    db.refresh(new_user)
    return new_user


@router.get("/me", response_model=Schemas.UserOut)
def get_me(current_user: models.User = Depends(oauth2.get_current_user)):
    # Return the authenticated user's profile.
    return current_user
