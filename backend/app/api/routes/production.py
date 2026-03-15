from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.production import ProductionCreate, ProductionResponse, ProductionSummary, BulkProductionCreate, ProductionAlert
from app.services import production_service

router = APIRouter(prefix="/production", tags=["production"])


@router.post("", response_model=ProductionResponse, status_code=201)
async def record_production(data: ProductionCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await production_service.record_production(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[ProductionResponse])
async def list_production(
    flock_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await production_service.get_production_records(db, flock_id, date_from, date_to)


@router.get("/chart")
async def production_chart(
    flock_ids: str = Query(..., description="Comma-separated flock IDs"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    ids = [fid.strip() for fid in flock_ids.split(",") if fid.strip()]
    return await production_service.get_production_chart_data(db, ids, date_from, date_to)


@router.post("/bulk", status_code=201)
async def bulk_record_production(data: BulkProductionCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await production_service.record_bulk_production(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/summary/{flock_id}", response_model=ProductionSummary)
async def production_summary(flock_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await production_service.get_production_summary(db, flock_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/alerts", response_model=List[ProductionAlert])
async def production_alerts(db: AsyncSession = Depends(get_db)):
    return await production_service.get_production_alerts(db)


@router.get("/breed-curves")
async def breed_curves():
    return {
        "breeds": production_service.get_available_breeds(),
        "curves": production_service.BREED_CURVES,
    }


@router.get("/breed-curve/{breed}")
async def breed_curve(breed: str):
    curve = production_service.get_breed_curve(breed)
    if not curve:
        raise HTTPException(status_code=404, detail=f"No breed curve for '{breed}'")
    return {"breed": breed, "curve": curve}
