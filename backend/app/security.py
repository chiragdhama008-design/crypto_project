"""
Lightweight MVP security helpers for TRACE-X.
Supports optional ADMIN_API_KEY protection for destructive/compute-heavy endpoints
without blocking local hackathon development when ADMIN_API_KEY is unset.
"""

import hmac
from typing import Optional
from fastapi import Header, HTTPException
from backend.app.config import settings


def verify_admin_key(x_admin_key: Optional[str] = Header(default=None, alias="X-Admin-Key")) -> None:
    """
    Requires matching X-Admin-Key header whenever settings.ADMIN_API_KEY is configured.
    No-op in local/hackathon dev mode when ADMIN_API_KEY is empty.
    """
    expected = (settings.ADMIN_API_KEY or "").strip()
    if not expected:
        return
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(
            status_code=403,
            detail="Valid X-Admin-Key header required for administrative operation."
        )

