from sqlmodel import Session

from app.clients.coingecko import CoinGeckoClient
from app.clients.stooq import StooqClient, is_eur_listing
from app.clients.yahoo import YahooClient
from app.crud import get_latest_price, upsert_price
from app.models import Asset, PriceResultOk, PriceResultStale, PriceResultUnavailable
from app.services.currency import CurrencyService


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
            # Prefer Yahoo Finance when available — more reliable rate limits
            if asset.yahoo_ticker:
                usd_price = await self.yahoo.get_historical_price(asset.yahoo_ticker, date)
                if usd_price is not None:
                    price_eur = usd_price / rate
                    upsert_price(session, asset.id, date, price_eur, rate)  # type: ignore[arg-type]
                    return PriceResultOk(price_eur=price_eur, date=date, exchange_rate=rate)
            # Fall back to CoinGecko for assets not listed on Yahoo
            if asset.coingecko_id:
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

    async def _fetch_live_crypto(
        self, session: Session, asset: Asset, today: str
    ) -> PriceResultOk | PriceResultStale | PriceResultUnavailable:
        rate = await self._get_rate_safe(today)
        # Prefer Yahoo Finance when available — more reliable rate limits
        if asset.yahoo_ticker:
            usd_price = await self.yahoo.get_live_price(asset.yahoo_ticker)
            if usd_price is not None:
                price_eur = usd_price / rate
                upsert_price(session, asset.id, today, price_eur, rate)  # type: ignore[arg-type]
                return PriceResultOk(price_eur=price_eur, date=today, exchange_rate=rate)
        # Fall back to CoinGecko for assets not listed on Yahoo
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
        # Stooq unavailable or returned N/D — fall back to Yahoo Finance
        yahoo_price = await self.yahoo.get_live_price(asset.yahoo_ticker)
        if yahoo_price is not None:
            rate = await self._get_rate_safe(today)
            price_eur = yahoo_price if is_eur_listing(asset.yahoo_ticker) else yahoo_price / rate
            upsert_price(session, asset.id, today, price_eur, rate)  # type: ignore[arg-type]
            return PriceResultOk(price_eur=price_eur, date=today, exchange_rate=rate)
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
            return 1.1
