import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .routes.account import router as account_router
from .routes.ai import router as ai_router
from .routes.collections import router as collections_router
from .routes.papers import router as papers_router
from .routes.projects import router as projects_router
from .routes.shared import router as shared_router


# All HTTP routes are mounted under this prefix. Both local dev and Vercel
# send requests starting with `/api/...` so the frontend, the dev server,
# and the serverless function all agree on the URL shape. Change in lockstep
# with `frontend/config.js` if you ever need to move it.
API_PREFIX = "/api"


def create_app() -> FastAPI:
    app = FastAPI(
        title="LitLab API",
        description="Backend API for LitLab beginner research assistant",
        version="0.1.0",
    )

    default_cors = ",".join(
        [
            "http://127.0.0.1:8001",
            "http://localhost:8001",
            "http://127.0.0.1:5500",
            "http://localhost:5500",
        ]
    )
    cors_origins = os.getenv("CORS_ORIGINS", default_cors)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in cors_origins.split(",") if origin.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get(f"{API_PREFIX}/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    for router in (
        account_router,
        projects_router,
        collections_router,
        papers_router,
        ai_router,
        shared_router,
    ):
        app.include_router(router, prefix=API_PREFIX)

    return app


app = create_app()
