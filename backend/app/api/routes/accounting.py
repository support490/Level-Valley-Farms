from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date
from decimal import Decimal
import json

from app.db.database import get_db
from app.schemas.accounting import (
    AccountCreate, AccountUpdate, AccountResponse,
    JournalEntryCreate, JournalEntryResponse, JournalEntryUpdate,
    QuickExpenseCreate, TrialBalanceResponse, AccountLedgerEntry,
    RecurringEntryCreate, RecurringEntryUpdate, RecurringEntryResponse,
    FiscalPeriodCreate, FiscalPeriodResponse,
)
from app.services import accounting_service
from app.models.accounting import (
    RecurringTransaction, RecurringTransactionType, RecurringFrequency,
    CustomerInvoice, InvoiceStatus, Bill, BillStatus,
    Check, CheckStatus, CheckExpenseLine, CheckItemLine,
    InvoiceLineItem, BillExpenseLine, BillItemLine,
    BankAccount, Account, AccountType,
    JournalEntry, JournalLine,
)
from app.models.base import generate_uuid
from app.services import ap_ar_service

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
        result = next((e for e in entries if e["id"] == entry.id), None)
        if not result:
            raise HTTPException(status_code=500, detail="Entry created but not found in response")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/recurring/{entry_id}", response_model=RecurringEntryResponse)
async def update_recurring(entry_id: str, data: RecurringEntryUpdate, db: AsyncSession = Depends(get_db)):
    entry = await accounting_service.update_recurring_entry(db, entry_id, data)
    if not entry:
        raise HTTPException(status_code=404, detail="Recurring entry not found")
    entries = await accounting_service.get_recurring_entries(db, False)
    result = next((e for e in entries if e["id"] == entry.id), None)
    if not result:
        raise HTTPException(status_code=500, detail="Entry updated but not found in response")
    return result


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


# ── Recurring Transactions (Invoices/Bills/Checks) ──

class RecurringTransactionCreate(BaseModel):
    name: str = Field(..., min_length=1)
    transaction_type: str  # "invoice", "bill", "check"
    frequency: str  # "weekly", "biweekly", "monthly", "quarterly", "annually"
    template_data: dict  # JSON blob storing the full transaction template
    customer_or_vendor_name: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    flock_id: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    next_due_date: Optional[str] = None
    notes: Optional[str] = None


class RecurringTransactionUpdate(BaseModel):
    name: Optional[str] = None
    frequency: Optional[str] = None
    template_data: Optional[dict] = None
    customer_or_vendor_name: Optional[str] = None
    amount: Optional[float] = None
    flock_id: Optional[str] = None
    end_date: Optional[str] = None
    next_due_date: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


def _recurring_txn_to_dict(rt: RecurringTransaction) -> dict:
    return {
        "id": rt.id,
        "name": rt.name,
        "transaction_type": rt.transaction_type.value if hasattr(rt.transaction_type, 'value') else rt.transaction_type,
        "frequency": rt.frequency.value if hasattr(rt.frequency, 'value') else rt.frequency,
        "template_data": json.loads(rt.template_data) if isinstance(rt.template_data, str) else rt.template_data,
        "customer_or_vendor_name": rt.customer_or_vendor_name,
        "amount": float(rt.amount),
        "flock_id": rt.flock_id,
        "start_date": rt.start_date,
        "end_date": rt.end_date,
        "next_due_date": rt.next_due_date,
        "last_generated_date": rt.last_generated_date,
        "is_active": rt.is_active,
        "notes": rt.notes,
        "created_at": rt.created_at,
    }


