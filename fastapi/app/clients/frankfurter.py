import httpx


class FrankfurterClient:
    # api.frankfurter.app 301-redirects to frankfurter.dev. httpx does not follow
    # redirects unless asked, so without `follow_redirects` every rate lookup
    # raised and silently fell back to a hardcoded 1.1.
    BASE_URL = "https://api.frankfurter.dev/v1"

    async def get_rate(self, date: str) -> float:
        url = f"{self.BASE_URL}/{date}?base=EUR&symbols=USD"
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(url)
        r.raise_for_status()
        data = r.json()
        usd = data.get("rates", {}).get("USD")
        if usd is None:
            raise ValueError(f"No USD rate for {date}")
        return float(usd)
