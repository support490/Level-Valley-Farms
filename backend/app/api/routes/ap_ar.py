from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from pydantic import BaseModel, Field

from app.db.database import get_db
from app.services import ap_ar_service

router = APIRouter(prefix="/accounting", tags=["ap-ar"])


# ── Schemas ──

class BillCreate(BaseModel):
    bill_number: str = Field(..., min_length=1)
    vendor_name: str = Field(..., min_length=1)
    vendor_id: Optional[str] = None
    bill_date: str
    due_date: str
    amount: float = Field(..., gt=0)
    description: Optional[str] = None
    flock_id: Optional[str] = None
    notes: Optional[str] = None


class BillPaymentCreate(BaseModel):
    payment_date: str
    amount: float = Field(..., gt=0)
    payment_method: str = "check"
    reference: Optional[str] = None
    notes: Optional[str] = None


class InvoiceCreate(BaseModel):
    buyer: str = Field(..., min_length=1)
    buyer_id: Optional[str] = None
    shipment_id: Optional[str] = None
    invoice_date: str
    due_date: str
    amount: float = Field(..., gt=0)
    description: Optional[str] = None
    notes: Optional[str] = None


class InvoicePayment(BaseModel):
    amount: float = Field(..., gt=0)


class BankAccountCreate(BaseModel):
    name: str = Field(..., min_length=1)
    account_number_last4: Optional[str] = None
    bank_name: Optional[str] = None
    account_type: str = "checking"
    balance: float = 0
    notes: Optional[str] = None


# ── Bills (AP) ──

@router.get("/bills")
async def list_bills(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_bills(db, status)


@router.post("/bills", status_code=201)
async def create_bill(data: BillCreate, db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.create_bill(db, data.model_dump())


@router.post("/bills/{bill_id}/pay")
async def pay_bill(bill_id: str, data: BillPaymentCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.record_bill_payment(db, bill_id, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Invoices (AR) ──

@router.get("/invoices")
async def list_invoices(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_invoices(db, status)


@router.post("/invoices", status_code=201)
async def create_invoice(data: InvoiceCreate, db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.create_invoice(db, data.model_dump())


@router.post("/invoices/from-shipment/{shipment_id}", status_code=201)
async def invoice_from_shipment(
    shipment_id: str,
    due_days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ap_ar_service.create_invoice_from_shipment(db, shipment_id, due_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/invoices/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, data: InvoicePayment, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.record_invoice_payment(db, invoice_id, data.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Aging Reports ──

@router.get("/aging/ap")
async def ap_aging(db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_ap_aging(db)


@router.get("/aging/ar")
async def ar_aging(db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_ar_aging(db)


# ── Bank Accounts ──

@router.get("/bank-accounts")
async def list_bank_accounts(db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_bank_accounts(db)


@router.post("/bank-accounts", status_code=201)
async def create_bank_account(data: BankAccountCreate, db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.create_bank_account(db, data.model_dump())


@router.put("/bank-accounts/{acct_id}")
async def update_bank_account(acct_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    result = await ap_ar_service.update_bank_account(db, acct_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return result


# ── Grower Payments ──

@router.get("/grower-payments")
async def grower_payments(db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.calculate_grower_payments(db)
