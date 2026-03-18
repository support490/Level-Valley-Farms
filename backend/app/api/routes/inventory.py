from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.inventory import (
    EggInventoryCreate, EggInventoryResponse, InventorySummary,
    EggSaleCreate, EggSaleResponse, EggGradeCreate, EggGradeResponse,
)
from app.services import inventory_service

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ── Egg Grades ──

@router.get("/grades", response_model=List[EggGradeResponse])
async def list_grades(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    grades = await inventory_service.get_egg_grades(db, include_inactive)
    return grades


@router.post("/grades", response_model=EggGradeResponse, status_code=201)
async def create_grade(data: EggGradeCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await inventory_service.create_egg_grade(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/grades/{grade_id}")
async def delete_grade(grade_id: str, db: AsyncSession = Depends(get_db)):
    result = await inventory_service.delete_egg_grade(db, grade_id)
    if not result:
        raise HTTPException(status_code=404, detail="Grade not found")
    return {"message": "Grade deleted"}


# ── Inventory ──

@router.post("/eggs", response_model=EggInventoryResponse, status_code=201)
async def add_inventory(data: EggInventoryCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await inventory_service.add_inventory(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/eggs", response_model=List[EggInventoryResponse])
async def list_inventory(
    flock_id: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await inventory_service.get_inventory_records(db, flock_id, grade, date_from, date_to)


@router.get("/eggs/summary", response_model=List[InventorySummary])
async def inventory_summary(db: AsyncSession = Depends(get_db)):
    return await inventory_service.get_inventory_summary(db)


@router.get("/eggs/by-flock")
async def inventory_by_flock(db: AsyncSession = Depends(get_db)):
    return await inventory_service.get_inventory_by_flock(db)


@router.get("/eggs/aging")
async def inventory_aging(
    max_age_days: int = Query(7, ge=1),
    db: AsyncSession = Depends(get_db),
):
    return await inventory_service.get_inventory_aging(db, max_age_days)


@router.get("/eggs/value")
async def inventory_value(db: AsyncSession = Depends(get_db)):
    return await inventory_service.get_inventory_value(db)


@router.get("/alerts")
async def inventory_alerts(db: AsyncSession = Depends(get_db)):
    return await inventory_service.get_inventory_alerts(db)


# ── Barn Inventory ──

@router.get("/barn-inventory")
async def barn_inventory(db: AsyncSession = Depends(get_db)):
    return await inventory_service.get_barn_inventory(db)


@router.get("/map-data")
async def map_data(db: AsyncSession = Depends(get_db)):
    """Return all barns with lat/lng + current flock info + barn inventory for map display."""
    from app.services.grower_service import get_all_growers
    growers = await get_all_growers(db)
    barn_inv = await inventory_service.get_barn_inventory(db)

    # Index barn inventory by barn_id
    inv_by_barn = {b["barn_id"]: b for b in barn_inv}

    barns = []
    for g in growers:
        for b in (g.get("barns") or []):
            if b.get("latitude") is None or b.get("longitude") is None:
                continue
            inv = inv_by_barn.get(b["id"], {})
            barns.append({
                "barn_id": b["id"],
                "barn_name": b["name"],
                "barn_type": b["barn_type"],
                "grower_name": g["name"],
                "latitude": b["latitude"],
                "longitude": b["longitude"],
                "bird_capacity": b["bird_capacity"],
                "current_bird_count": b["current_bird_count"],
                "current_flock_number": b.get("current_flock_number"),
                "current_flock_status": b.get("current_flock_status"),
                "estimated_skids": inv.get("total_estimated_skids", 0),
            })
    return barns


# ── Sales ──

@router.post("/sales", response_model=EggSaleResponse, status_code=201)
async def record_sale(data: EggSaleCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await inventory_service.record_sale(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sales", response_model=List[EggSaleResponse])
async def list_sales(
    flock_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await inventory_service.get_sales(db, flock_id, date_from, date_to)
