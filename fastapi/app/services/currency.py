import logging
from datetime import date as date_cls

from app.clients.frankfurter import FrankfurterClient
from app.clients.yahoo import YahooClient

logger = logging.getLogger(__name__)

# Yahoo's symbol for the EUR/USD pair. Quoted as USD per EUR, the same direction
# as Frankfurter's from=EUR&to=USD, so the two are interchangeable.
EUR_USD_SYMBOL = "EURUSD=X"


class CurrencyService:
    """EUR/USD, from Frankfurter with Yahoo behind it.

    Frankfurter leads because it serves the ECB's daily reference rate: one
    published number per day, so a snapshot recomputed next week produces the
    same euro value it did today. Yahoo's live mid-market rate moves all day and
    would make history depend on when it happened to be read.

    Yahoo is the fallback because it is already a dependency for prices, and
    because the alternative -- a hardcoded constant -- had drifted about 5% from
    the real rate by the time anything actually hit it.
    """

    def __init__(self, client: FrankfurterClient, yahoo: YahooClient | None = None) -> None:
        self._client = client
        self._yahoo = yahoo or YahooClient()
        self._cache: dict[str, float] = {}

    async def get_eur_usd_rate(self, date: str) -> float:
        if date in self._cache:
            return self._cache[date]

        try:
            rate = await self._client.get_rate(date)
        except Exception:
            logger.warning("frankfurter EUR/USD failed for %s; trying yahoo", date, exc_info=True)
            rate = await self._get_yahoo_rate(date)

        self._cache[date] = rate
        return rate

    async def _get_yahoo_rate(self, date: str) -> float:
        # Today has no settled close yet, so it needs the live quote rather than
        # the daily series.
        if date >= date_cls.today().isoformat():
            quote = await self._yahoo.get_live_quote(EUR_USD_SYMBOL)
            rate = quote[0] if quote else None
        else:
            rate = await self._yahoo.get_historical_price(EUR_USD_SYMBOL, date)

        if rate is None:
            raise ValueError(f"No EUR/USD rate for {date} from frankfurter or yahoo")
        return rate

    def last_known_rate(self) -> float | None:
        """The most recent rate actually fetched, for when both sources are down.

        Yesterday's real rate beats a constant: FX moves a fraction of a percent
        a day, while the old hardcoded 1.1 was ~5% off by the time it was hit.
        """
        if not self._cache:
            return None
        return self._cache[max(self._cache)]
