from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.core.config import settings
from app.db.database import init_db
from app.api.routes import growers, barns, flocks, accounting, production, inventory, reports, dashboard, settings as settings_routes, contracts, logistics, feed, auth, ap_ar, budget, compliance, equipment, weekly_records
from app.services.accounting_service import seed_accounts
from app.services.inventory_service import seed_egg_grades
from app.services.demo_service import seed_demo_data
from app.services.auth_service import seed_admin_user
from app.db.database import async_session

# Frontend dist directory (built by Vite)
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with async_session() as db:
        await seed_accounts(db)
        await seed_egg_grades(db)
        await seed_demo_data(db)
        await seed_admin_user(db)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(growers.router, prefix="/api")
app.include_router(barns.router, prefix="/api")
app.include_router(flocks.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
app.include_router(production.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(contracts.router, prefix="/api")
app.include_router(logistics.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(ap_ar.router, prefix="/api")
app.include_router(budget.router, prefix="/api")
app.include_router(compliance.router, prefix="/api")
app.include_router(feed.router, prefix="/api")
app.include_router(equipment.router, prefix="/api")
app.include_router(weekly_records.router, prefix="/api")
app.include_router(settings_routes.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}


# ── Serve frontend static files ──
# Mount /assets for Vite's hashed JS/CSS bundles
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="static-assets")


# Catch-all: serve index.html for any non-API route (SPA client-side routing)
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    # If a static file exists in dist, serve it (favicon.ico, etc.)
    file_path = DIST_DIR / full_path
    if full_path and file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
    # Otherwise serve index.html for SPA routing
    index = DIST_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"detail": "Frontend not built. Run: cd frontend && npm run build"}
