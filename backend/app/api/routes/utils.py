from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic.networks import EmailStr

from app.api.deps import get_current_active_superuser
from app.core.health import liveness_check, readiness_check
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


@router.get("/liveness/", response_model=None)
async def liveness() -> bool | JSONResponse:
    """
    Liveness probe — is the process alive and responsive?

    Lightweight: no DB/Redis I/O.  If this fails the container should be
    restarted by the orchestrator.
    """
    ok, failures = liveness_check()
    if not ok:
        return JSONResponse(
            status_code=503,
            content={"success": False, "message": "Process unhealthy", "data": failures},
        )
    return True


@router.get("/health-check/", response_model=None)
async def health_check() -> bool | JSONResponse:
    """
    Readiness probe — can the service handle traffic?

    Checks: Postgres + Redis (when enabled) + alembic migrations at head.
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
