from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import Schemas, database, models, oauth2, utils

# Auth-related endpoints.
router = APIRouter(tags=["Authentication"])


@router.post("/login", response_model=Schemas.Token)
def login(user_credentials: Schemas.UserLogin, db: Session = Depends(database.get_db)):
    # Look up the user by email or username.
    user = (
        db.query(models.User)
        .filter(
            or_(
                models.User.email == user_credentials.email,
                models.User.username == user_credentials.email,
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

    # Issue a JWT access token.
    access_token = oauth2.create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}
