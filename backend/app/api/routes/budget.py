from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.database import get_db
from app.services import budget_service

router = APIRouter(prefix="/accounting", tags=["budget"])


@router.get("/budgets")
async def list_budgets(year: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    return await budget_service.get_budgets(db, year)


@router.post("/budgets", status_code=201)
async def create_budget(data: dict, db: AsyncSession = Depends(get_db)):
    try:
        return await budget_service.create_budget(db, data)
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/budget-variance")
async def budget_variance(year: int = Query(...), db: AsyncSession = Depends(get_db)):
    return await budget_service.get_budget_variance(db, year)


@router.get("/cost-centers")
async def cost_centers(db: AsyncSession = Depends(get_db)):
    return await budget_service.get_cost_centers(db)


@router.get("/depreciation")
async def list_depreciation(db: AsyncSession = Depends(get_db)):
    return await budget_service.get_depreciation_schedules(db)


@router.post("/depreciation", status_code=201)
async def create_depreciation(data: dict, db: AsyncSession = Depends(get_db)):
    try:
        return await budget_service.create_depreciation(db, data)
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/break-even")
async def break_even(db: AsyncSession = Depends(get_db)):
    return await budget_service.get_break_even(db)


@router.get("/margin-analysis")
async def margin_analysis(db: AsyncSession = Depends(get_db)):
    return await budget_service.get_margin_analysis(db)


@router.get("/cash-flow")
async def cash_flow(year: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    return await budget_service.get_cash_flow(db, year)


@router.get("/financial-kpis")
async def financial_kpis(db: AsyncSession = Depends(get_db)):
    return await budget_service.get_financial_kpis(db)
