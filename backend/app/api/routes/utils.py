from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic.networks import EmailStr

from app.api.deps import get_current_active_superuser
from app.core.health import readiness_check
from app.models import Message
from app.utils import generate_test_email, send_email

router = APIRouter(prefix="/utils", tags=["utils"])


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.get("/health-check/", response_model=None)
async def health_check() -> bool | JSONResponse:
    """
    Readiness check: Postgres + Redis (when cache or rate limit enabled).
    Returns 200 with true if all required dependencies are up; 503 otherwise.
    """
    ok, failures = readiness_check()
    if not ok:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "message": "Service Unavailable",
                "data": failures,
            },
        )
    return True
