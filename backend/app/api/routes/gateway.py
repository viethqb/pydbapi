"""
Gateway (Phase 4): dynamic gateway /{module}/{path:path} (Task 4.1, implemented later).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/gateway", tags=["gateway"])
