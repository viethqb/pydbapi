"""Request context middleware: X-Request-ID propagation and request logging."""

import logging
import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

_logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Bind ``request_id``, ``method``, and ``path`` to structlog contextvars.

    - Extracts or generates ``X-Request-ID`` header.
    - Logs ``request_started`` and ``request_completed`` (with ``status_code``, ``duration_ms``).
    - Sets ``X-Request-ID`` on response headers.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        _logger.info("request_started")
        start = time.perf_counter()

        response = await call_next(request)

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        _logger.info(
            "request_completed",
            extra={"status_code": response.status_code, "duration_ms": duration_ms},
        )

        response.headers["X-Request-ID"] = request_id
        return response
