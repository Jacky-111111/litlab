import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routes.ai import router as ai_router
from routes.papers import router as papers_router
from routes.projects import router as projects_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="LitLab API",
        description="Backend API for LitLab beginner research assistant",
        version="0.1.0",
    )

    cors_origins = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in cors_origins.split(",") if origin.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(projects_router)
    app.include_router(papers_router)
    app.include_router(ai_router)

    return app


app = create_app()
