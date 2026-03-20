from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from decimal import Decimal
from datetime import date
from pydantic import BaseModel, Field

from app.db.database import get_db
from app.services import ap_ar_service
from app.models.feed import Vendor, PurchaseOrder, PurchaseOrderLine, POStatus
from app.models.contracts import Buyer
from app.models.accounting import (
    Estimate, EstimateStatus, EstimateLineItem,
    CreditMemo, CreditMemoStatus, CreditMemoLineItem,
    BankReconciliation, ReconciliationStatus, ReconciliationItem,
    CustomerInvoice, InvoiceLineItem, InvoiceStatus,
    Bill, BillStatus, BillExpenseLine,
    BankAccount, Check,
    CustomerPayment, BillPayment,
    Account, JournalEntry, JournalLine,
)
from app.models.base import generate_uuid

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


class CheckExpenseLineCreate(BaseModel):
    account_id: str
    amount: float
    memo: Optional[str] = None
    flock_id: Optional[str] = None


class CheckItemLineCreate(BaseModel):
    item_description: str
    quantity: float = 1
    cost: float = 0
    amount: float
    flock_id: Optional[str] = None


class CheckCreate(BaseModel):
    bank_account_id: str
    check_number: Optional[int] = None
    payee_name: str
    payee_vendor_id: Optional[str] = None
    check_date: str
    amount: float = Field(..., gt=0)
    address: Optional[str] = None
    memo: Optional[str] = None
    expense_lines: List[CheckExpenseLineCreate]
    item_lines: List[CheckItemLineCreate] = []


class DepositLineCreate(BaseModel):
    received_from: Optional[str] = None
    from_account_id: Optional[str] = None
    memo: Optional[str] = None
    check_no: Optional[str] = None
    amount: float = Field(..., gt=0)


class DepositCreate(BaseModel):
    deposit_date: str
    memo: Optional[str] = None
    deposit_lines: List[DepositLineCreate]
    cash_back_account_id: Optional[str] = None
    cash_back_amount: float = 0
    total: float = Field(..., gt=0)


