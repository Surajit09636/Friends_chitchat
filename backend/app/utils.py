from passlib.context import CryptContext

# Password hashing configuration.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    # Hash a plain-text password before storing it.
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Compare a plain-text password with its hashed version.
    return pwd_context.verify(plain_password, hashed_password)
