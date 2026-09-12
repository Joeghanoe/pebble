"""Identity from the auth proxy.

Pebble is single-tenant: one portfolio, one owner. There is no user table and no
per-row scoping, so the whole security model is "only the owner ever reaches the API".
That holds because of two independent gates:

1. oauth2-proxy signs the caller in with Google and forwards the verified address as
   `X-Forwarded-Email` (`--pass-user-headers`). Requests without a session never get
   past it. Configure `OAUTH2_PROXY_AUTHENTICATED_EMAILS_FILE` so only the owner's
   address gets a session at all.
2. The middleware below re-checks that address against `ALLOWED_EMAILS`. A proxy
   misconfiguration -- a widened `OAUTH2_PROXY_EMAIL_DOMAINS`, say -- therefore does
   not by itself hand someone the ledger.

The header is only trustworthy because nothing can reach the API except the proxy: the
api service has NO public domain and is on the private network only. Give it a public
domain and anyone can set `X-Forwarded-Email` themselves.

Note that `--set-xauthrequest` is a different flag: it puts `X-Auth-Request-*` on the
RESPONSE to the browser for nginx auth_request setups, and never reaches an upstream.
"""

from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

# Railway's healthcheck hits the service directly on the private network, with no proxy
# in front and therefore no identity header. Keep it open or deploys never go healthy.
_OPEN_PATHS = frozenset({"/", f"{settings.API_V1_STR}/health"})


def _unauthorised(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": detail},
    )


class ProxyIdentityMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.url.path in _OPEN_PATHS:
            return await call_next(request)

        if not settings.REQUIRE_PROXY_IDENTITY:
            # Local development without a proxy in front. Never set this in a deployment.
            return await call_next(request)

        raw = request.headers.get(settings.PROXY_EMAIL_HEADER)
        email = raw.strip().lower() if raw else ""

        if not email or "@" not in email:
            # Header NAMES only: enough to see what the proxy actually forwards, never a value.
            logger.warning(
                "Rejected request without proxy identity header {} on {}; headers present: {}",
                settings.PROXY_EMAIL_HEADER,
                request.url.path,
                ", ".join(sorted(request.headers.keys())),
            )
            return _unauthorised("Requests must arrive through the auth proxy.")

        allowed = settings.allowed_emails
        if allowed and email not in allowed:
            logger.warning(
                "Rejected {} on {}: not in ALLOWED_EMAILS", email, request.url.path
            )
            return _unauthorised("This account is not allowed to use this deployment.")

        request.state.user_email = email
        return await call_next(request)


def current_email(request: Request) -> str:
    """The signed-in address, for display. Empty when identity is not required."""
    return getattr(request.state, "user_email", "")
