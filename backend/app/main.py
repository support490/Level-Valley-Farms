from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import init_db
from app.api.routes import growers, barns, flocks, accounting, production, inventory, reports, dashboard, settings as settings_routes, contracts, logistics, feed, auth, ap_ar, budget, compliance, equipment
from app.services.accounting_service import seed_accounts
from app.services.inventory_service import seed_egg_grades
from app.services.demo_service import seed_demo_data
from app.services.auth_service import seed_admin_user
from app.db.database import async_session


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
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
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
app.include_router(settings_routes.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
