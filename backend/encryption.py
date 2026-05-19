"""
Token encryption utilities for secure storage of OAuth tokens
Uses Fernet symmetric encryption with a key derived from environment variable
"""
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import logging

logger = logging.getLogger(__name__)

# Get or generate encryption key
def _get_encryption_key() -> bytes:
    """Get or derive encryption key from environment"""
    secret = os.environ.get("TOKEN_ENCRYPTION_SECRET", "critiquee-default-secret-change-in-production")
    salt = os.environ.get("TOKEN_ENCRYPTION_SALT", "critiquee-salt-2024")
    
    # Derive a proper Fernet key from the secret
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt.encode(),
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret.encode()))
    return key


_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Get or create Fernet instance (singleton)"""
    global _fernet
    instance = _fernet
    if instance is None:
        instance = Fernet(_get_encryption_key())
        _fernet = instance
    return instance


def encrypt_token(token: str) -> str:
    """Encrypt a token for secure storage"""
    if not token:
        return token
    try:
        encrypted = _get_fernet().encrypt(token.encode())
        return encrypted.decode()
    except Exception as e:
        logger.error(f"Token encryption failed: {e}")
        raise


def decrypt_token(encrypted_token: str) -> str:
    """Decrypt a stored token"""
    if not encrypted_token:
        return encrypted_token
    try:
        decrypted = _get_fernet().decrypt(encrypted_token.encode())
        return decrypted.decode()
    except Exception as e:
        logger.error(f"Token decryption failed: {e}")
        raise


def is_encrypted(value: str) -> bool:
    """Check if a value appears to be Fernet-encrypted"""
    if not value:
        return False
    try:
        # Fernet tokens are base64 encoded and start with 'gAAAAA'
        return value.startswith('gAAAAA') and len(value) > 50
    except Exception:
        return False
