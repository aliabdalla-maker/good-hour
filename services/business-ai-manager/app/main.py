import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from .config import get_settings
from .db import Base, engine
from .routers import assistant, auth, billing, crm, dashboard, files

log = logging.getLogger("sme")
settings = get_settings()

if settings.environment == "production" and settings.jwt_secret.startswith("change-me"):
    raise RuntimeError("Set a strong JWT_SECRET in production")



@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Dev convenience. In production run migrations (see docs/DATABASE.md) instead.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan,
              docs_url=None if settings.environment == "production" else "/docs")
app.add_middleware(CORSMiddleware, allow_origins=[], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"status": "ok", "llm_provider": settings.llm_provider}


@app.get("/app-ads.txt", response_class=PlainTextResponse)
def app_ads():
    # Host this on the developer website domain listed in Play Console.
    return f"google.com, {settings.admob_publisher_id}, DIRECT, f08c47fec0942fa0\n"


for r in (auth.router, auth.biz, crm.router, assistant.router, assistant.approvals, billing.router,
          files.router, dashboard.router):
    app.include_router(r, prefix="/v1")