class TransferCreate(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: float = Field(..., gt=0)
    transfer_date: str
    memo: Optional[str] = None


class ItemCreatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    item_type: str = "Service"
    income_account: Optional[str] = None
    expense_account: Optional[str] = None
    price: float = 0
    cost: float = 0
    is_active: bool = True


class BillBatchPayCreate(BaseModel):
    bill_ids: List[str]
    payment_date: str
    payment_method: str = "check"
    bank_account_id: str


class CustomerPaymentApplicationCreate(BaseModel):
    invoice_id: str
    amount_applied: float = Field(..., gt=0)


class ReceivePaymentCreate(BaseModel):
    customer_name: str
    buyer_id: Optional[str] = None
    payment_date: str
    amount: float = Field(..., gt=0)
    reference: Optional[str] = None
    payment_method: str = "check"
    deposit_to_account_id: Optional[str] = None
    memo: Optional[str] = None
    applications: List[CustomerPaymentApplicationCreate]


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


# ── Checks ──

@router.post("/checks", status_code=201)
async def create_check(data: CheckCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_check(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/checks")
async def list_checks(
    bank_account_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await ap_ar_service.get_checks(db, bank_account_id, status)


@router.post("/checks/{check_id}/void")
async def void_check(check_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.void_check(db, check_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/checks/{check_id}/print")
async def print_check(
    check_id: str,
    check_number: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ap_ar_service.mark_check_printed(db, check_id, check_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Batch Bill Payment ──

@router.post("/bills/pay-batch")
async def pay_bills_batch(data: BillBatchPayCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.pay_bills_batch(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Receive Payment ──

@router.post("/payments/receive", status_code=201)
async def receive_payment(data: ReceivePaymentCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_customer_payment(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Bank Register ──

@router.get("/bank-register/{bank_account_id}")
async def bank_register(bank_account_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.get_bank_register(db, bank_account_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Undeposited Funds ──

@router.get("/undeposited-funds")
async def get_undeposited_funds(db: AsyncSession = Depends(get_db)):
    """Query journal lines on Undeposited Funds (1015) to find payments not yet deposited."""
    # Find the Undeposited Funds account
    acct_result = await db.execute(
        select(Account).where(Account.account_number == "1015")
    )
    uf_account = acct_result.scalar_one_or_none()
    if not uf_account:
        return {"balance": 0, "items": []}

    # Get all journal lines on this account with their journal entries
    lines_result = await db.execute(
        select(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalLine.account_id == uf_account.id,
            JournalEntry.is_posted == True,
        )
        .order_by(JournalEntry.entry_date)
    )

    # Debits to UF = funds received but not deposited
    # Credits to UF = funds deposited (clearing)
    items = []
    for jl, je in lines_result.all():
        net = float(jl.debit) - float(jl.credit)
        if net > 0:  # Only show net debit lines (undeposited)
            items.append({
                "id": jl.id,
                "date": je.entry_date,
                "description": jl.description or je.description,
                "reference": je.reference,
                "amount": net,
                "journal_entry_id": je.id,
                "entry_number": je.entry_number,
            })

    balance = float(uf_account.balance) if uf_account.balance else 0
    return {"balance": balance, "items": items}


# ── Deposits ──

@router.post("/bank-accounts/{bank_account_id}/deposit", status_code=201)
async def make_deposit(bank_account_id: str, data: DepositCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_deposit(db, bank_account_id, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Transfers ──

@router.post("/transfers", status_code=201)
async def transfer_funds(data: TransferCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_transfer(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Items CRUD ──

@router.get("/items")
async def list_items(db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_items(db)


@router.post("/items", status_code=201)
async def create_item(data: ItemCreatePayload, db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.create_item(db, data.model_dump())


@router.put("/items/{item_id}")
async def update_item(item_id: str, data: ItemCreatePayload, db: AsyncSession = Depends(get_db)):
    result = await ap_ar_service.update_item(db, item_id, data.model_dump())
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return result


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await ap_ar_service.delete_item(db, item_id)
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return result


# ── Vendor CRUD ──

class VendorCreatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    terms: Optional[str] = "Net 30"
    tax_id: Optional[str] = None
    is_1099: Optional[bool] = False
    vendor_type: Optional[str] = "other"
    contact_name: Optional[str] = None
    notes: Optional[str] = None


@router.get("/vendors")
async def list_vendors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vendor).order_by(Vendor.name))
    vendors = result.scalars().all()
    return [
        {
            "id": v.id, "name": v.name, "address": v.address or "",
            "phone": v.phone or "", "email": v.email or "",
            "contact_name": v.contact_name or "", "vendor_type": v.vendor_type,
            "notes": v.notes or "", "is_active": v.is_active,
            "fax": v.fax or "", "website": v.website or "",
            "terms": v.terms or "Net 30", "tax_id": v.tax_id or "",
            "is_1099": v.is_1099 if v.is_1099 is not None else False,
        }
        for v in vendors
    ]


@router.post("/vendors")
async def create_vendor(payload: VendorCreatePayload, db: AsyncSession = Depends(get_db)):
    vendor = Vendor(
        name=payload.name,
        address=payload.address,
        phone=payload.phone,
        email=payload.email,
        contact_name=payload.contact_name,
        vendor_type=payload.vendor_type or "other",
        notes=payload.notes,
        fax=payload.fax,
        website=payload.website,
        terms=payload.terms,
        tax_id=payload.tax_id,
        is_1099=payload.is_1099 or False,
    )
    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)
    return {"id": vendor.id, "name": vendor.name}


@router.put("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, payload: VendorCreatePayload, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for field in ["name", "address", "phone", "email", "contact_name", "vendor_type", "notes",
                   "fax", "website", "terms", "tax_id"]:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(vendor, field, val)
    if payload.is_1099 is not None:
        vendor.is_1099 = payload.is_1099
    await db.commit()
    return {"id": vendor.id, "name": vendor.name}


@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    await db.delete(vendor)
    await db.commit()
    return {"ok": True}


# ── Buyer/Customer CRUD ──

class BuyerCreatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    company: Optional[str] = None
    bill_to_address: Optional[str] = None
    ship_to_address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    terms: Optional[str] = "Net 30"
    credit_limit: Optional[float] = None
    contact_name: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


@router.get("/buyers")
async def list_buyers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Buyer).order_by(Buyer.name))
    buyers = result.scalars().all()
    return [
        {
            "id": b.id, "name": b.name, "address": b.address or "",
            "phone": b.phone or "", "email": b.email or "",
            "contact_name": b.contact_name or "", "notes": b.notes or "",
            "is_active": b.is_active,
            "company": b.company or "", "bill_to_address": b.bill_to_address or "",
            "ship_to_address": b.ship_to_address or "",
            "terms": b.terms or "Net 30",
            "credit_limit": float(b.credit_limit) if b.credit_limit is not None else None,
        }
        for b in buyers
    ]


@router.post("/buyers")
async def create_buyer(payload: BuyerCreatePayload, db: AsyncSession = Depends(get_db)):
    buyer = Buyer(
        name=payload.name,
        contact_name=payload.contact_name or payload.company,
        phone=payload.phone,
        email=payload.email,
        address=payload.bill_to_address or payload.address,
        notes=payload.notes,
        company=payload.company,
        bill_to_address=payload.bill_to_address,
        ship_to_address=payload.ship_to_address,
        terms=payload.terms,
        credit_limit=Decimal(str(payload.credit_limit)) if payload.credit_limit is not None else None,
    )
    db.add(buyer)
    await db.commit()
    await db.refresh(buyer)
    return {"id": buyer.id, "name": buyer.name}


@router.put("/buyers/{buyer_id}")
async def update_buyer(buyer_id: str, payload: BuyerCreatePayload, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Buyer).where(Buyer.id == buyer_id))
    buyer = result.scalar_one_or_none()
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")
    for field in ["name", "phone", "email", "notes", "company", "bill_to_address",
                   "ship_to_address", "terms"]:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(buyer, field, val)
    if payload.contact_name or payload.company:
        buyer.contact_name = payload.contact_name or payload.company
    if payload.bill_to_address or payload.address:
        buyer.address = payload.bill_to_address or payload.address
    if payload.credit_limit is not None:
        buyer.credit_limit = Decimal(str(payload.credit_limit))
    await db.commit()
    return {"id": buyer.id, "name": buyer.name}


@router.delete("/buyers/{buyer_id}")
async def delete_buyer(buyer_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Buyer).where(Buyer.id == buyer_id))
    buyer = result.scalar_one_or_none()
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")
    await db.delete(buyer)
    await db.commit()
    return {"ok": True}


# ── New Schemas ──

class EstimateLineCreate(BaseModel):
    item_description: str
    quantity: float = 1
    unit_of_measure: Optional[str] = None
    rate: float = 0
    amount: float
    account_id: Optional[str] = None


class EstimateCreate(BaseModel):
    buyer: str = Field(..., min_length=1)
    buyer_id: Optional[str] = None
    estimate_date: str
    expiration_date: Optional[str] = None
    amount: float = Field(..., gt=0)
    description: Optional[str] = None
    notes: Optional[str] = None
    po_number: Optional[str] = None
    terms: Optional[str] = None
    customer_message: Optional[str] = None
    line_items: List[EstimateLineCreate] = []


class CreditMemoLineCreate(BaseModel):
    item_description: str
    quantity: float = 1
    rate: float = 0
    amount: float


class CreditMemoCreate(BaseModel):
    buyer: str = Field(..., min_length=1)
    buyer_id: Optional[str] = None
    memo_date: str
    amount: float = Field(..., gt=0)
    reason: Optional[str] = None
    notes: Optional[str] = None
    line_items: List[CreditMemoLineCreate] = []


class ReconciliationStart(BaseModel):
    bank_account_id: str
    statement_date: str
    statement_ending_balance: float


# ── Helper: auto-number generators ──

async def _next_estimate_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(Estimate.id)))
    count = result.scalar() or 0
    return f"EST-{count + 1:06d}"


async def _next_memo_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(CreditMemo.id)))
    count = result.scalar() or 0
    return f"CM-{count + 1:06d}"


async def _next_invoice_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(CustomerInvoice.id)))
    count = result.scalar() or 0
    return f"INV-{count + 1:06d}"


# ── Helper: serializers ──

def _estimate_to_dict(est: Estimate, line_items: list) -> dict:
    return {
        "id": est.id,
        "estimate_number": est.estimate_number,
        "buyer": est.buyer,
        "buyer_id": est.buyer_id,
        "estimate_date": est.estimate_date,
        "expiration_date": est.expiration_date,
        "amount": float(est.amount),
        "status": est.status.value if hasattr(est.status, "value") else est.status,
        "description": est.description,
        "notes": est.notes,
        "po_number": est.po_number,
        "terms": est.terms,
        "customer_message": est.customer_message,
        "converted_invoice_id": est.converted_invoice_id,
        "line_items": line_items,
        "created_at": est.created_at,
    }


def _credit_memo_to_dict(cm: CreditMemo, line_items: list) -> dict:
    return {
        "id": cm.id,
        "memo_number": cm.memo_number,
        "buyer": cm.buyer,
        "buyer_id": cm.buyer_id,
        "memo_date": cm.memo_date,
        "amount": float(cm.amount),
        "status": cm.status.value if hasattr(cm.status, "value") else cm.status,
        "reason": cm.reason,
        "notes": cm.notes,
        "applied_to_invoice_id": cm.applied_to_invoice_id,
        "line_items": line_items,
        "created_at": cm.created_at,
    }


# ── Estimates ──

@router.get("/estimates")
async def list_estimates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Estimate).order_by(Estimate.estimate_date.desc()))
    estimates = result.scalars().all()
    out = []
    for est in estimates:
        lines_result = await db.execute(
            select(EstimateLineItem).where(EstimateLineItem.estimate_id == est.id)
        )
        line_items = [
            {
                "id": li.id, "item_description": li.item_description,
                "quantity": float(li.quantity), "unit_of_measure": li.unit_of_measure,
                "rate": float(li.rate), "amount": float(li.amount),
                "account_id": li.account_id,
            }
            for li in lines_result.scalars().all()
        ]
        out.append(_estimate_to_dict(est, line_items))
    return out


@router.post("/estimates", status_code=201)
async def create_estimate(data: EstimateCreate, db: AsyncSession = Depends(get_db)):
    estimate_number = await _next_estimate_number(db)
    estimate = Estimate(
        estimate_number=estimate_number,
        buyer=data.buyer,
        buyer_id=data.buyer_id,
        estimate_date=data.estimate_date,
        expiration_date=data.expiration_date,
        amount=Decimal(str(data.amount)),
        description=data.description,
        notes=data.notes,
        po_number=data.po_number,
        terms=data.terms,
        customer_message=data.customer_message,
        status=EstimateStatus.DRAFT,
    )
    db.add(estimate)
    await db.flush()

    line_items_out = []
    for li in data.line_items:
        line = EstimateLineItem(
            estimate_id=estimate.id,
            item_description=li.item_description,
            quantity=Decimal(str(li.quantity)),
            unit_of_measure=li.unit_of_measure,
            rate=Decimal(str(li.rate)),
            amount=Decimal(str(li.amount)),
            account_id=li.account_id,
        )
        db.add(line)
        await db.flush()
        line_items_out.append({
            "id": line.id, "item_description": line.item_description,
            "quantity": float(line.quantity), "unit_of_measure": line.unit_of_measure,
            "rate": float(line.rate), "amount": float(line.amount),
            "account_id": line.account_id,
        })

    await db.commit()
    await db.refresh(estimate)
    return _estimate_to_dict(estimate, line_items_out)


@router.put("/estimates/{estimate_id}/status")
async def update_estimate_status(estimate_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    estimate = await db.get(Estimate, estimate_id)
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="status is required")
    try:
        estimate.status = EstimateStatus(new_status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")
    await db.commit()
    await db.refresh(estimate)
    lines_result = await db.execute(
        select(EstimateLineItem).where(EstimateLineItem.estimate_id == estimate.id)
    )
    line_items = [
        {
            "id": li.id, "item_description": li.item_description,
            "quantity": float(li.quantity), "unit_of_measure": li.unit_of_measure,
            "rate": float(li.rate), "amount": float(li.amount),
            "account_id": li.account_id,
        }
        for li in lines_result.scalars().all()
    ]
    return _estimate_to_dict(estimate, line_items)


@router.post("/estimates/{estimate_id}/convert")
async def convert_estimate_to_invoice(estimate_id: str, db: AsyncSession = Depends(get_db)):
    estimate = await db.get(Estimate, estimate_id)
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    if estimate.status == EstimateStatus.CONVERTED:
        raise HTTPException(status_code=400, detail="Estimate already converted")

    invoice_number = await _next_invoice_number(db)
    today_str = date.today().isoformat()

    invoice = CustomerInvoice(
        invoice_number=invoice_number,
        buyer=estimate.buyer,
        buyer_id=estimate.buyer_id,
        invoice_date=today_str,
        due_date=today_str,  # caller can update later
        amount=estimate.amount,
        description=estimate.description,
        notes=estimate.notes,
        po_number=estimate.po_number,
        terms=estimate.terms,
        customer_message=estimate.customer_message,
        status=InvoiceStatus.DRAFT,
    )
    db.add(invoice)
    await db.flush()

    # Copy line items
    est_lines_result = await db.execute(
        select(EstimateLineItem).where(EstimateLineItem.estimate_id == estimate.id)
    )
    for eli in est_lines_result.scalars().all():
        inv_line = InvoiceLineItem(
            invoice_id=invoice.id,
            item_description=eli.item_description,
            quantity=eli.quantity,
            unit_of_measure=eli.unit_of_measure,
            rate=eli.rate,
            amount=eli.amount,
            account_id=eli.account_id,
        )
        db.add(inv_line)

    estimate.status = EstimateStatus.CONVERTED
    estimate.converted_invoice_id = invoice.id

    await db.commit()
    await db.refresh(invoice)
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "buyer": invoice.buyer,
        "amount": float(invoice.amount),
        "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        "estimate_id": estimate.id,
        "estimate_number": estimate.estimate_number,
    }


# ── Credit Memos ──

@router.get("/credit-memos")
async def list_credit_memos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CreditMemo).order_by(CreditMemo.memo_date.desc()))
    memos = result.scalars().all()
    out = []
    for cm in memos:
        lines_result = await db.execute(
            select(CreditMemoLineItem).where(CreditMemoLineItem.credit_memo_id == cm.id)
        )
        line_items = [
            {
                "id": li.id, "item_description": li.item_description,
                "quantity": float(li.quantity), "rate": float(li.rate),
                "amount": float(li.amount),
            }
            for li in lines_result.scalars().all()
        ]
        out.append(_credit_memo_to_dict(cm, line_items))
    return out


@router.post("/credit-memos", status_code=201)
async def create_credit_memo(data: CreditMemoCreate, db: AsyncSession = Depends(get_db)):
    memo_number = await _next_memo_number(db)
    memo = CreditMemo(
        memo_number=memo_number,
        buyer=data.buyer,
        buyer_id=data.buyer_id,
        memo_date=data.memo_date,
        amount=Decimal(str(data.amount)),
        reason=data.reason,
        notes=data.notes,
        status=CreditMemoStatus.DRAFT,
    )
    db.add(memo)
    await db.flush()

    line_items_out = []
    for li in data.line_items:
        line = CreditMemoLineItem(
            credit_memo_id=memo.id,
            item_description=li.item_description,
            quantity=Decimal(str(li.quantity)),
            rate=Decimal(str(li.rate)),
            amount=Decimal(str(li.amount)),
        )
        db.add(line)
        await db.flush()
        line_items_out.append({
            "id": line.id, "item_description": line.item_description,
            "quantity": float(line.quantity), "rate": float(line.rate),
            "amount": float(line.amount),
        })

    await db.commit()
    await db.refresh(memo)
    return _credit_memo_to_dict(memo, line_items_out)


@router.post("/credit-memos/{memo_id}/apply/{invoice_id}")
async def apply_credit_memo(memo_id: str, invoice_id: str, db: AsyncSession = Depends(get_db)):
    memo = await db.get(CreditMemo, memo_id)
    if not memo:
        raise HTTPException(status_code=404, detail="Credit memo not found")
    if memo.status == CreditMemoStatus.APPLIED:
        raise HTTPException(status_code=400, detail="Credit memo already applied")
    if memo.status == CreditMemoStatus.VOIDED:
        raise HTTPException(status_code=400, detail="Credit memo is voided")

    invoice = await db.get(CustomerInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Reduce the invoice balance by the credit memo amount
    credit_amount = memo.amount
    invoice.amount_paid = invoice.amount_paid + credit_amount
    if invoice.amount_paid >= invoice.amount:
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIAL

    memo.status = CreditMemoStatus.APPLIED
    memo.applied_to_invoice_id = invoice_id

    await db.commit()
    return {
        "memo_id": memo.id,
        "memo_number": memo.memo_number,
        "applied_to_invoice_id": invoice_id,
        "applied_to_invoice_number": invoice.invoice_number,
        "credit_amount": float(credit_amount),
        "invoice_new_balance": float(invoice.amount - invoice.amount_paid),
    }


@router.post("/credit-memos/{memo_id}/void")
async def void_credit_memo(memo_id: str, db: AsyncSession = Depends(get_db)):
    memo = await db.get(CreditMemo, memo_id)
    if not memo:
        raise HTTPException(status_code=404, detail="Credit memo not found")
    if memo.status == CreditMemoStatus.VOIDED:
        raise HTTPException(status_code=400, detail="Credit memo already voided")

    memo.status = CreditMemoStatus.VOIDED
    await db.commit()
    await db.refresh(memo)
    lines_result = await db.execute(
        select(CreditMemoLineItem).where(CreditMemoLineItem.credit_memo_id == memo.id)
    )
    line_items = [
        {
            "id": li.id, "item_description": li.item_description,
            "quantity": float(li.quantity), "rate": float(li.rate),
            "amount": float(li.amount),
        }
        for li in lines_result.scalars().all()
    ]
    return _credit_memo_to_dict(memo, line_items)


# ── Purchase Orders ──

@router.get("/purchase-orders")
async def list_purchase_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PurchaseOrder).order_by(PurchaseOrder.order_date.desc())
    )
    pos = result.scalars().all()
    out = []
    for po in pos:
        vendor = await db.get(Vendor, po.vendor_id) if po.vendor_id else None
        lines_result = await db.execute(
            select(PurchaseOrderLine).where(PurchaseOrderLine.po_id == po.id)
        )
        lines = [
            {
                "id": line.id, "description": line.description,
                "quantity": float(line.quantity), "unit": line.unit,
                "unit_price": float(line.unit_price) if line.unit_price else 0,
                "total": float(line.total) if line.total else 0,
                "notes": line.notes,
            }
            for line in lines_result.scalars().all()
        ]
        out.append({
            "id": po.id,
            "po_number": po.po_number,
            "vendor_id": po.vendor_id,
            "vendor_name": vendor.name if vendor else "",
            "order_date": po.order_date,
            "expected_date": po.expected_date,
            "status": po.status.value if hasattr(po.status, "value") else po.status,
            "total_amount": float(po.total_amount) if po.total_amount else 0,
            "notes": po.notes,
            "lines": lines,
            "created_at": po.created_at,
        })
    return out


@router.post("/purchase-orders/{po_id}/convert-to-bill")
async def convert_po_to_bill(po_id: str, db: AsyncSession = Depends(get_db)):
    po = await db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status == POStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Cannot convert a cancelled PO")

    vendor = await db.get(Vendor, po.vendor_id) if po.vendor_id else None

    # Auto-generate bill number
    bill_count_result = await db.execute(select(func.count(Bill.id)))
    bill_count = bill_count_result.scalar() or 0
    bill_number = f"BILL-{bill_count + 1:06d}"

    today_str = date.today().isoformat()

    bill = Bill(
        bill_number=bill_number,
        vendor_name=vendor.name if vendor else "Unknown",
        vendor_id=po.vendor_id,
        bill_date=today_str,
        due_date=today_str,  # caller can update
        amount=po.total_amount or Decimal("0"),
        description=f"From PO {po.po_number}",
        notes=po.notes,
        ref_no=po.po_number,
        status=BillStatus.RECEIVED,
    )
    db.add(bill)
    await db.flush()

    # Copy PO lines as bill expense lines
    po_lines_result = await db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.po_id == po.id)
    )
    for pol in po_lines_result.scalars().all():
        line_amount = pol.total or (pol.quantity * (pol.unit_price or Decimal("0")))
        bill_line = BillExpenseLine(
            bill_id=bill.id,
            account_id="",  # caller should update with proper account
            amount=line_amount,
            memo=pol.description,
        )
        db.add(bill_line)

    # Mark PO as received
    po.status = POStatus.RECEIVED

    await db.commit()
    await db.refresh(bill)
    return {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "vendor_name": bill.vendor_name,
        "amount": float(bill.amount),
        "status": bill.status.value if hasattr(bill.status, "value") else bill.status,
        "po_id": po.id,
        "po_number": po.po_number,
    }


