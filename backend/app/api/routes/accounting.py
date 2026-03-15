from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.accounting import (
    AccountCreate, AccountUpdate, AccountResponse,
    JournalEntryCreate, JournalEntryResponse, JournalEntryUpdate,
    QuickExpenseCreate, TrialBalanceResponse, AccountLedgerEntry,
    RecurringEntryCreate, RecurringEntryUpdate, RecurringEntryResponse,
    FiscalPeriodCreate, FiscalPeriodResponse,
)
from app.services import accounting_service

router = APIRouter(prefix="/accounting", tags=["accounting"])


# ── Accounts ──

@router.get("/accounts", response_model=List[AccountResponse])
async def list_accounts(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await accounting_service.get_all_accounts(db, include_inactive)


@router.get("/accounts/{account_id}", response_model=AccountResponse)
async def get_account(account_id: str, db: AsyncSession = Depends(get_db)):
    account = await accounting_service.get_account(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return accounting_service._account_to_dict(account)


@router.post("/accounts", response_model=AccountResponse, status_code=201)
async def create_account(data: AccountCreate, db: AsyncSession = Depends(get_db)):
    try:
        account = await accounting_service.create_account(db, data)
        return accounting_service._account_to_dict(account)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(account_id: str, data: AccountUpdate, db: AsyncSession = Depends(get_db)):
    account = await accounting_service.update_account(db, account_id, data)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return accounting_service._account_to_dict(account)


@router.post("/accounts/seed")
async def seed_accounts(db: AsyncSession = Depends(get_db)):
    created = await accounting_service.seed_accounts(db)
    if created:
        return {"message": "Default chart of accounts created"}
    return {"message": "Accounts already exist, skipping seed"}


# ── Journal Entries ──

@router.get("/journal-entries", response_model=List[JournalEntryResponse])
async def list_journal_entries(
    flock_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    posted_only: bool = Query(False),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await accounting_service.get_all_journal_entries(
        db, flock_id, category, posted_only, date_from, date_to
    )


@router.get("/journal-entries/{entry_id}", response_model=JournalEntryResponse)
async def get_journal_entry(entry_id: str, db: AsyncSession = Depends(get_db)):
    entry = await accounting_service.get_journal_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


@router.post("/journal-entries", response_model=JournalEntryResponse, status_code=201)
async def create_journal_entry(data: JournalEntryCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await accounting_service.create_journal_entry(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/journal-entries/{entry_id}/post", response_model=JournalEntryResponse)
async def post_journal_entry(entry_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await accounting_service.post_journal_entry(db, entry_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/journal-entries/{entry_id}/unpost", response_model=JournalEntryResponse)
async def unpost_journal_entry(entry_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await accounting_service.unpost_journal_entry(db, entry_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/journal-entries/{entry_id}")
async def delete_journal_entry(entry_id: str, db: AsyncSession = Depends(get_db)):
    try:
        success = await accounting_service.delete_journal_entry(db, entry_id)
        if not success:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        return {"message": "Journal entry deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Quick Expense Entry ──

@router.post("/expenses", response_model=JournalEntryResponse, status_code=201)
async def create_quick_expense(data: QuickExpenseCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await accounting_service.create_quick_expense(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Trial Balance ──

@router.get("/trial-balance", response_model=TrialBalanceResponse)
async def get_trial_balance(
    as_of_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await accounting_service.get_trial_balance(db, as_of_date)


# ── Account Ledger ──

@router.get("/accounts/{account_id}/ledger", response_model=List[AccountLedgerEntry])
async def get_account_ledger(
    account_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await accounting_service.get_account_ledger(db, account_id, date_from, date_to)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Recurring Entries ──

@router.get("/recurring", response_model=List[RecurringEntryResponse])
async def list_recurring(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    return await accounting_service.get_recurring_entries(db, active_only)


@router.post("/recurring", response_model=RecurringEntryResponse, status_code=201)
async def create_recurring(data: RecurringEntryCreate, db: AsyncSession = Depends(get_db)):
    try:
        entry = await accounting_service.create_recurring_entry(db, data)
        entries = await accounting_service.get_recurring_entries(db, False)
        return next(e for e in entries if e["id"] == entry.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/recurring/{entry_id}", response_model=RecurringEntryResponse)
async def update_recurring(entry_id: str, data: RecurringEntryUpdate, db: AsyncSession = Depends(get_db)):
    entry = await accounting_service.update_recurring_entry(db, entry_id, data)
    if not entry:
        raise HTTPException(status_code=404, detail="Recurring entry not found")
    entries = await accounting_service.get_recurring_entries(db, False)
    return next(e for e in entries if e["id"] == entry.id)


@router.delete("/recurring/{entry_id}")
async def delete_recurring(entry_id: str, db: AsyncSession = Depends(get_db)):
    success = await accounting_service.delete_recurring_entry(db, entry_id)
    if not success:
        raise HTTPException(status_code=404, detail="Recurring entry not found")
    return {"message": "Recurring entry deactivated"}


@router.post("/recurring/generate")
async def generate_recurring(db: AsyncSession = Depends(get_db)):
    result = await accounting_service.generate_recurring_entries(db)
    return {"generated": result, "count": len(result)}


# ── Fiscal Periods ──

@router.get("/fiscal-periods", response_model=List[FiscalPeriodResponse])
async def list_fiscal_periods(db: AsyncSession = Depends(get_db)):
    return await accounting_service.get_fiscal_periods(db)


@router.post("/fiscal-periods", response_model=FiscalPeriodResponse, status_code=201)
async def create_fiscal_period(data: FiscalPeriodCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await accounting_service.create_fiscal_period(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fiscal-periods/{period_id}/close")
async def close_fiscal_period(period_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await accounting_service.close_fiscal_period(db, period_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fiscal-periods/{period_id}/reopen")
async def reopen_fiscal_period(period_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await accounting_service.reopen_fiscal_period(db, period_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fiscal-periods/generate")
async def generate_fiscal_periods(
    year: int = Query(...),
    start_month: int = Query(1, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
):
    generated = await accounting_service.generate_fiscal_periods(db, year, start_month)
    return {"generated": generated, "count": len(generated)}
