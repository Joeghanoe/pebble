import httpx


class YahooClient:
    BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"

    async def get_live_price(self, ticker: str) -> float | None:
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
            return result.get("meta", {}).get("regularMarketPrice")
        except Exception:
            return None

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

    async def get_historical_prices_range(self, ticker: str, start_date: str, end_date: str) -> dict[str, float]:
        """Fetch all daily closing prices for a date range in one call. Returns {YYYY-MM-DD: price}."""
        from datetime import datetime, timezone, timedelta

        period1 = int(datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
        period2 = int((datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)).timestamp())
        url = f"{self.BASE_URL}/{ticker}?interval=1d&period1={period1}&period2={period2}"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if not r.is_success:
                return {}
            data = r.json()
            result = (data.get("chart", {}).get("result") or [None])[0]
            if not result:
                return {}
            timestamps = result.get("timestamp", []) or []
            closes = result.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", []) or []
            prices: dict[str, float] = {}
            for ts, price in zip(timestamps, closes):
                if price is not None:
                    prices[datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")] = float(price)
            return prices
        except Exception:
            return {}
