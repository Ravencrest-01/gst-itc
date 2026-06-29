import os
from datetime import datetime, timedelta
from typing import Optional, Any
from jose import jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

# Cryptographic configurations
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-gst-reconciler-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120  # 2 hours for professional audit workflows

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def hash_password(password: str) -> str:
    """ Hashes a raw password to save safely into PostgreSQL. """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """ Compares a logging-in user's password with the database hash. """
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """ Generates a signed JWT session cookie payload. """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)