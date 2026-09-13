from fastapi import APIRouter

from app.api.routes import assets, exchanges, export, me, net_worth, positions, prices, transactions

api_router = APIRouter()
api_router.include_router(me.router)
api_router.include_router(assets.router)
api_router.include_router(exchanges.router)
api_router.include_router(transactions.router)
api_router.include_router(positions.router)
api_router.include_router(prices.router)
api_router.include_router(net_worth.router)
api_router.include_router(export.router)
