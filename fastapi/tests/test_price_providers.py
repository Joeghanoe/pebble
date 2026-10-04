"""`PRICE_PROVIDERS` switches upstreams off without breaking the price path."""

import pytest

from app.clients.coingecko import CoinGeckoClient
from app.core.config import Settings, settings
from app.services import price_service_factory
from app.services.price_service_factory import DisabledSource, get_price_service


@pytest.fixture(autouse=True)
def _fresh_service():
    price_service_factory.reset_price_service()
    yield
    price_service_factory.reset_price_service()


def test_default_enables_every_provider():
    assert Settings().price_providers == {"coingecko", "stooq", "yahoo"}


def test_unknown_provider_refuses_to_start():
    with pytest.raises(ValueError, match="bloomberg"):
        _ = Settings(PRICE_PROVIDERS="coingecko,bloomberg").price_providers


def test_disabled_providers_become_null_sources(monkeypatch):
    monkeypatch.setattr(settings, "PRICE_PROVIDERS", "coingecko")
    service = get_price_service()

    assert isinstance(service.coingecko, CoinGeckoClient)
    assert isinstance(service.stooq, DisabledSource)
    assert isinstance(service.yahoo, DisabledSource)


@pytest.mark.asyncio
async def test_null_source_answers_nothing():
    source = DisabledSource("yahoo")
    assert await source.get_live_price("vwce.de") is None
    assert await source.get_live_quote("vwce.de") is None
    assert await source.get_historical_price("vwce.de", "2026-01-02") is None
    assert await source.get_historical_range("vwce.de", "2026-01-01", "2026-01-31") == {}
