from app.clients.frankfurter import FrankfurterClient


class CurrencyService:
    def __init__(self, client: FrankfurterClient) -> None:
        self._client = client
        self._cache: dict[str, float] = {}

    async def get_eur_usd_rate(self, date: str) -> float:
        if date in self._cache:
            return self._cache[date]
        rate = await self._client.get_rate(date)
        self._cache[date] = rate
        return rate