# ── Bank Reconciliation ──

@router.post("/reconciliation/start", status_code=201)
async def start_reconciliation(data: ReconciliationStart, db: AsyncSession = Depends(get_db)):
    bank_account = await db.get(BankAccount, data.bank_account_id)
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank account not found")

    # Get beginning balance from last completed reconciliation
    last_recon_result = await db.execute(
        select(BankReconciliation)
        .where(
            BankReconciliation.bank_account_id == data.bank_account_id,
            BankReconciliation.status == ReconciliationStatus.COMPLETED,
        )
        .order_by(BankReconciliation.statement_date.desc())
        .limit(1)
    )
    last_recon = last_recon_result.scalar_one_or_none()
    beginning_balance = last_recon.statement_ending_balance if last_recon else Decimal("0.00")

    recon = BankReconciliation(
        bank_account_id=data.bank_account_id,
        statement_date=data.statement_date,
        statement_ending_balance=Decimal(str(data.statement_ending_balance)),
        beginning_balance=beginning_balance,
        status=ReconciliationStatus.IN_PROGRESS,
    )
    db.add(recon)
    await db.flush()

    # Pull uncleared checks for this bank account
    checks_result = await db.execute(
        select(Check).where(
            Check.bank_account_id == data.bank_account_id,
            Check.is_voided == False,
        ).order_by(Check.check_date)
    )
    for chk in checks_result.scalars().all():
        item = ReconciliationItem(
            reconciliation_id=recon.id,
            transaction_type="CHK",
            transaction_id=chk.id,
            transaction_date=chk.check_date,
            amount=-abs(chk.amount),  # checks are withdrawals
            is_cleared=False,
        )
        db.add(item)

    # Pull bill payments for this bank account
    bp_result = await db.execute(
        select(BillPayment).where(
            BillPayment.bank_account_id == data.bank_account_id,
        ).order_by(BillPayment.payment_date)
    )
    for bp in bp_result.scalars().all():
        item = ReconciliationItem(
            reconciliation_id=recon.id,
            transaction_type="BILL PMT",
            transaction_id=bp.id,
            transaction_date=bp.payment_date,
            amount=-abs(bp.amount),
            is_cleared=False,
        )
        db.add(item)

    # Pull customer payments (deposits) to this bank account
    cp_result = await db.execute(
        select(CustomerPayment).where(
            CustomerPayment.deposit_to_account_id == data.bank_account_id,
        ).order_by(CustomerPayment.payment_date)
    )
    for cp in cp_result.scalars().all():
        item = ReconciliationItem(
            reconciliation_id=recon.id,
            transaction_type="DEP",
            transaction_id=cp.id,
            transaction_date=cp.payment_date,
            amount=abs(cp.amount),  # deposits are positive
            is_cleared=False,
        )
        db.add(item)

    # Calculate initial difference
    recon.difference = recon.statement_ending_balance - beginning_balance

    await db.commit()
    await db.refresh(recon)

    # Load items for response
    items_result = await db.execute(
        select(ReconciliationItem).where(ReconciliationItem.reconciliation_id == recon.id)
    )
    items = [
        {
            "id": ri.id, "transaction_type": ri.transaction_type,
            "transaction_id": ri.transaction_id, "transaction_date": ri.transaction_date,
            "amount": float(ri.amount), "is_cleared": ri.is_cleared,
        }
        for ri in items_result.scalars().all()
    ]

    return {
        "id": recon.id,
        "bank_account_id": recon.bank_account_id,
        "bank_account_name": bank_account.name,
        "statement_date": recon.statement_date,
        "statement_ending_balance": float(recon.statement_ending_balance),
        "beginning_balance": float(recon.beginning_balance),
        "status": recon.status.value,
        "difference": float(recon.difference),
        "items": items,
    }


