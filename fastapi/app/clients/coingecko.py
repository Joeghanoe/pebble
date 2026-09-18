import httpx


class CoinGeckoClient:
    BASE_URL = "https://api.coingecko.com/api/v3"

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {"x-cg-demo-api-key": self.api_key, "User-Agent": "Mozilla/5.0"}

    async def get_live_price(self, coin_id: str) -> float | None:
        url = f"{self.BASE_URL}/simple/price?ids={coin_id}&vs_currencies=eur"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers=self._headers())
            if not r.is_success:
                return None
            data = r.json()
            return data.get(coin_id, {}).get("eur")
        except Exception:
            return None

    async def get_historical_range(
        self, coin_id: str, start: str, end: str
    ) -> dict[str, float]:
        """Daily EUR closes for `start`..`end` inclusive, as {'YYYY-MM-DD': price}.

        `/history` is one call per day; this is one call for the range, which is
        what makes filling a gap of missing days affordable at all.

        CoinGecko serves this window hourly rather than daily (it only switches
        to daily points above 90 days), so each date keeps its last point — the
        closing value, matching what the per-day endpoint returns.
        """
        from datetime import UTC, datetime, timedelta

        start_ts = int(
            datetime.fromisoformat(start).replace(tzinfo=UTC).timestamp()
        )
        # Through the end of `end`, not its midnight, or the last day comes back
        # with a single 00:00 point or none at all.
        end_ts = int(
            (datetime.fromisoformat(end) + timedelta(days=1))
            .replace(tzinfo=UTC)
            .timestamp()
        )
        url = (
            f"{self.BASE_URL}/coins/{coin_id}/market_chart/range"
            f"?vs_currency=eur&from={start_ts}&to={end_ts}"
        )
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(url, headers=self._headers())
            if not r.is_success:
                return {}
            prices = r.json().get("prices") or []
        except Exception:
            return {}

        by_date: dict[str, float] = {}
        for point in prices:
            if not isinstance(point, list) or len(point) < 2 or point[1] is None:
                continue
            day = datetime.fromtimestamp(point[0] / 1000, tz=UTC).date().isoformat()
            by_date[day] = float(point[1])
        return by_date

    async def get_historical_price(self, coin_id: str, date: str) -> float | None:
        # CoinGecko expects DD-MM-YYYY
        year, month, day = date.split("-")
        cg_date = f"{day}-{month}-{year}"
        url = f"{self.BASE_URL}/coins/{coin_id}/history?date={cg_date}&localization=false"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers=self._headers())
            if not r.is_success:
                return None
            data = r.json()
            return data.get("market_data", {}).get("current_price", {}).get("eur")
        except Exception:
            return None
