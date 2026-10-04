from typing import Any

from app.clients.coingecko import CoinGeckoClient
from app.clients.frankfurter import FrankfurterClient
from app.clients.stooq import StooqClient
from app.clients.yahoo import YahooClient
from app.core.config import settings
from app.services.currency import CurrencyService
from app.services.prices import PriceService

_price_service: PriceService | None = None


class DisabledSource:
    """Stands in for a price client switched off by `PRICE_PROVIDERS`.

    Every lookup answers "nothing", which `PriceService` already handles: it falls
    through to the next source, then to the last cached price. Cheaper and safer than
    threading an "is this enabled" check through every branch of it.
    """

    def __init__(self, name: str) -> None:
        self.name = name

    async def get_live_price(self, *_: Any) -> None:
        return None

    async def get_live_quote(self, *_: Any) -> None:
        return None

    async def get_historical_price(self, *_: Any) -> None:
        return None

    async def get_historical_range(self, *_: Any) -> dict[str, float]:
        return {}


def get_price_service() -> PriceService:
    global _price_service
    if _price_service is not None:
        return _price_service

    enabled = settings.price_providers
    coingecko = (
        CoinGeckoClient(settings.COINGECKO_API_KEY)
        if "coingecko" in enabled
        else DisabledSource("coingecko")
    )
    stooq = StooqClient() if "stooq" in enabled else DisabledSource("stooq")
    yahoo = YahooClient() if "yahoo" in enabled else DisabledSource("yahoo")
    # Yahoo is also the EUR/USD fallback behind Frankfurter. Disabled, that fallback
    # finds nothing and the last known rate is used, as when Yahoo is down.
    currency = CurrencyService(FrankfurterClient(), yahoo)  # type: ignore[arg-type]

    _price_service = PriceService(coingecko, stooq, yahoo, currency)  # type: ignore[arg-type]
    return _price_service


def reset_price_service() -> None:
    global _price_service
    _price_service = None
