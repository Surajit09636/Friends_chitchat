from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..authentication import oauth2, utils

from ..database_configure import database, models

from ..schema import Schemas

# User-related endpoints.
router = APIRouter(tags=["Users"])


@router.post("/signup", response_model=Schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(user: Schemas.UserCreate, db: Session = Depends(database.get_db)):
    # Ensure email/username are unique.
    existing_user = (
        db.query(models.User)
        .filter(
            or_(
                models.User.email == user.email,
                models.User.username == user.username,
            )
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered",
        )

    # Hash the password before saving.
    hashed_password = utils.hash_password(user.password)
    new_user = models.User(
        email=user.email,
        username=user.username,
        name=user.name,
        password=hashed_password,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/me", response_model=Schemas.UserOut)
def get_me(current_user: models.User = Depends(oauth2.get_current_user)):
    # Return the authenticated user's profile.
    return current_user
