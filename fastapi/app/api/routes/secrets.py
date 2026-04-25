import os

from fastapi import APIRouter

from app.models import SecretSet
from app.services.price_service_factory import reset_price_service

router = APIRouter(prefix="/secrets", tags=["secrets"])

_KEYRING_SERVICE = "com.portfolio.desktop"


def _keyring_set(name: str, value: str) -> None:
    try:
        import keyring
        keyring.set_password(_KEYRING_SERVICE, name, value)
    except Exception:
        pass


def _keyring_delete(name: str) -> None:
    try:
        import keyring
        keyring.delete_password(_KEYRING_SERVICE, name)
    except Exception:
        pass


@router.post("/{name}")
def set_secret(name: str, body: SecretSet) -> dict:
    _keyring_set(name, body.value)
    env_key = f"SECRET_{name.upper().replace('-', '_')}"
    os.environ[env_key] = body.value
    if name == "coingecko-api-key":
        os.environ["COINGECKO_API_KEY"] = body.value
        reset_price_service()
    return {"ok": True}


@router.delete("/{name}")
def delete_secret(name: str) -> dict:
    _keyring_delete(name)
    env_key = f"SECRET_{name.upper().replace('-', '_')}"
    os.environ.pop(env_key, None)
    if name == "coingecko-api-key":
        os.environ.pop("COINGECKO_API_KEY", None)
        reset_price_service()
    return {"ok": True}
