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
