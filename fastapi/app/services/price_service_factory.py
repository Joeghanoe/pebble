from app.clients.coingecko import CoinGeckoClient
from app.clients.frankfurter import FrankfurterClient
from app.clients.stooq import StooqClient
from app.clients.yahoo import YahooClient
from app.services.currency import CurrencyService
from app.services.prices import PriceService

_price_service: PriceService | None = None


def get_price_service() -> PriceService:
    global _price_service
    if _price_service is not None:
        return _price_service

    import os

    api_key = os.environ.get("COINGECKO_API_KEY", "")
    coingecko = CoinGeckoClient(api_key)
    stooq = StooqClient()
    yahoo = YahooClient()
    currency = CurrencyService(FrankfurterClient())

    _price_service = PriceService(coingecko, stooq, yahoo, currency)
    return _price_service


def reset_price_service() -> None:
    global _price_service
    _price_service = None