@router.get("/reconciliation/history/{bank_account_id}")
async def reconciliation_history(bank_account_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BankReconciliation)
        .where(BankReconciliation.bank_account_id == bank_account_id)
        .order_by(BankReconciliation.statement_date.desc())
    )
    recons = result.scalars().all()
    return [
        {
            "id": r.id,
            "statement_date": r.statement_date,
            "statement_ending_balance": float(r.statement_ending_balance),
            "beginning_balance": float(r.beginning_balance),
            "status": r.status.value if hasattr(r.status, "value") else r.status,
            "completed_date": r.completed_date,
            "difference": float(r.difference),
            "notes": r.notes,
            "created_at": r.created_at,
        }
        for r in recons
    ]


@router.get("/reconciliation/{recon_id}")
async def get_reconciliation(recon_id: str, db: AsyncSession = Depends(get_db)):
    recon = await db.get(BankReconciliation, recon_id)
    if not recon:
        raise HTTPException(status_code=404, detail="Reconciliation not found")

    bank_account = await db.get(BankAccount, recon.bank_account_id)

    items_result = await db.execute(
        select(ReconciliationItem)
        .where(ReconciliationItem.reconciliation_id == recon.id)
        .order_by(ReconciliationItem.transaction_date)
    )
    items = [
        {
            "id": ri.id, "transaction_type": ri.transaction_type,
            "transaction_id": ri.transaction_id, "transaction_date": ri.transaction_date,
            "amount": float(ri.amount), "is_cleared": ri.is_cleared,
        }
        for ri in items_result.scalars().all()
    ]

    # Recalculate difference: beginning + cleared = should equal statement ending
    cleared_total = sum(i["amount"] for i in items if i["is_cleared"])
    calculated_balance = float(recon.beginning_balance) + cleared_total
    difference = float(recon.statement_ending_balance) - calculated_balance

    return {
        "id": recon.id,
        "bank_account_id": recon.bank_account_id,
        "bank_account_name": bank_account.name if bank_account else "",
        "statement_date": recon.statement_date,
        "statement_ending_balance": float(recon.statement_ending_balance),
        "beginning_balance": float(recon.beginning_balance),
        "status": recon.status.value if hasattr(recon.status, "value") else recon.status,
        "completed_date": recon.completed_date,
        "difference": round(difference, 2),
        "cleared_total": round(cleared_total, 2),
        "calculated_balance": round(calculated_balance, 2),
        "notes": recon.notes,
        "items": items,
    }


