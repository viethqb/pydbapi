import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api.main import api_router
from app.api.routes.gateway import router as gateway_router
from app.api.routes.token import router as token_router
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.core.middleware import RequestContextMiddleware

configure_logging()

_logger = logging.getLogger(__name__)


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


_enable_docs = settings.ENVIRONMENT != "production"

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if _enable_docs else None,
    docs_url="/api/docs" if _enable_docs else None,
    redoc_url="/api/redoc" if _enable_docs else None,
    generate_unique_id_function=custom_generate_unique_id,
)


# ---------------------------------------------------------------------------
# Global exception handlers — standardized error response format
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Return 422 with a human-readable detail string instead of raw Pydantic errors."""
    errors = exc.errors()
    messages = []
    for err in errors:
        loc = " → ".join(str(l) for l in err.get("loc", []) if l != "body")
        msg = err.get("msg", "Invalid value")
        messages.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(messages)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions — log and return 500 with safe message."""
    _logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    detail = "Internal server error"
    if settings.ENVIRONMENT == "local":
        detail = f"Internal server error: {exc}"
    return JSONResponse(
        status_code=500,
        content={"detail": detail},
    )


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------

_SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"geolocation=(), camera=(), microphone=()"),
    (b"x-permitted-cross-domain-policies", b"none"),
]


class SecurityHeadersMiddleware:
    """Inject standard security headers into every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def _send(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(_SECURITY_HEADERS)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, _send)


app.add_middleware(SecurityHeadersMiddleware)

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.add_middleware(RequestContextMiddleware)

# All routes under /api — specific routes FIRST (higher priority)
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(token_router, prefix="/api")
app.include_router(token_router)  # backward compat: /token/generate

# Gateway catch-all LAST: /api/{module}/{path:path}
app.include_router(gateway_router, prefix="/api")
