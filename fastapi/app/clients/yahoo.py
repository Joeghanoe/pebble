import httpx


class YahooClient:
    BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"

    async def get_live_price(self, ticker: str) -> float | None:
        quote = await self.get_live_quote(ticker)
        return quote[0] if quote else None

    async def get_live_quote(self, ticker: str) -> tuple[float, str] | None:
        """Live price plus the currency Yahoo reports it in.

        The currency matters: the `.L` suffix alone does not tell you whether a
        London listing quotes in USD (VUAA.L) or pence, so guessing from the
        ticker is how you end up off by 100x.
        """
        url = f"{self.BASE_URL}/{ticker}?interval=1d&range=1d"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if not r.is_success:
                return None
            data = r.json()
            result = (data.get("chart", {}).get("result") or [None])[0]
            if not result:
                return None
            meta = result.get("meta", {})
            price = meta.get("regularMarketPrice")
            currency = meta.get("currency")
            if price is None or not currency:
                return None
            return float(price), str(currency).upper()
        except Exception:
            return None

    async def get_historical_range(
        self, ticker: str, start: str, end: str
    ) -> dict[str, float]:
        """Daily adjusted closes for `start`..`end`, as {'YYYY-MM-DD': price}.

        `get_historical_price` already asks Yahoo for a range and then discards
        all but one close; this keeps them. Prices are in the listing's
        currency, which `get_live_quote` reports and the caller converts.
        """
        from datetime import UTC, datetime, timedelta

        period1 = int(datetime.fromisoformat(start).replace(tzinfo=UTC).timestamp())
        period2 = int(
            (datetime.fromisoformat(end) + timedelta(days=1))
            .replace(tzinfo=UTC)
            .timestamp()
        )
        url = f"{self.BASE_URL}/{ticker}?interval=1d&period1={period1}&period2={period2}"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if not r.is_success:
                return {}
            result = (r.json().get("chart", {}).get("result") or [None])[0]
            if not result:
                return {}
            stamps = result.get("timestamp") or []
            closes = result.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])
        except Exception:
            return {}

        by_date: dict[str, float] = {}
        for stamp, close in zip(stamps, closes, strict=False):
            if close is None:
                continue
            day = datetime.fromtimestamp(stamp, tz=UTC).date().isoformat()
            by_date[day] = float(close)
        return by_date

    async def get_historical_price(self, ticker: str, date: str) -> float | None:
        from datetime import datetime, timedelta

        target = datetime.strptime(date, "%Y-%m-%d")
        period1 = int((target - timedelta(days=1)).timestamp())
        period2 = int((target + timedelta(days=3)).timestamp())
        url = f"{self.BASE_URL}/{ticker}?interval=1d&period1={period1}&period2={period2}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if not r.is_success:
                return None
            data = r.json()
            result = (data.get("chart", {}).get("result") or [None])[0]
            if not result:
                return None
            closes = result.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])
            for price in reversed(closes):
                if price is not None:
                    return float(price)
            return None
        except Exception:
            return None
