from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.logging import setup_logging
from app.api import health, auth, runs, audit

setup_logging()

app = FastAPI(
    title="GST ITC Reconciliation Engine",
    description="M0 Foundation Skeleton for GST Input-Tax-Credit Reconciliation",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, tags=["Health"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(runs.router, prefix="/runs", tags=["Reconciliation Runs"])
app.include_router(audit.router, prefix="/audit", tags=["Audit Log"])
