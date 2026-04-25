import httpx

SUFFIX_MAP: dict[str, str] = {
    ".L": ".UK",
    ".AS": ".NL",
    ".PA": ".FR",
    ".DE": ".DE",
    ".MI": ".IT",
    ".MC": ".ES",
    ".BR": ".BE",
    ".ZU": ".CH",
    ".VI": ".AT",
    ".LS": ".PT",
}

EUR_SUFFIXES = {".DE", ".NL", ".FR", ".IT", ".ES", ".BE", ".CH", ".AT", ".PT", ".HE", ".ST", ".CO", ".OL"}


def to_stooq_ticker(yahoo_ticker: str) -> str:
    upper = yahoo_ticker.upper()
    for yahoo_suffix, stooq_suffix in SUFFIX_MAP.items():
        if upper.endswith(yahoo_suffix.upper()):
            return yahoo_ticker[: -len(yahoo_suffix)] + stooq_suffix
    if "." not in yahoo_ticker:
        return yahoo_ticker + ".US"
    return yahoo_ticker


def is_eur_listing(ticker: str) -> bool:
    upper = ticker.upper()
    return any(upper.endswith(s) for s in EUR_SUFFIXES)


def _parse_csv(text: str) -> list[dict[str, str]]:
    lines = text.strip().split("\n")
    if not lines:
        return []
    headers = [h.strip() for h in lines[0].split(",")]
    result = []
    for line in lines[1:]:
        if not line.strip():
            continue
        vals = [v.strip() for v in line.split(",")]
        result.append(dict(zip(headers, vals, strict=False)))
    return result


class StooqClient:
    async def get_live_price(self, yahoo_ticker: str) -> float | None:
        ticker = to_stooq_ticker(yahoo_ticker).lower()
        url = f"https://stooq.com/q/l/?s={ticker}&f=sd2t2ohlcv&h&e=csv"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if not r.is_success:
                return None
            rows = _parse_csv(r.text)
            if not rows:
                return None
            close = rows[0].get("Close", "N/D")
            if close == "N/D":
                return None
            return float(close)
        except Exception:
            return None

    async def get_historical_price(self, yahoo_ticker: str, date: str) -> float | None:
        from datetime import datetime, timedelta

        ticker = to_stooq_ticker(yahoo_ticker).lower()
        target = datetime.strptime(date, "%Y-%m-%d")
        d_from = (target - timedelta(days=7)).strftime("%Y%m%d")
        d_to = target.strftime("%Y%m%d")
        url = f"https://stooq.com/q/d/l/?s={ticker}&d1={d_from}&d2={d_to}&i=d"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if not r.is_success:
                return None
            rows = _parse_csv(r.text)
            if not rows:
                return None
            close = rows[-1].get("Close", "N/D")
            if close == "N/D":
                return None
            return float(close)
        except Exception:
            return None
