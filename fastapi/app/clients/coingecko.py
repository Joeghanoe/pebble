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
