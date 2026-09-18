"""The ranged price fetches behind the daily gap fill.

Each source already downloaded a date range and threw all but one row away; these
keep the range. What needs pinning is the shape of what comes back — one entry per
calendar date, whatever granularity the source actually serves.
"""

import asyncio

import httpx
import pytest

from app.clients.coingecko import CoinGeckoClient
from app.clients.stooq import StooqClient
from app.clients.yahoo import YahooClient


class _FakeResponse:
    def __init__(self, payload: dict | None = None, text: str = "", ok: bool = True) -> None:
        self._payload = payload or {}
        self.text = text
        self.is_success = ok

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    """Stands in for `httpx.AsyncClient`, recording the URL it was handed."""

    calls: list[str] = []

    def __init__(self, response: _FakeResponse) -> None:
        self._response = response

    def __call__(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return self

    async def __aenter__(self):  # noqa: ANN204
        return self

    async def __aexit__(self, *exc) -> bool:  # noqa: ANN002
        return False

    async def get(self, url: str, **kwargs) -> _FakeResponse:  # noqa: ANN003
        _FakeClient.calls.append(url)
        return self._response


@pytest.fixture(autouse=True)
def _reset_calls() -> None:
    _FakeClient.calls = []


def _stub(monkeypatch, response: _FakeResponse) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient(response))


def test_coingecko_keeps_the_last_point_of_each_day(monkeypatch) -> None:
    """CoinGecko serves a sub-90-day window hourly, not daily. Each date has to
    collapse to its closing value, which is what the per-day endpoint returns.
    """
    # 2026-03-02, three hours of it, then one point on 03-03.
    payload = {
        "prices": [
            [1772409600000, 100.0],  # 2026-03-02 00:00 UTC
            [1772445600000, 110.0],  # 2026-03-02 10:00 UTC
            [1772481600000, 120.0],  # 2026-03-02 20:00 UTC
            [1772496000000, 130.0],  # 2026-03-03 00:00 UTC
        ]
    }
    _stub(monkeypatch, _FakeResponse(payload))

    prices = asyncio.run(
        CoinGeckoClient("key").get_historical_range("bitcoin", "2026-03-02", "2026-03-03")
    )

    assert prices == {"2026-03-02": 120.0, "2026-03-03": 130.0}


def test_coingecko_range_is_one_request(monkeypatch) -> None:
    _stub(monkeypatch, _FakeResponse({"prices": []}))

    asyncio.run(CoinGeckoClient("key").get_historical_range("bitcoin", "2026-03-01", "2026-05-30"))

    assert len(_FakeClient.calls) == 1
    assert "market_chart/range" in _FakeClient.calls[0]


def test_coingecko_range_covers_the_whole_last_day(monkeypatch) -> None:
    """Asking up to the last day's midnight returns one point for it, or none."""
    _stub(monkeypatch, _FakeResponse({"prices": []}))

    asyncio.run(CoinGeckoClient("key").get_historical_range("bitcoin", "2026-03-02", "2026-03-02"))

    url = _FakeClient.calls[0]
    start = int(url.split("from=")[1].split("&")[0])
    end = int(url.split("to=")[1])
    assert end - start == 86400


def test_coingecko_range_survives_an_upstream_error(monkeypatch) -> None:
    _stub(monkeypatch, _FakeResponse(ok=False))

    assert asyncio.run(
        CoinGeckoClient("key").get_historical_range("bitcoin", "2026-03-01", "2026-03-02")
    ) == {}


def test_stooq_keeps_every_row_of_the_csv(monkeypatch) -> None:
    csv = "Date,Open,High,Low,Close,Volume\n2026-03-02,1,2,0,10.5,100\n2026-03-03,1,2,0,11.5,100\n"
    _stub(monkeypatch, _FakeResponse(text=csv))

    prices = asyncio.run(
        StooqClient().get_historical_range("VWCE.DE", "2026-03-02", "2026-03-03")
    )

    assert prices == {"2026-03-02": 10.5, "2026-03-03": 11.5}


def test_stooq_skips_days_the_market_was_shut(monkeypatch) -> None:
    """`N/D` is Stooq for 'no trading that day', not for zero."""
    csv = "Date,Close\n2026-03-02,10.5\n2026-03-03,N/D\n"
    _stub(monkeypatch, _FakeResponse(text=csv))

    prices = asyncio.run(
        StooqClient().get_historical_range("VWCE.DE", "2026-03-02", "2026-03-03")
    )

    assert prices == {"2026-03-02": 10.5}


def test_yahoo_pairs_each_close_with_its_date(monkeypatch) -> None:
    payload = {
        "chart": {
            "result": [
                {
                    "timestamp": [1772409600, 1772496000],
                    "indicators": {"adjclose": [{"adjclose": [10.0, None]}]},
                }
            ]
        }
    }
    _stub(monkeypatch, _FakeResponse(payload))

    prices = asyncio.run(YahooClient().get_historical_range("VUAA.L", "2026-03-02", "2026-03-03"))

    assert prices == {"2026-03-02": 10.0}, "a null close is a gap, not a zero"


def test_yahoo_range_survives_an_empty_result(monkeypatch) -> None:
    _stub(monkeypatch, _FakeResponse({"chart": {"result": []}}))

    assert asyncio.run(
        YahooClient().get_historical_range("VUAA.L", "2026-03-02", "2026-03-03")
    ) == {}
