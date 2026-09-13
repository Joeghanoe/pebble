from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.main import api_router
from app.core.config import settings
from app.core.identity import ProxyIdentityMiddleware
from app.core.logging import setup_logging
from app.prestart import main as prestart

# Setup loguru logging (intercepts standard logging)
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """Application lifespan handler - runs on startup and shutdown."""
    prestart()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Identity. Every request except / and /api/health must carry the address oauth2-proxy
# forwards. There is deliberately no CORS middleware: the SPA is served from the same
# origin as the API (both sit behind the proxy), so a browser never makes a cross-origin
# request to it, and an allowance here would only widen who can drive the API.
app.add_middleware(ProxyIdentityMiddleware)


@app.get("/")
def root():
    """Unauthenticated. Reachable directly on the private network, so it says nothing."""
    return {"name": settings.PROJECT_NAME, "version": "0.1.0"}


@app.get(f"{settings.API_V1_STR}/health")
def health_check():
    """Health check for Railway. Unauthenticated: the platform probes it without a proxy."""
    return {"status": "healthy"}


app.include_router(api_router, prefix=settings.API_V1_STR)
