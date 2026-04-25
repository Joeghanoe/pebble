import httpx


class FrankfurterClient:
    BASE_URL = "https://api.frankfurter.app"

    async def get_rate(self, date: str) -> float:
        url = f"{self.BASE_URL}/{date}?from=EUR&to=USD"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
        r.raise_for_status()
        data = r.json()
        usd = data.get("rates", {}).get("USD")
        if usd is None:
            raise ValueError(f"No USD rate for {date}")
        return float(usd)
