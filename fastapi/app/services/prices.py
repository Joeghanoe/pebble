import logging

from sqlmodel import Session

from app.clients.coingecko import CoinGeckoClient
from app.clients.stooq import StooqClient, is_eur_listing
from app.clients.yahoo import YahooClient
from app.crud import get_latest_price, upsert_price
from app.models import Asset, PriceResultOk, PriceResultStale, PriceResultUnavailable
from app.services.currency import CurrencyService

logger = logging.getLogger(__name__)

# Last resort: both Frankfurter and Yahoo unreachable, and nothing cached yet.
FALLBACK_EUR_USD = 1.1


class PriceService:
    def __init__(
        self,
        coingecko: CoinGeckoClient,
        stooq: StooqClient,
        yahoo: YahooClient,
        currency: CurrencyService,
    ) -> None:
        self.coingecko = coingecko
        self.stooq = stooq
        self.yahoo = yahoo
        self.currency = currency

    async def fetch_live_price(
        self, session: Session, asset: Asset
    ) -> PriceResultOk | PriceResultStale | PriceResultUnavailable:
        from datetime import date as date_cls

        today = date_cls.today().isoformat()

        if asset.type == "crypto":
            return await self._fetch_live_crypto(session, asset, today)
        if asset.type in ("etf", "stock"):
            return await self._fetch_live_etf(session, asset, today)
        return PriceResultUnavailable()

    async def fetch_historical_price(
        self, session: Session, asset: Asset, date: str
    ) -> PriceResultOk | PriceResultStale | PriceResultUnavailable:
        rate = await self._get_rate_safe(date)

        if asset.type == "crypto":
            if not asset.coingecko_id:
                return self._stale_or_unavailable(session, asset.id)  # type: ignore[arg-type]
            price = await self.coingecko.get_historical_price(asset.coingecko_id, date)
            if price is not None:
                upsert_price(session, asset.id, date, price, rate)  # type: ignore[arg-type]
                return PriceResultOk(price_eur=price, date=date, exchange_rate=rate)
            return self._stale_or_unavailable(session, asset.id)  # type: ignore[arg-type]

        if asset.type in ("etf", "stock"):
            if not asset.yahoo_ticker:
                return PriceResultUnavailable()
            price = await self.yahoo.get_historical_price(asset.yahoo_ticker, date)
            if price is not None:
                price_eur = price if is_eur_listing(asset.yahoo_ticker) else price / rate
                upsert_price(session, asset.id, date, price_eur, rate)  # type: ignore[arg-type]
                return PriceResultOk(price_eur=price_eur, date=date, exchange_rate=rate)
            return self._stale_or_unavailable(session, asset.id)  # type: ignore[arg-type]

        return PriceResultUnavailable()

    async def backfill_price_range(
        self, session: Session, asset: Asset, start: str, end: str
    ) -> int:
        """Cache every daily price an upstream has for `start`..`end`.

        One request per asset for the whole window, where `fetch_historical_price`
        is one per day. Returns how many dates were written.

        Days the source has no price for are left alone rather than filled: a
        market that was closed has no close, and the snapshot writer already
        carries the last known price forward for those.
        """
        await self.currency.warm_range(start, end)

        if asset.type == "crypto":
            if not asset.coingecko_id:
                return 0
            prices = await self.coingecko.get_historical_range(asset.coingecko_id, start, end)
            written = 0
            for date, price in sorted(prices.items()):
                rate = await self._get_rate_safe(date)
                upsert_price(session, asset.id, date, price, rate)  # type: ignore[arg-type]
                written += 1
            return written

        if asset.type in ("etf", "stock"):
            if not asset.yahoo_ticker:
                return 0
            # Stooq leads for the same reason it does on live quotes, and Yahoo
            # covers the listings it does not carry.
            prices = await self.stooq.get_historical_range(asset.yahoo_ticker, start, end)
            if not prices:
                prices = await self.yahoo.get_historical_range(asset.yahoo_ticker, start, end)
            if not prices:
                logger.warning(
                    "no daily history for %s in %s..%s", asset.yahoo_ticker, start, end
                )
                return 0

            in_eur = is_eur_listing(asset.yahoo_ticker)
            written = 0
            for date, price in sorted(prices.items()):
                rate = await self._get_rate_safe(date)
                upsert_price(  # type: ignore[arg-type]
                    session, asset.id, date, price if in_eur else price / rate, rate
                )
                written += 1
            return written

        return 0

    async def _fetch_live_crypto(
        self, session: Session, asset: Asset, today: str
    ) -> PriceResultOk | PriceResultStale | PriceResultUnavailable:
        rate = await self._get_rate_safe(today)
        if asset.coingecko_id:
            price = await self.coingecko.get_live_price(asset.coingecko_id)
            if price is not None:
                upsert_price(session, asset.id, today, price, rate)  # type: ignore[arg-type]
                return PriceResultOk(price_eur=price, date=today, exchange_rate=rate)
        return self._stale_or_unavailable(session, asset.id)  # type: ignore[arg-type]

    async def _fetch_live_etf(
        self, session: Session, asset: Asset, today: str
    ) -> PriceResultOk | PriceResultStale | PriceResultUnavailable:
        if not asset.yahoo_ticker:
            return self._stale_or_unavailable(session, asset.id)  # type: ignore[arg-type]

        price = await self.stooq.get_live_price(asset.yahoo_ticker)
        if price is not None:
            rate = await self._get_rate_safe(today)
            price_eur = price if is_eur_listing(asset.yahoo_ticker) else price / rate
            upsert_price(session, asset.id, today, price_eur, rate)  # type: ignore[arg-type]
            return PriceResultOk(price_eur=price_eur, date=today, exchange_rate=rate)

        # Stooq simply does not carry some listings (exus.de and vuaa.uk both
        # 404), which left those positions frozen on whatever price they last
        # had. Yahoo covers them, and reports the quote currency, so fall back
        # to it rather than reporting the holding as stale.
        quote = await self.yahoo.get_live_quote(asset.yahoo_ticker)
        if quote is not None:
            price, currency = quote
            rate = await self._get_rate_safe(today)
            if currency == "EUR":
                price_eur = price
            elif currency == "USD":
                price_eur = price / rate
            else:
                # No rate for anything else, and a wrong conversion is worse
                # than an honest gap.
                logger.warning(
                    "%s quotes in %s; no EUR conversion available",
                    asset.yahoo_ticker,
                    currency,
                )
                return self._stale_or_unavailable(session, asset.id)  # type: ignore[arg-type]
            upsert_price(session, asset.id, today, price_eur, rate)  # type: ignore[arg-type]
            return PriceResultOk(price_eur=price_eur, date=today, exchange_rate=rate)

        logger.warning("no live price for %s from stooq or yahoo", asset.yahoo_ticker)
        return self._stale_or_unavailable(session, asset.id)  # type: ignore[arg-type]

    def _stale_or_unavailable(
        self, session: Session, asset_id: int
    ) -> PriceResultStale | PriceResultUnavailable:
        latest = get_latest_price(session, asset_id)
        if latest:
            return PriceResultStale(
                price_eur=latest.price_eur,
                last_known_date=latest.date,
                exchange_rate=latest.exchange_rate,
            )
        return PriceResultUnavailable()

    async def _get_rate_safe(self, date: str) -> float:
        try:
            return await self.currency.get_eur_usd_rate(date)
        except Exception:
            # This used to fail silently, so a broken FX lookup looked exactly
            # like a working one while every USD holding was converted at a
            # number somebody typed in once.
            logger.warning("EUR/USD lookup failed for %s; using fallback rate", date, exc_info=True)
            return self.currency.last_known_rate() or FALLBACK_EUR_USD