@router.put("/reconciliation/{recon_id}/toggle/{item_id}")
async def toggle_reconciliation_item(recon_id: str, item_id: str, db: AsyncSession = Depends(get_db)):
    recon = await db.get(BankReconciliation, recon_id)
    if not recon:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.status == ReconciliationStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Reconciliation already completed")

    item = await db.get(ReconciliationItem, item_id)
    if not item or item.reconciliation_id != recon_id:
        raise HTTPException(status_code=404, detail="Reconciliation item not found")

    item.is_cleared = not item.is_cleared

    # Recalculate difference
    items_result = await db.execute(
        select(ReconciliationItem).where(ReconciliationItem.reconciliation_id == recon.id)
    )
    cleared_total = Decimal("0")
    for ri in items_result.scalars().all():
        if ri.is_cleared:
            cleared_total += ri.amount

    calculated_balance = recon.beginning_balance + cleared_total
    recon.difference = recon.statement_ending_balance - calculated_balance

    await db.commit()
    return {
        "item_id": item.id,
        "is_cleared": item.is_cleared,
        "difference": float(recon.difference),
    }


@router.post("/reconciliation/{recon_id}/finish")
async def finish_reconciliation(recon_id: str, db: AsyncSession = Depends(get_db)):
    recon = await db.get(BankReconciliation, recon_id)
    if not recon:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    if recon.status == ReconciliationStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Reconciliation already completed")

    # Validate difference is zero
    items_result = await db.execute(
        select(ReconciliationItem).where(ReconciliationItem.reconciliation_id == recon.id)
    )
    cleared_total = Decimal("0")
    for ri in items_result.scalars().all():
        if ri.is_cleared:
            cleared_total += ri.amount

    calculated_balance = recon.beginning_balance + cleared_total
    difference = recon.statement_ending_balance - calculated_balance

    if abs(difference) > Decimal("0.01"):
        raise HTTPException(
            status_code=400,
            detail=f"Difference must be $0.00 to finish. Current difference: ${float(difference):.2f}",
        )

    recon.status = ReconciliationStatus.COMPLETED
    recon.completed_date = date.today().isoformat()
    recon.difference = Decimal("0.00")

    await db.commit()
    await db.refresh(recon)
    return {
        "id": recon.id,
        "status": recon.status.value,
        "completed_date": recon.completed_date,
        "statement_ending_balance": float(recon.statement_ending_balance),
    }
