from sqlalchemy import Column, ForeignKey, Integer, String, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql.sqltypes import TIMESTAMP
from sqlalchemy.sql.expression import text
from .database import Base


class User(Base):
    # ORM model for application users.
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, nullable=False)
    name = Column(String, nullable=True)
    email = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    username = Column(String, nullable=False, unique=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))
    # Public ECDH key (base64-encoded raw bytes) used for message encryption.
    public_key = Column(String, nullable=True)
    # Password-wrapped private key (base64-encoded ciphertext).
    encrypted_private_key = Column(String, nullable=True)
    # Salt for password-based key derivation (base64-encoded).
    key_salt = Column(String, nullable=True)
    # IV for decrypting the private key (base64-encoded).
    key_iv = Column(String, nullable=True)
    # Version number for crypto profile format (future-proofing).
    key_version = Column(Integer, nullable=False, server_default=text("1"))
    
    verification = relationship("UserVerified", back_populates="user", uselist=False)
    password_reset = relationship("PasswordReset", back_populates="user", uselist=False)


class UserVerified(Base):
    # ORM model for verified users.
    __tablename__ = "verified_users"
    id = Column(Integer, primary_key=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    is_verified = Column(Boolean, default=False)
    code = Column(String, nullable=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    verified_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User", back_populates="verification")


class PasswordReset(Base):
    # ORM model for password reset requests.
    __tablename__ = "password_resets"
    id = Column(Integer, primary_key=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    code = Column(String, nullable=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    used_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User", back_populates="password_reset")
     
class chatting(Base):
    # ORM table for encrypted chat messages.
    __tablename__ = "chatting"
    id = Column(Integer, primary_key=True, nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Encrypted message payload (base64 ciphertext) and IV (base64).
    ciphertext = Column(String, nullable=False)
    iv = Column(String, nullable=False)
    # Version to allow future algorithm upgrades.
    crypto_version = Column(Integer, nullable=False, server_default=text("1"))
    # True when sender deletes the message for both participants.
    is_deleted_for_everyone = Column(Boolean, nullable=False, server_default=text("false"))
    # Per-user soft delete flags for "delete for me" behavior.
    deleted_for_sender = Column(Boolean, nullable=False, server_default=text("false"))
    deleted_for_receiver = Column(Boolean, nullable=False, server_default=text("false"))
    # Set when sender edits encrypted content.
    edited_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))


class Friend(Base):
    # ORM table for user contacts.
    __tablename__ = "friends"
    id = Column(Integer, primary_key=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    friend_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))

    __table_args__ = (
        UniqueConstraint("owner_id", "friend_id", name="uq_friend_owner_friend"),
    )
