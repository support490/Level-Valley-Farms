from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import date

from app.db.database import get_db
from app.services import compliance_service

router = APIRouter(prefix="/accounting", tags=["compliance"])


@router.get("/year-end-close")
async def year_end_close(year: int = Query(...), db: AsyncSession = Depends(get_db)):
    return await compliance_service.perform_year_end_close(db, year)


@router.get("/retained-earnings")
async def retained_earnings(db: AsyncSession = Depends(get_db)):
    return await compliance_service.get_retained_earnings(db)


@router.get("/schedule-f")
async def schedule_f(year: int = Query(None), db: AsyncSession = Depends(get_db)):
    if not year:
        year = date.today().year
    return await compliance_service.get_schedule_f(db, year)


@router.get("/1099-report")
async def report_1099(year: int = Query(None), db: AsyncSession = Depends(get_db)):
    if not year:
        year = date.today().year
    return await compliance_service.get_1099_report(db, year)


@router.get("/period-comparison")
async def period_comparison(
    p1_start: str = Query(...), p1_end: str = Query(...),
    p2_start: str = Query(...), p2_end: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await compliance_service.get_period_comparison(db, p1_start, p1_end, p2_start, p2_end)


@router.get("/ratio-analysis")
async def ratio_analysis(db: AsyncSession = Depends(get_db)):
    return await compliance_service.get_ratio_analysis(db)


@router.get("/audit-export")
async def audit_export(year: int = Query(None), db: AsyncSession = Depends(get_db)):
    if not year:
        year = date.today().year
    return await compliance_service.get_audit_export(db, year)


@router.get("/export/quickbooks")
async def quickbooks_export(year: int = Query(None), db: AsyncSession = Depends(get_db)):
    if not year:
        year = date.today().year
    csv_content = await compliance_service.export_qb_csv(db, year)
    filename = f"quickbooks-export-{year}.csv"
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
