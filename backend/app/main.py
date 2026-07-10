from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.exceptions import add_exception_handlers

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

add_exception_handlers(app)

from app.api.routers import auth, members, subscription, clients, vendors, files, runs, reports, integrations, workspace

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(members.router, prefix="/api/v1", tags=["members"])
app.include_router(subscription.router, prefix="/api/v1", tags=["subscription"])
app.include_router(clients.router, prefix="/api/v1", tags=["clients"])
app.include_router(vendors.router, prefix="/api/v1", tags=["vendors"])
app.include_router(files.router, prefix="/api/v1", tags=["files"])
app.include_router(runs.router, prefix="/api/v1", tags=["runs"])
app.include_router(reports.router, prefix="/api/v1", tags=["reports"])
app.include_router(integrations.router, prefix="/api/v1", tags=["integrations"])
app.include_router(workspace.router, prefix="/api/v1", tags=["workspace"])

@app.get("/")
def read_root():
    return {"status": "ok"}
