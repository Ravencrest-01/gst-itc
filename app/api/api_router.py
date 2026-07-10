from fastapi import APIRouter
from app.api.routers import auth, clients, reconcile

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
# The endpoints are mixed as per the contract (some /reconcile, some /runs)
# we mount the reconcile router at root because it defines /reconcile and /runs
api_router.include_router(reconcile.router, tags=["reconciliation"])
