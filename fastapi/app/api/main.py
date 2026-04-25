from fastapi import APIRouter

from app.api.routes import assets, exchanges, export, net_worth, positions, prices, secrets, transactions, window

api_router = APIRouter()
api_router.include_router(assets.router)
api_router.include_router(exchanges.router)
api_router.include_router(transactions.router)
api_router.include_router(positions.router)
api_router.include_router(prices.router)
api_router.include_router(net_worth.router)
api_router.include_router(export.router)
api_router.include_router(secrets.router)
api_router.include_router(window.router, tags=["window"])
