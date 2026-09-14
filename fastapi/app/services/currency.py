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

    def last_known_rate(self) -> float | None:
        """The most recent rate actually fetched, for when the API is down.

        Yesterday's real rate beats a constant: FX moves a fraction of a percent
        a day, while the old hardcoded 1.1 was ~4% off by the time it was hit.
        """
        if not self._cache:
            return None
        return self._cache[max(self._cache)]
