from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..authentication import oauth2
from ..database_configure import database, models
from ..schema import Schemas

# Crypto profile endpoints for storing E2EE key material.
router = APIRouter(tags=["Crypto"])


@router.get("/crypto/profile", response_model=Schemas.CryptoProfileOut)
def get_crypto_profile(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    # Ensure all required fields exist before returning.
    if not all(
        [
            current_user.public_key,
            current_user.encrypted_private_key,
            current_user.key_salt,
            current_user.key_iv,
        ]
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crypto profile not initialized",
        )

    return Schemas.CryptoProfileOut(
        public_key=current_user.public_key,
        encrypted_private_key=current_user.encrypted_private_key,
        key_salt=current_user.key_salt,
        key_iv=current_user.key_iv,
        key_version=current_user.key_version or 1,
    )


@router.post("/crypto/profile", response_model=Schemas.CryptoProfileOut)
def upsert_crypto_profile(
    payload: Schemas.CryptoProfileIn,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    # Persist the user's encrypted private key bundle and public key.
    current_user.public_key = payload.public_key
    current_user.encrypted_private_key = payload.encrypted_private_key
    current_user.key_salt = payload.key_salt
    current_user.key_iv = payload.key_iv
    current_user.key_version = payload.key_version
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return Schemas.CryptoProfileOut(
        public_key=current_user.public_key,
        encrypted_private_key=current_user.encrypted_private_key,
        key_salt=current_user.key_salt,
        key_iv=current_user.key_iv,
        key_version=current_user.key_version,
    )
