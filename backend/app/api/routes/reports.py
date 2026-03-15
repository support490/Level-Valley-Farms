from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import date

from app.db.database import get_db
from app.schemas.reports import FlockReportResponse, IncomeStatementResponse, BalanceSheetResponse
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/flock/{flock_id}", response_model=FlockReportResponse)
async def flock_report(flock_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await report_service.get_flock_report(db, flock_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/income-statement", response_model=IncomeStatementResponse)
async def income_statement(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_income_statement(db, date_from, date_to)


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
async def balance_sheet(
    as_of_date: str = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not as_of_date:
        as_of_date = date.today().isoformat()
    return await report_service.get_balance_sheet(db, as_of_date)
