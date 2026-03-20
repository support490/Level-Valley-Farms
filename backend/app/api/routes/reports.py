from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import date
from io import StringIO

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


# ── Analytics ──

@router.get("/grower-scorecard")
async def grower_scorecard(db: AsyncSession = Depends(get_db)):
    return await report_service.get_grower_scorecard(db)


@router.get("/farm-pnl")
async def farm_pnl(
    period: str = Query("monthly", pattern="^(monthly|quarterly|yearly)$"),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_farm_pnl(db, period, year)


@router.get("/cost-per-dozen")
async def cost_per_dozen(
    months: int = Query(12, ge=1, le=36),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_cost_per_dozen_trend(db, months)


@router.get("/flock-comparison")
async def flock_comparison(db: AsyncSession = Depends(get_db)):
    return await report_service.get_flock_comparison(db)


# ── New Tier 1 Reports ──

@router.get("/general-ledger")
async def general_ledger(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_general_ledger(db, date_from, date_to)


@router.get("/audit-trail")
async def audit_trail(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_audit_trail(db, date_from, date_to, entity_type)


@router.get("/ar-aging-detail")
async def ar_aging_detail(db: AsyncSession = Depends(get_db)):
    return await report_service.get_ar_aging_detail(db)


@router.get("/ap-aging-detail")
async def ap_aging_detail(db: AsyncSession = Depends(get_db)):
    return await report_service.get_ap_aging_detail(db)


@router.get("/customer-balances")
async def customer_balances(db: AsyncSession = Depends(get_db)):
    return await report_service.get_customer_balances(db)


@router.get("/vendor-balances")
async def vendor_balances(db: AsyncSession = Depends(get_db)):
    return await report_service.get_vendor_balances(db)


@router.get("/flock-pnl/{flock_id}")
async def flock_pnl(flock_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await report_service.get_flock_pnl(db, flock_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/flock-cost-dashboard")
async def flock_cost_dashboard(db: AsyncSession = Depends(get_db)):
    return await report_service.get_flock_cost_dashboard(db)


# ── Customer & Vendor Statements ──

@router.get("/customer-statement/{customer_name}")
async def customer_statement(
    customer_name: str,
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_customer_statement(db, customer_name, date_from, date_to)


@router.get("/customer-statements/batch")
async def batch_customer_statements(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_batch_customer_statements(db, date_from, date_to)


@router.get("/customer-statement/{customer_name}/print-view")
async def customer_statement_print_view(
    customer_name: str,
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_customer_statement_print_view(db, customer_name, date_from, date_to)


@router.post("/customer-statements/email-batch")
async def email_batch_statements(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await report_service.email_batch_statements(db, date_from, date_to)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/vendor-statement/{vendor_name}")
async def vendor_statement(
    vendor_name: str,
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_vendor_statement(db, vendor_name, date_from, date_to)


# ── CSV Export ──

@router.get("/export/csv/{report_type}")
async def export_csv(
    report_type: str,
    period: str = Query("monthly"),
    year: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    valid_types = ["flock-comparison", "grower-scorecard", "farm-pnl", "cost-per-dozen", "income-statement"]
    if report_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid report type. Must be one of: {valid_types}")

    try:
        csv_content = await report_service.export_report_csv(
            db, report_type, period=period, year=year,
            date_from=date_from or "2020-01-01",
            date_to=date_to or date.today().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={report_type}-{date.today().isoformat()}.csv"}
    )