@router.get("/recurring-transactions")
async def list_recurring_transactions(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    query = select(RecurringTransaction).order_by(RecurringTransaction.next_due_date)
    if active_only:
        query = query.where(RecurringTransaction.is_active == True)
    result = await db.execute(query)
    return [_recurring_txn_to_dict(rt) for rt in result.scalars().all()]


@router.post("/recurring-transactions", status_code=201)
async def create_recurring_transaction(data: RecurringTransactionCreate, db: AsyncSession = Depends(get_db)):
    try:
        txn_type = RecurringTransactionType(data.transaction_type)
        freq = RecurringFrequency(data.frequency)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    rt = RecurringTransaction(
        name=data.name,
        transaction_type=txn_type,
        frequency=freq,
        template_data=json.dumps(data.template_data),
        customer_or_vendor_name=data.customer_or_vendor_name,
        amount=Decimal(str(data.amount)),
        flock_id=data.flock_id,
        start_date=data.start_date,
        end_date=data.end_date,
        next_due_date=data.next_due_date or data.start_date,
        is_active=True,
        notes=data.notes,
    )
    db.add(rt)
    await db.commit()
    await db.refresh(rt)
    return _recurring_txn_to_dict(rt)


@router.put("/recurring-transactions/{rt_id}")
async def update_recurring_transaction(rt_id: str, data: RecurringTransactionUpdate, db: AsyncSession = Depends(get_db)):
    rt = await db.get(RecurringTransaction, rt_id)
    if not rt:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")

    if data.name is not None:
        rt.name = data.name
    if data.frequency is not None:
        try:
            rt.frequency = RecurringFrequency(data.frequency)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid frequency: {data.frequency}")
    if data.template_data is not None:
        rt.template_data = json.dumps(data.template_data)
    if data.customer_or_vendor_name is not None:
        rt.customer_or_vendor_name = data.customer_or_vendor_name
    if data.amount is not None:
        rt.amount = Decimal(str(data.amount))
    if data.flock_id is not None:
        rt.flock_id = data.flock_id
    if data.end_date is not None:
        rt.end_date = data.end_date
    if data.next_due_date is not None:
        rt.next_due_date = data.next_due_date
    if data.is_active is not None:
        rt.is_active = data.is_active
    if data.notes is not None:
        rt.notes = data.notes

    await db.commit()
    await db.refresh(rt)
    return _recurring_txn_to_dict(rt)


@router.delete("/recurring-transactions/{rt_id}")
async def delete_recurring_transaction(rt_id: str, db: AsyncSession = Depends(get_db)):
    rt = await db.get(RecurringTransaction, rt_id)
    if not rt:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")
    rt.is_active = False
    await db.commit()
    return {"message": "Recurring transaction deactivated"}


def _advance_due_date(current_date_str: str, frequency: RecurringFrequency) -> str:
    """Calculate the next due date based on frequency."""
    from datetime import timedelta
    import calendar
    current = date.fromisoformat(current_date_str)
    if frequency == RecurringFrequency.WEEKLY:
        next_date = current + timedelta(weeks=1)
    elif frequency == RecurringFrequency.BIWEEKLY:
        next_date = current + timedelta(weeks=2)
    elif frequency == RecurringFrequency.MONTHLY:
        month = current.month % 12 + 1
        year = current.year + (1 if current.month == 12 else 0)
        day = min(current.day, calendar.monthrange(year, month)[1])
        next_date = date(year, month, day)
    elif frequency == RecurringFrequency.QUARTERLY:
        month = current.month + 3
        year = current.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(current.day, calendar.monthrange(year, month)[1])
        next_date = date(year, month, day)
    elif frequency == RecurringFrequency.ANNUALLY:
        year = current.year + 1
        day = min(current.day, calendar.monthrange(year, current.month)[1])
        next_date = date(year, current.month, day)
    else:
        month = current.month % 12 + 1
        year = current.year + (1 if current.month == 12 else 0)
        day = min(current.day, calendar.monthrange(year, month)[1])
        next_date = date(year, month, day)
    return next_date.isoformat()


@router.post("/recurring-transactions/generate")
async def generate_recurring_transactions(db: AsyncSession = Depends(get_db)):
    """Auto-generate any due transactions from recurring templates."""
    today_str = date.today().isoformat()
    result = await db.execute(
        select(RecurringTransaction).where(
            RecurringTransaction.is_active == True,
            RecurringTransaction.next_due_date <= today_str,
        )
    )
    recurring_txns = result.scalars().all()
    generated_count = 0
    generated_ids = []

    for rt in recurring_txns:
        # Skip if past end_date
        if rt.end_date and rt.next_due_date > rt.end_date:
            rt.is_active = False
            continue

        template = json.loads(rt.template_data) if isinstance(rt.template_data, str) else rt.template_data

        if rt.transaction_type == RecurringTransactionType.INVOICE:
            # Create invoice from template
            inv_number = await ap_ar_service._next_invoice_number(db)
            invoice = CustomerInvoice(
                invoice_number=inv_number,
                buyer=template.get("buyer", rt.customer_or_vendor_name),
                buyer_id=template.get("buyer_id"),
                invoice_date=rt.next_due_date,
                due_date=template.get("due_date", rt.next_due_date),
                amount=rt.amount,
                description=template.get("description", f"Recurring: {rt.name}"),
                notes=template.get("notes"),
                po_number=template.get("po_number"),
                terms=template.get("terms"),
                ship_to_address=template.get("ship_to_address"),
                customer_message=template.get("customer_message"),
                status=InvoiceStatus.DRAFT,
            )
            db.add(invoice)
            await db.flush()

            # Add line items if present in template
            for li in template.get("line_items", []):
                line = InvoiceLineItem(
                    invoice_id=invoice.id,
                    item_description=li.get("item_description", ""),
                    quantity=Decimal(str(li.get("quantity", 1))),
                    unit_of_measure=li.get("unit_of_measure"),
                    rate=Decimal(str(li.get("rate", 0))),
                    amount=Decimal(str(li.get("amount", 0))),
                    account_id=li.get("account_id"),
                    flock_id=li.get("flock_id"),
                )
                db.add(line)

            generated_ids.append({"type": "invoice", "id": invoice.id, "number": inv_number})

        elif rt.transaction_type == RecurringTransactionType.BILL:
            # Create bill from template
            from sqlalchemy import func as sqla_func
            bill_count_result = await db.execute(select(sqla_func.count(Bill.id)))
            bill_count = bill_count_result.scalar() or 0
            bill_number = template.get("bill_number", f"BILL-{bill_count + 1:06d}")

            bill = Bill(
                bill_number=bill_number,
                vendor_name=template.get("vendor_name", rt.customer_or_vendor_name),
                vendor_id=template.get("vendor_id"),
                bill_date=rt.next_due_date,
                due_date=template.get("due_date", rt.next_due_date),
                amount=rt.amount,
                description=template.get("description", f"Recurring: {rt.name}"),
                flock_id=rt.flock_id or template.get("flock_id"),
                notes=template.get("notes"),
                terms=template.get("terms"),
                status=BillStatus.RECEIVED,
            )
            db.add(bill)
            await db.flush()

            # Add expense lines if present
            for el in template.get("expense_lines", []):
                line = BillExpenseLine(
                    bill_id=bill.id,
                    account_id=el.get("account_id", ""),
                    amount=Decimal(str(el.get("amount", 0))),
                    memo=el.get("memo"),
                    flock_id=el.get("flock_id"),
                )
                db.add(line)

            generated_ids.append({"type": "bill", "id": bill.id, "number": bill_number})

        elif rt.transaction_type == RecurringTransactionType.CHECK:
            # Create check from template using the service
            try:
                check_data = {
                    "bank_account_id": template.get("bank_account_id", ""),
                    "payee_name": template.get("payee_name", rt.customer_or_vendor_name),
                    "payee_vendor_id": template.get("payee_vendor_id"),
                    "check_date": rt.next_due_date,
                    "amount": float(rt.amount),
                    "address": template.get("address"),
                    "memo": template.get("memo", f"Recurring: {rt.name}"),
                    "expense_lines": template.get("expense_lines", []),
                    "item_lines": template.get("item_lines", []),
                }
                check_result = await ap_ar_service.create_check(db, check_data)
                generated_ids.append({"type": "check", "id": check_result["id"], "number": check_result.get("check_number")})
            except ValueError:
                # Skip if check creation fails (e.g. missing bank account)
                continue

        # Advance to next due date
        rt.last_generated_date = rt.next_due_date
        rt.next_due_date = _advance_due_date(rt.next_due_date, rt.frequency)

        # Deactivate if past end_date
        if rt.end_date and rt.next_due_date > rt.end_date:
            rt.is_active = False

        generated_count += 1

    await db.commit()
    return {"generated": generated_ids, "count": generated_count}
