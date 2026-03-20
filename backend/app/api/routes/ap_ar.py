from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from decimal import Decimal
from datetime import date
from pydantic import BaseModel, Field

from app.db.database import get_db
from app.services import ap_ar_service
from app.services import email_service
from app.models.feed import Vendor, PurchaseOrder, PurchaseOrderLine, POStatus
from app.models.contracts import Buyer
from app.models.settings import AppSetting
from app.models.accounting import (
    Estimate, EstimateStatus, EstimateLineItem,
    CreditMemo, CreditMemoStatus, CreditMemoLineItem,
    BankReconciliation, ReconciliationStatus, ReconciliationItem,
    CustomerInvoice, InvoiceLineItem, InvoiceStatus,
    Bill, BillStatus, BillExpenseLine, BillItemLine,
    BankAccount, Check, CheckStatus, CheckExpenseLine, CheckItemLine,
    CustomerPayment, BillPayment,
    Account, JournalEntry, JournalLine,
    VendorCredit, VendorCreditStatus, VendorCreditExpenseLine,
    MemoizedTransaction, MemoizedTransactionType,
    SalesReceipt, SalesReceiptLineItem, SalesReceiptStatus,
    RefundReceipt, RefundReceiptLineItem, RefundReceiptStatus,
    CreditCardCharge, CreditCardChargeExpenseLine, CreditCardChargeStatus,
    CreditCardCredit, CreditCardCreditStatus,
    CustomerDepositModel, FinanceCharge, FinanceChargeStatus,
    InventoryAdjustment, InventoryAdjustmentStatus, AdjustmentType,
    FixedAsset, FixedAssetDepreciation,
    AssetCategory, DepreciationMethodEnum, DisposalMethod,
)
from app.models.base import generate_uuid
from app.services import fixed_asset_service
import json

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


# ── Print Views ──

async def _get_company_info(db: AsyncSession) -> dict:
    """Fetch company settings for print views."""
    import os
    keys = ['farm_name', 'company_address', 'company_phone', 'company_legal_name',
            'invoice_footer_message', 'invoice_payment_instructions']
    result = await db.execute(select(AppSetting).where(AppSetting.key.in_(keys)))
    settings = {s.key: s.value for s in result.scalars().all()}

    # Check if logo exists
    logo_url = None
    logo_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "static")
    for ext in ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']:
        if os.path.exists(os.path.join(logo_dir, f"company_logo.{ext}")):
            logo_url = "/settings/logo"
            break

    return {
        "name": settings.get('farm_name', 'Level Valley Farms'),
        "legal_name": settings.get('company_legal_name', ''),
        "address": settings.get('company_address', ''),
        "phone": settings.get('company_phone', ''),
        "logo_url": logo_url,
        "footer_message": settings.get('invoice_footer_message', ''),
        "payment_instructions": settings.get('invoice_payment_instructions', ''),
    }


@router.get("/invoices/{invoice_id}/print-view")
async def get_invoice_print_view(invoice_id: str, db: AsyncSession = Depends(get_db)):
    """Return all data needed for client-side invoice PDF rendering."""
    invoice = await db.get(CustomerInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Get line items
    lines_result = await db.execute(
        select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice.id)
    )
    line_items = [
        {
            "id": li.id,
            "item_description": li.item_description,
            "quantity": float(li.quantity),
            "unit_of_measure": li.unit_of_measure,
            "rate": float(li.rate),
            "amount": float(li.amount),
        }
        for li in lines_result.scalars().all()
    ]

    # Get buyer info
    buyer_info = None
    if invoice.buyer_id:
        buyer = await db.get(Buyer, invoice.buyer_id)
        if buyer:
            buyer_info = {
                "name": buyer.name,
                "company": buyer.company,
                "address": buyer.address or buyer.bill_to_address,
                "email": buyer.email,
                "phone": buyer.phone,
            }

    company = await _get_company_info(db)

    return {
        "company": company,
        "invoice": {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "buyer": invoice.buyer,
            "invoice_date": invoice.invoice_date,
            "due_date": invoice.due_date,
            "amount": float(invoice.amount),
            "amount_paid": float(invoice.amount_paid),
            "balance_due": float(invoice.amount - invoice.amount_paid),
            "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
            "description": invoice.description,
            "notes": invoice.notes,
            "ship_to_address": invoice.ship_to_address,
            "po_number": invoice.po_number,
            "terms": invoice.terms,
            "ship_date": invoice.ship_date,
            "ship_via": invoice.ship_via,
            "line_items": line_items,
        },
        "buyer": buyer_info,
        "footer_message": company["footer_message"],
        "payment_instructions": company["payment_instructions"],
    }


@router.get("/estimates/{estimate_id}/print-view")
async def get_estimate_print_view(estimate_id: str, db: AsyncSession = Depends(get_db)):
    """Return all data needed for client-side estimate PDF rendering."""
    estimate = await db.get(Estimate, estimate_id)
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")

    # Get line items
    lines_result = await db.execute(
        select(EstimateLineItem).where(EstimateLineItem.estimate_id == estimate.id)
    )
    line_items = [
        {
            "id": li.id,
            "item_description": li.item_description,
            "quantity": float(li.quantity),
            "unit_of_measure": li.unit_of_measure,
            "rate": float(li.rate),
            "amount": float(li.amount),
        }
        for li in lines_result.scalars().all()
    ]

    # Get buyer info
    buyer_info = None
    if estimate.buyer_id:
        buyer = await db.get(Buyer, estimate.buyer_id)
        if buyer:
            buyer_info = {
                "name": buyer.name,
                "company": buyer.company,
                "address": buyer.address or buyer.bill_to_address,
                "email": buyer.email,
                "phone": buyer.phone,
            }

    company = await _get_company_info(db)

    return {
        "company": company,
        "estimate": {
            "id": estimate.id,
            "estimate_number": estimate.estimate_number,
            "buyer": estimate.buyer,
            "estimate_date": estimate.estimate_date,
            "expiration_date": estimate.expiration_date,
            "amount": float(estimate.amount),
            "status": estimate.status.value if hasattr(estimate.status, "value") else estimate.status,
            "description": estimate.description,
            "notes": estimate.notes,
            "po_number": estimate.po_number,
            "terms": estimate.terms,
            "customer_message": estimate.customer_message,
            "line_items": line_items,
        },
        "buyer": buyer_info,
        "footer_message": company["footer_message"],
    }


@router.get("/checks/{check_id}/print-view")
async def get_check_print_view(check_id: str, db: AsyncSession = Depends(get_db)):
    """Return all data needed for client-side check PDF rendering."""
    check = await db.get(Check, check_id)
    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    # Get expense lines
    exp_result = await db.execute(
        select(CheckExpenseLine).where(CheckExpenseLine.check_id == check.id)
    )
    expense_lines = [
        {
            "id": el.id,
            "account_id": el.account_id,
            "amount": float(el.amount),
            "memo": el.memo,
        }
        for el in exp_result.scalars().all()
    ]

    # Get item lines
    item_result = await db.execute(
        select(CheckItemLine).where(CheckItemLine.check_id == check.id)
    )
    item_lines = [
        {
            "id": il.id,
            "item_description": il.item_description,
            "quantity": float(il.quantity),
            "cost": float(il.cost),
            "amount": float(il.amount),
        }
        for il in item_result.scalars().all()
    ]

    # Get vendor info if linked
    vendor_info = None
    if check.payee_vendor_id:
        vendor = await db.get(Vendor, check.payee_vendor_id)
        if vendor:
            vendor_info = {
                "name": vendor.name,
                "address": vendor.address if hasattr(vendor, 'address') else None,
            }

    company = await _get_company_info(db)

    return {
        "company": company,
        "check": {
            "id": check.id,
            "check_number": check.check_number,
            "payee_name": check.payee_name,
            "check_date": check.check_date,
            "amount": float(check.amount),
            "address": check.address,
            "memo": check.memo,
            "is_printed": check.is_printed,
            "is_voided": check.is_voided,
            "status": check.status.value if hasattr(check.status, "value") else check.status,
            "expense_lines": expense_lines,
            "item_lines": item_lines,
        },
        "vendor": vendor_info,
    }


# ── Email Invoice ──

@router.post("/invoices/{invoice_id}/email")
async def email_invoice(invoice_id: str, db: AsyncSession = Depends(get_db)):
    """Email an invoice to the linked buyer."""
    invoice = await db.get(CustomerInvoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Get buyer email
    if not invoice.buyer_id:
        raise HTTPException(status_code=400, detail="No buyer linked to invoice")

    buyer = await db.get(Buyer, invoice.buyer_id)
    if not buyer or not buyer.email:
        raise HTTPException(status_code=400, detail="Buyer has no email address")

    # Get company settings
    settings_result = await db.execute(select(AppSetting).where(
        AppSetting.key.in_(['farm_name', 'company_address', 'company_phone', 'invoice_footer_message'])
    ))
    settings = {s.key: s.value for s in settings_result.scalars().all()}

    farm_name = settings.get('farm_name', 'Level Valley Farms')
    subject = f"Invoice {invoice.invoice_number} from {farm_name}"
    body = f"""
    <h2>Invoice {invoice.invoice_number}</h2>
    <p>Amount Due: ${float(invoice.amount - invoice.amount_paid):.2f}</p>
    <p>Due Date: {invoice.due_date}</p>
    <p>{settings.get('invoice_footer_message', '')}</p>
    <p>{farm_name}</p>
    """

    try:
        await email_service.send_email(db, buyer.email, subject, body)
        return {"message": f"Invoice emailed to {buyer.email}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


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


class VendorCreditExpenseLineCreate(BaseModel):
    account_id: str
    amount: float
    memo: Optional[str] = None
    flock_id: Optional[str] = None


class VendorCreditCreate(BaseModel):
    credit_number: Optional[str] = None
    vendor_name: str = Field(..., min_length=1)
    vendor_id: Optional[str] = None
    credit_date: str
    amount: float = Field(..., gt=0)
    description: Optional[str] = None
    flock_id: Optional[str] = None
    notes: Optional[str] = None
    ref_no: Optional[str] = None
    expense_lines: List[VendorCreditExpenseLineCreate] = []


class VendorCreditApply(BaseModel):
    amount: float = Field(..., gt=0)


class ReconciliationStart(BaseModel):
    bank_account_id: str
    statement_date: str
    statement_ending_balance: float


class ItemReceiptLineCreate(BaseModel):
    item_description: str
    quantity: float = 1
    cost: float = 0
    amount: float
    account_id: Optional[str] = None
    flock_id: Optional[str] = None


class ItemReceiptCreate(BaseModel):
    receipt_number: Optional[str] = None
    vendor_name: str = Field(..., min_length=1)
    vendor_id: Optional[str] = None
    receipt_date: str
    total_amount: float = Field(..., gt=0)
    description: Optional[str] = None
    flock_id: Optional[str] = None
    notes: Optional[str] = None
    ref_no: Optional[str] = None
    lines: List[ItemReceiptLineCreate] = []


class ItemReceiptConvertCreate(BaseModel):
    bill_number: Optional[str] = None
    bill_date: Optional[str] = None
    due_date: Optional[str] = None


class FlockCloseoutCreate(BaseModel):
    closeout_date: str
    bird_sale_revenue: float = 0
    bird_sale_buyer: Optional[str] = None
    disposal_cost: float = 0
    remaining_feed_value: float = 0


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


# ── Vendor Credits (Bill Credits) ──

@router.get("/vendor-credits")
async def list_vendor_credits(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_vendor_credits(db, status)


@router.post("/vendor-credits", status_code=201)
async def create_vendor_credit(data: VendorCreditCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_vendor_credit(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/vendor-credits/{credit_id}/apply/{bill_id}")
async def apply_vendor_credit(credit_id: str, bill_id: str, data: VendorCreditApply, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.apply_vendor_credit_to_bill(db, credit_id, bill_id, data.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/vendor-credits/{credit_id}/void")
async def void_vendor_credit(credit_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.void_vendor_credit(db, credit_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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


# ── Item Receipts ──

@router.get("/item-receipts")
async def list_item_receipts(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_item_receipts(db, status)


@router.post("/item-receipts", status_code=201)
async def create_item_receipt(data: ItemReceiptCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_item_receipt(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/item-receipts/{receipt_id}/convert-to-bill")
async def convert_receipt_to_bill(
    receipt_id: str,
    data: ItemReceiptConvertCreate = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ap_ar_service.convert_receipt_to_bill(
            db, receipt_id, data.model_dump() if data else None
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Flock Closeout ──

@router.post("/flock-closeout/{flock_id}")
async def flock_closeout(flock_id: str, data: FlockCloseoutCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.execute_flock_closeout(db, flock_id, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Flock-Accounting Integration ──

class FlockBudgetEntry(BaseModel):
    category: str
    amount: float = Field(..., gt=0)
    notes: Optional[str] = None


class FlockBudgetCreate(BaseModel):
    budgets: List[FlockBudgetEntry]


class AllocateExpenseCreate(BaseModel):
    amount: float = Field(..., gt=0)
    description: str = Field(..., min_length=1)
    account_id: str
    allocation_method: str  # "bird_count", "equal", or "custom"
    flock_ids: List[str]
    custom_percentages: Optional[List[float]] = None
    expense_category: Optional[str] = None


@router.get("/suggest-flock")
async def suggest_flock_for_vendor(vendor_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    """Given a vendor_id, return flocks currently placed at that vendor's linked grower locations."""
    try:
        return await ap_ar_service.get_suggested_flocks_for_vendor(db, vendor_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/active-flocks")
async def get_active_flocks(db: AsyncSession = Depends(get_db)):
    """Return all active flocks with their current barn/grower info for dropdown lookups."""
    return await ap_ar_service.get_active_flocks_with_location(db)


@router.post("/bills/from-feed-delivery/{delivery_id}", status_code=201)
async def create_bill_from_feed_delivery(delivery_id: str, db: AsyncSession = Depends(get_db)):
    """Auto-create a bill from a feed delivery record."""
    try:
        return await ap_ar_service.create_bill_from_feed_delivery(db, delivery_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/flock-budget/{flock_id}")
async def get_flock_budget(flock_id: str, db: AsyncSession = Depends(get_db)):
    """Get all budget entries for a flock."""
    try:
        return await ap_ar_service.get_flock_budget(db, flock_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/flock-budget/{flock_id}", status_code=201)
async def create_flock_budget(flock_id: str, data: FlockBudgetCreate, db: AsyncSession = Depends(get_db)):
    """Create budget entries for a flock."""
    try:
        budgets = [b.model_dump() for b in data.budgets]
        return await ap_ar_service.create_flock_budget(db, flock_id, budgets)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/flock-budget-variance/{flock_id}")
async def get_flock_budget_variance(flock_id: str, db: AsyncSession = Depends(get_db)):
    """Compare actual expenses to budget by category for a flock."""
    try:
        return await ap_ar_service.get_flock_budget_variance(db, flock_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/allocate-expense", status_code=201)
async def allocate_expense(data: AllocateExpenseCreate, db: AsyncSession = Depends(get_db)):
    """Allocate a shared expense across multiple flocks."""
    try:
        return await ap_ar_service.allocate_expense(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/grower-settlement/{flock_id}")
async def get_grower_settlement(flock_id: str, db: AsyncSession = Depends(get_db)):
    """Preview the grower settlement calculation for a flock."""
    try:
        return await ap_ar_service.calculate_grower_settlement(db, flock_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/grower-settlement/{flock_id}", status_code=201)
async def execute_grower_settlement(flock_id: str, db: AsyncSession = Depends(get_db)):
    """Execute a grower settlement: calculate, create bill + JE."""
    try:
        return await ap_ar_service.execute_grower_settlement(db, flock_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Memorized Transactions (Templates) ──

class MemoizedTransactionCreate(BaseModel):
    name: str = Field(..., min_length=1)
    transaction_type: str  # "invoice", "bill", "check", "journal_entry", "sales_receipt"
    template_data: dict
    notes: Optional[str] = None


def _memoized_to_dict(mt: MemoizedTransaction) -> dict:
    return {
        "id": mt.id,
        "name": mt.name,
        "transaction_type": mt.transaction_type.value if hasattr(mt.transaction_type, 'value') else mt.transaction_type,
        "template_data": json.loads(mt.template_data) if isinstance(mt.template_data, str) else mt.template_data,
        "notes": mt.notes,
        "is_active": mt.is_active,
        "created_at": mt.created_at,
    }


@router.get("/memorized-transactions")
async def list_memorized_transactions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MemoizedTransaction)
        .where(MemoizedTransaction.is_active == True)
        .order_by(MemoizedTransaction.name)
    )
    return [_memoized_to_dict(mt) for mt in result.scalars().all()]


@router.post("/memorized-transactions", status_code=201)
async def create_memorized_transaction(data: MemoizedTransactionCreate, db: AsyncSession = Depends(get_db)):
    try:
        txn_type = MemoizedTransactionType(data.transaction_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid transaction type: {data.transaction_type}")

    mt = MemoizedTransaction(
        name=data.name,
        transaction_type=txn_type,
        template_data=json.dumps(data.template_data),
        notes=data.notes,
        is_active=True,
    )
    db.add(mt)
    await db.commit()
    await db.refresh(mt)
    return _memoized_to_dict(mt)


@router.delete("/memorized-transactions/{mt_id}")
async def delete_memorized_transaction(mt_id: str, db: AsyncSession = Depends(get_db)):
    mt = await db.get(MemoizedTransaction, mt_id)
    if not mt:
        raise HTTPException(status_code=404, detail="Memorized transaction not found")
    mt.is_active = False
    await db.commit()
    return {"message": "Memorized transaction deleted"}


@router.post("/memorized-transactions/{mt_id}/use", status_code=201)
async def use_memorized_transaction(mt_id: str, db: AsyncSession = Depends(get_db)):
    """Create an actual transaction from a memorized template."""
    mt = await db.get(MemoizedTransaction, mt_id)
    if not mt:
        raise HTTPException(status_code=404, detail="Memorized transaction not found")

    template = json.loads(mt.template_data) if isinstance(mt.template_data, str) else mt.template_data
    today_str = date.today().isoformat()

    if mt.transaction_type == MemoizedTransactionType.INVOICE:
        inv_number = await _next_invoice_number(db)
        invoice = CustomerInvoice(
            invoice_number=inv_number,
            buyer=template.get("buyer", ""),
            buyer_id=template.get("buyer_id"),
            invoice_date=today_str,
            due_date=template.get("due_date", today_str),
            amount=Decimal(str(template.get("amount", 0))),
            description=template.get("description"),
            notes=template.get("notes"),
            po_number=template.get("po_number"),
            terms=template.get("terms"),
            ship_to_address=template.get("ship_to_address"),
            customer_message=template.get("customer_message"),
            status=InvoiceStatus.DRAFT,
        )
        db.add(invoice)
        await db.flush()

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

        await db.commit()
        await db.refresh(invoice)
        return {
            "type": "invoice",
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "buyer": invoice.buyer,
            "amount": float(invoice.amount),
            "status": invoice.status.value,
        }

    elif mt.transaction_type == MemoizedTransactionType.BILL:
        bill_count_result = await db.execute(select(func.count(Bill.id)))
        bill_count = bill_count_result.scalar() or 0
        bill_number = f"BILL-{bill_count + 1:06d}"

        bill = Bill(
            bill_number=bill_number,
            vendor_name=template.get("vendor_name", ""),
            vendor_id=template.get("vendor_id"),
            bill_date=today_str,
            due_date=template.get("due_date", today_str),
            amount=Decimal(str(template.get("amount", 0))),
            description=template.get("description"),
            flock_id=template.get("flock_id"),
            notes=template.get("notes"),
            terms=template.get("terms"),
            status=BillStatus.RECEIVED,
        )
        db.add(bill)
        await db.flush()

        for el in template.get("expense_lines", []):
            line = BillExpenseLine(
                bill_id=bill.id,
                account_id=el.get("account_id", ""),
                amount=Decimal(str(el.get("amount", 0))),
                memo=el.get("memo"),
                flock_id=el.get("flock_id"),
            )
            db.add(line)

        await db.commit()
        await db.refresh(bill)
        return {
            "type": "bill",
            "id": bill.id,
            "bill_number": bill.bill_number,
            "vendor_name": bill.vendor_name,
            "amount": float(bill.amount),
            "status": bill.status.value,
        }

    elif mt.transaction_type == MemoizedTransactionType.CHECK:
        try:
            check_data = {
                "bank_account_id": template.get("bank_account_id", ""),
                "payee_name": template.get("payee_name", ""),
                "payee_vendor_id": template.get("payee_vendor_id"),
                "check_date": today_str,
                "amount": float(template.get("amount", 0)),
                "address": template.get("address"),
                "memo": template.get("memo"),
                "expense_lines": template.get("expense_lines", []),
                "item_lines": template.get("item_lines", []),
            }
            result = await ap_ar_service.create_check(db, check_data)
            return {"type": "check", **result}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    elif mt.transaction_type == MemoizedTransactionType.JOURNAL_ENTRY:
        entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
        entry_count = entry_count_result.scalar() or 0
        entry_number = f"JE-{entry_count + 1:06d}"

        je = JournalEntry(
            entry_number=entry_number,
            entry_date=today_str,
            description=template.get("description", ""),
            flock_id=template.get("flock_id"),
            reference=template.get("reference"),
            is_posted=False,
            notes=template.get("notes"),
        )
        db.add(je)
        await db.flush()

        for line in template.get("lines", []):
            jl = JournalLine(
                journal_entry_id=je.id,
                account_id=line.get("account_id", ""),
                debit=Decimal(str(line.get("debit", 0))),
                credit=Decimal(str(line.get("credit", 0))),
                description=line.get("description"),
            )
            db.add(jl)

        await db.commit()
        await db.refresh(je)
        return {
            "type": "journal_entry",
            "id": je.id,
            "entry_number": je.entry_number,
            "description": je.description,
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported transaction type: {mt.transaction_type}")


# ── Batch Invoicing ──

class BatchInvoiceItem(BaseModel):
    buyer: str = Field(..., min_length=1)
    buyer_id: Optional[str] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    amount: float = Field(..., gt=0)
    description: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    po_number: Optional[str] = None
    ship_to_address: Optional[str] = None
    customer_message: Optional[str] = None
    line_items: List[dict] = []


class BatchInvoiceCreate(BaseModel):
    invoices: List[BatchInvoiceItem]


@router.post("/batch/invoices", status_code=201)
async def batch_create_invoices(data: BatchInvoiceCreate, db: AsyncSession = Depends(get_db)):
    """Create multiple invoices at once (weekly egg invoicing)."""
    today_str = date.today().isoformat()
    created = []

    for inv_data in data.invoices:
        inv_number = await _next_invoice_number(db)
        invoice = CustomerInvoice(
            invoice_number=inv_number,
            buyer=inv_data.buyer,
            buyer_id=inv_data.buyer_id,
            invoice_date=inv_data.invoice_date or today_str,
            due_date=inv_data.due_date or today_str,
            amount=Decimal(str(inv_data.amount)),
            description=inv_data.description,
            notes=inv_data.notes,
            po_number=inv_data.po_number,
            terms=inv_data.terms,
            ship_to_address=inv_data.ship_to_address,
            customer_message=inv_data.customer_message,
            status=InvoiceStatus.DRAFT,
        )
        db.add(invoice)
        await db.flush()

        for li in inv_data.line_items:
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

        created.append({
            "id": invoice.id,
            "invoice_number": inv_number,
            "buyer": inv_data.buyer,
            "amount": inv_data.amount,
        })

    await db.commit()
    return {"created": created, "count": len(created)}


# ── Batch Void ──

class BatchVoidCreate(BaseModel):
    transaction_type: str  # "invoice", "bill", "check"
    ids: List[str]


@router.post("/batch/void")
async def batch_void_transactions(data: BatchVoidCreate, db: AsyncSession = Depends(get_db)):
    """Void multiple transactions of the same type."""
    voided = []
    errors = []

    for txn_id in data.ids:
        try:
            if data.transaction_type == "invoice":
                invoice = await db.get(CustomerInvoice, txn_id)
                if not invoice:
                    errors.append({"id": txn_id, "error": "Invoice not found"})
                    continue
                if invoice.status == InvoiceStatus.CANCELLED:
                    errors.append({"id": txn_id, "error": "Already cancelled"})
                    continue
                invoice.status = InvoiceStatus.CANCELLED
                voided.append({"id": txn_id, "type": "invoice", "number": invoice.invoice_number})

            elif data.transaction_type == "bill":
                bill = await db.get(Bill, txn_id)
                if not bill:
                    errors.append({"id": txn_id, "error": "Bill not found"})
                    continue
                if bill.status == BillStatus.CANCELLED:
                    errors.append({"id": txn_id, "error": "Already cancelled"})
                    continue
                bill.status = BillStatus.CANCELLED
                voided.append({"id": txn_id, "type": "bill", "number": bill.bill_number})

            elif data.transaction_type == "check":
                try:
                    result = await ap_ar_service.void_check(db, txn_id)
                    voided.append({"id": txn_id, "type": "check", "number": result.get("check_number")})
                except ValueError as e:
                    errors.append({"id": txn_id, "error": str(e)})
                    continue

            else:
                raise HTTPException(status_code=400, detail=f"Unsupported transaction type: {data.transaction_type}")

        except Exception as e:
            errors.append({"id": txn_id, "error": str(e)})

    await db.commit()
    return {
        "voided": voided,
        "voided_count": len(voided),
        "errors": errors,
        "error_count": len(errors),
    }


# ── Copy Transaction ──

@router.post("/copy/{transaction_type}/{txn_id}", status_code=201)
async def copy_transaction(transaction_type: str, txn_id: str, db: AsyncSession = Depends(get_db)):
    """Duplicate a transaction with new ID, number, today's date, and draft status."""
    today_str = date.today().isoformat()

    if transaction_type == "invoice":
        original = await db.get(CustomerInvoice, txn_id)
        if not original:
            raise HTTPException(status_code=404, detail="Invoice not found")

        inv_number = await _next_invoice_number(db)
        new_invoice = CustomerInvoice(
            invoice_number=inv_number,
            buyer=original.buyer,
            buyer_id=original.buyer_id,
            invoice_date=today_str,
            due_date=original.due_date,
            amount=original.amount,
            description=original.description,
            notes=original.notes,
            ship_to_address=original.ship_to_address,
            po_number=original.po_number,
            terms=original.terms,
            ship_date=None,
            ship_via=original.ship_via,
            customer_message=original.customer_message,
            status=InvoiceStatus.DRAFT,
        )
        db.add(new_invoice)
        await db.flush()

        # Copy line items
        lines_result = await db.execute(
            select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == original.id)
        )
        for li in lines_result.scalars().all():
            new_line = InvoiceLineItem(
                invoice_id=new_invoice.id,
                item_description=li.item_description,
                quantity=li.quantity,
                unit_of_measure=li.unit_of_measure,
                rate=li.rate,
                amount=li.amount,
                account_id=li.account_id,
                flock_id=li.flock_id,
            )
            db.add(new_line)

        await db.commit()
        await db.refresh(new_invoice)

        # Load new line items for response
        new_lines_result = await db.execute(
            select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == new_invoice.id)
        )
        line_items = [
            {
                "id": li.id, "item_description": li.item_description,
                "quantity": float(li.quantity), "unit_of_measure": li.unit_of_measure,
                "rate": float(li.rate), "amount": float(li.amount),
                "account_id": li.account_id, "flock_id": li.flock_id,
            }
            for li in new_lines_result.scalars().all()
        ]

        return {
            "type": "invoice",
            "id": new_invoice.id,
            "invoice_number": new_invoice.invoice_number,
            "buyer": new_invoice.buyer,
            "buyer_id": new_invoice.buyer_id,
            "invoice_date": new_invoice.invoice_date,
            "due_date": new_invoice.due_date,
            "amount": float(new_invoice.amount),
            "status": new_invoice.status.value,
            "description": new_invoice.description,
            "notes": new_invoice.notes,
            "terms": new_invoice.terms,
            "line_items": line_items,
            "copied_from": original.id,
            "copied_from_number": original.invoice_number,
        }

    elif transaction_type == "bill":
        original = await db.get(Bill, txn_id)
        if not original:
            raise HTTPException(status_code=404, detail="Bill not found")

        bill_count_result = await db.execute(select(func.count(Bill.id)))
        bill_count = bill_count_result.scalar() or 0
        bill_number = f"BILL-{bill_count + 1:06d}"

        new_bill = Bill(
            bill_number=bill_number,
            vendor_name=original.vendor_name,
            vendor_id=original.vendor_id,
            bill_date=today_str,
            due_date=original.due_date,
            amount=original.amount,
            description=original.description,
            flock_id=original.flock_id,
            notes=original.notes,
            terms=original.terms,
            ref_no=None,
            status=BillStatus.RECEIVED,
        )
        db.add(new_bill)
        await db.flush()

        # Copy expense lines
        exp_result = await db.execute(
            select(BillExpenseLine).where(BillExpenseLine.bill_id == original.id)
        )
        for el in exp_result.scalars().all():
            new_line = BillExpenseLine(
                bill_id=new_bill.id,
                account_id=el.account_id,
                amount=el.amount,
                memo=el.memo,
                flock_id=el.flock_id,
            )
            db.add(new_line)

        # Copy item lines
        item_result = await db.execute(
            select(BillItemLine).where(BillItemLine.bill_id == original.id)
        )
        for il in item_result.scalars().all():
            new_line = BillItemLine(
                bill_id=new_bill.id,
                item_description=il.item_description,
                quantity=il.quantity,
                cost=il.cost,
                amount=il.amount,
                flock_id=il.flock_id,
            )
            db.add(new_line)

        await db.commit()
        await db.refresh(new_bill)
        return {
            "type": "bill",
            "id": new_bill.id,
            "bill_number": new_bill.bill_number,
            "vendor_name": new_bill.vendor_name,
            "vendor_id": new_bill.vendor_id,
            "bill_date": new_bill.bill_date,
            "due_date": new_bill.due_date,
            "amount": float(new_bill.amount),
            "status": new_bill.status.value,
            "description": new_bill.description,
            "notes": new_bill.notes,
            "copied_from": original.id,
            "copied_from_number": original.bill_number,
        }

    elif transaction_type == "check":
        original = await db.get(Check, txn_id)
        if not original:
            raise HTTPException(status_code=404, detail="Check not found")

        # Load expense and item lines from the original
        exp_result = await db.execute(
            select(CheckExpenseLine).where(CheckExpenseLine.check_id == original.id)
        )
        expense_lines = [
            {
                "account_id": el.account_id,
                "amount": float(el.amount),
                "memo": el.memo,
                "flock_id": el.flock_id,
            }
            for el in exp_result.scalars().all()
        ]

        item_result = await db.execute(
            select(CheckItemLine).where(CheckItemLine.check_id == original.id)
        )
        item_lines = [
            {
                "item_description": il.item_description,
                "quantity": float(il.quantity),
                "cost": float(il.cost),
                "amount": float(il.amount),
                "flock_id": il.flock_id,
            }
            for il in item_result.scalars().all()
        ]

        try:
            check_data = {
                "bank_account_id": original.bank_account_id,
                "payee_name": original.payee_name,
                "payee_vendor_id": original.payee_vendor_id,
                "check_date": today_str,
                "amount": float(original.amount),
                "address": original.address,
                "memo": original.memo,
                "expense_lines": expense_lines,
                "item_lines": item_lines,
            }
            result = await ap_ar_service.create_check(db, check_data)
            result["type"] = "check"
            result["copied_from"] = original.id
            result["copied_from_number"] = original.check_number
            return result
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    elif transaction_type == "estimate":
        original = await db.get(Estimate, txn_id)
        if not original:
            raise HTTPException(status_code=404, detail="Estimate not found")

        est_number = await _next_estimate_number(db)
        new_estimate = Estimate(
            estimate_number=est_number,
            buyer=original.buyer,
            buyer_id=original.buyer_id,
            estimate_date=today_str,
            expiration_date=original.expiration_date,
            amount=original.amount,
            description=original.description,
            notes=original.notes,
            po_number=original.po_number,
            terms=original.terms,
            customer_message=original.customer_message,
            status=EstimateStatus.DRAFT,
        )
        db.add(new_estimate)
        await db.flush()

        # Copy line items
        lines_result = await db.execute(
            select(EstimateLineItem).where(EstimateLineItem.estimate_id == original.id)
        )
        for li in lines_result.scalars().all():
            new_line = EstimateLineItem(
                estimate_id=new_estimate.id,
                item_description=li.item_description,
                quantity=li.quantity,
                unit_of_measure=li.unit_of_measure,
                rate=li.rate,
                amount=li.amount,
                account_id=li.account_id,
            )
            db.add(new_line)

        await db.commit()
        await db.refresh(new_estimate)

        new_lines_result = await db.execute(
            select(EstimateLineItem).where(EstimateLineItem.estimate_id == new_estimate.id)
        )
        line_items = [
            {
                "id": li.id, "item_description": li.item_description,
                "quantity": float(li.quantity), "unit_of_measure": li.unit_of_measure,
                "rate": float(li.rate), "amount": float(li.amount),
                "account_id": li.account_id,
            }
            for li in new_lines_result.scalars().all()
        ]

        return {
            "type": "estimate",
            "id": new_estimate.id,
            "estimate_number": new_estimate.estimate_number,
            "buyer": new_estimate.buyer,
            "buyer_id": new_estimate.buyer_id,
            "estimate_date": new_estimate.estimate_date,
            "amount": float(new_estimate.amount),
            "status": new_estimate.status.value,
            "description": new_estimate.description,
            "notes": new_estimate.notes,
            "line_items": line_items,
            "copied_from": original.id,
            "copied_from_number": original.estimate_number,
        }

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported transaction type: {transaction_type}. Use invoice, bill, check, or estimate.",
        )


# ── Tier 2: Sales Receipts ──

class SalesReceiptLineCreate(BaseModel):
    item_description: str
    quantity: float = 1
    rate: float = 0
    amount: float
    flock_id: Optional[str] = None


class SalesReceiptCreate(BaseModel):
    customer_name: str = Field(..., min_length=1)
    customer_id: Optional[str] = None
    receipt_date: str
    payment_method: str = "cash"
    amount: float = Field(..., gt=0)
    deposit_to_account_id: Optional[str] = None
    memo: Optional[str] = None
    flock_id: Optional[str] = None
    line_items: List[SalesReceiptLineCreate] = []


@router.get("/sales-receipts")
async def list_sales_receipts(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_sales_receipts(db, status)


@router.post("/sales-receipts", status_code=201)
async def create_sales_receipt(data: SalesReceiptCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_sales_receipt(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sales-receipts/{receipt_id}/void")
async def void_sales_receipt(receipt_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.void_sales_receipt(db, receipt_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Tier 2: Refund Receipts ──

class RefundReceiptLineCreate(BaseModel):
    item_description: str
    quantity: float = 1
    rate: float = 0
    amount: float


class RefundReceiptCreate(BaseModel):
    customer_name: str = Field(..., min_length=1)
    customer_id: Optional[str] = None
    refund_date: str
    refund_method: str = "cash"
    amount: float = Field(..., gt=0)
    refund_from_account_id: Optional[str] = None
    memo: Optional[str] = None
    original_receipt_id: Optional[str] = None
    line_items: List[RefundReceiptLineCreate] = []


@router.get("/refund-receipts")
async def list_refund_receipts(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_refund_receipts(db, status)


@router.post("/refund-receipts", status_code=201)
async def create_refund_receipt(data: RefundReceiptCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_refund_receipt(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refund-receipts/{receipt_id}/void")
async def void_refund_receipt(receipt_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.void_refund_receipt(db, receipt_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Tier 2: Credit Card Charges ──

class CCChargeExpenseLineCreate(BaseModel):
    account_id: str
    amount: float
    memo: Optional[str] = None
    flock_id: Optional[str] = None


class CCChargeCreate(BaseModel):
    credit_card_account_id: str
    vendor_name: str = Field(..., min_length=1)
    vendor_id: Optional[str] = None
    charge_date: str
    amount: float = Field(..., gt=0)
    memo: Optional[str] = None
    flock_id: Optional[str] = None
    expense_lines: List[CCChargeExpenseLineCreate] = []


@router.get("/cc-charges")
async def list_cc_charges(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_cc_charges(db, status)


@router.post("/cc-charges", status_code=201)
async def create_cc_charge(data: CCChargeCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_cc_charge(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cc-charges/{charge_id}/void")
async def void_cc_charge(charge_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.void_cc_charge(db, charge_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Tier 2: Credit Card Credits ──

class CCCreditCreate(BaseModel):
    credit_card_account_id: str
    vendor_name: str = Field(..., min_length=1)
    charge_date: str
    amount: float = Field(..., gt=0)
    memo: Optional[str] = None
    expense_account_id: Optional[str] = None


@router.get("/cc-credits")
async def list_cc_credits(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_cc_credits(db, status)


@router.post("/cc-credits", status_code=201)
async def create_cc_credit(data: CCCreditCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_cc_credit(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Tier 2: Customer Deposits ──

class CustomerDepositCreate(BaseModel):
    customer_name: str = Field(..., min_length=1)
    customer_id: Optional[str] = None
    deposit_date: str
    amount: float = Field(..., gt=0)
    deposit_to_account_id: Optional[str] = None
    payment_method: str = "check"
    memo: Optional[str] = None


@router.get("/customer-deposits")
async def list_customer_deposits(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_customer_deposits(db, status)


@router.post("/customer-deposits", status_code=201)
async def create_customer_deposit(data: CustomerDepositCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_customer_deposit(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/customer-deposits/{deposit_id}/apply/{invoice_id}")
async def apply_customer_deposit(deposit_id: str, invoice_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.apply_customer_deposit(db, deposit_id, invoice_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Tier 2: Finance Charges ──

@router.get("/finance-charges")
async def list_finance_charges(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_finance_charges(db, status)


@router.post("/finance-charges/assess", status_code=201)
async def assess_finance_charges(
    rate: float = Query(..., description="Annual interest rate (e.g., 18 for 18%)"),
    grace_days: int = Query(30, description="Grace period in days after due date"),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ap_ar_service.assess_finance_charges(db, rate, grace_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/finance-charges/{charge_id}/waive")
async def waive_finance_charge(charge_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.waive_finance_charge(db, charge_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Tier 2: Inventory Adjustments ──

class InventoryAdjustmentCreate(BaseModel):
    adjustment_date: str
    adjustment_type: str  # "increase" or "decrease"
    account_id: str  # Inventory adjustment account
    quantity: float = Field(..., gt=0)
    unit_value: float = Field(..., gt=0)
    reason: Optional[str] = None
    flock_id: Optional[str] = None


@router.get("/inventory-adjustments")
async def list_inventory_adjustments(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    return await ap_ar_service.get_inventory_adjustments(db, status)


@router.post("/inventory-adjustments", status_code=201)
async def create_inventory_adjustment(data: InventoryAdjustmentCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.create_inventory_adjustment(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/inventory-adjustments/{adjustment_id}/void")
async def void_inventory_adjustment(adjustment_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await ap_ar_service.void_inventory_adjustment(db, adjustment_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ══════════════════════════════════════════════════
# Fixed Assets — Farm Equipment & Property
# ══════════════════════════════════════════════════

class FixedAssetCreate(BaseModel):
    asset_number: Optional[str] = None
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    category: str  # machinery, vehicles, buildings, equipment, land_improvements, other
    acquisition_date: str
    acquisition_cost: float = Field(..., gt=0)
    salvage_value: float = 0
    useful_life_years: int = Field(..., gt=0)
    depreciation_method: str  # straight_line, declining_balance, macrs_3, macrs_5, macrs_7, macrs_10, macrs_15
    location: Optional[str] = None
    flock_id: Optional[str] = None
    serial_number: Optional[str] = None
    vendor_name: Optional[str] = None
    notes: Optional[str] = None


class FixedAssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    acquisition_date: Optional[str] = None
    acquisition_cost: Optional[float] = None
    salvage_value: Optional[float] = None
    useful_life_years: Optional[int] = None
    depreciation_method: Optional[str] = None
    location: Optional[str] = None
    flock_id: Optional[str] = None
    serial_number: Optional[str] = None
    vendor_name: Optional[str] = None
    notes: Optional[str] = None


class FixedAssetDispose(BaseModel):
    disposal_date: str
    disposal_amount: float = 0
    disposal_method: str = "sold"  # sold, scrapped, traded


# NOTE: /summary must come BEFORE /{asset_id} to avoid path collision

@router.get("/fixed-assets/summary")
async def fixed_assets_summary(db: AsyncSession = Depends(get_db)):
    return await fixed_asset_service.get_summary(db)


@router.get("/fixed-assets")
async def list_fixed_assets(
    category: Optional[str] = Query(None),
    is_disposed: Optional[bool] = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    return await fixed_asset_service.get_fixed_assets(db, category, is_disposed, active_only)


@router.post("/fixed-assets", status_code=201)
async def create_fixed_asset(data: FixedAssetCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await fixed_asset_service.create_fixed_asset(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/fixed-assets/{asset_id}")
async def get_fixed_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    result = await fixed_asset_service.get_fixed_asset(db, asset_id)
    if not result:
        raise HTTPException(status_code=404, detail="Fixed asset not found")
    return result


@router.put("/fixed-assets/{asset_id}")
async def update_fixed_asset(asset_id: str, data: FixedAssetUpdate, db: AsyncSession = Depends(get_db)):
    try:
        result = await fixed_asset_service.update_fixed_asset(db, asset_id, data.model_dump(exclude_none=True))
        if not result:
            raise HTTPException(status_code=404, detail="Fixed asset not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fixed-assets/{asset_id}/dispose")
async def dispose_fixed_asset(asset_id: str, data: FixedAssetDispose, db: AsyncSession = Depends(get_db)):
    try:
        return await fixed_asset_service.dispose_asset(db, asset_id, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fixed-assets/{asset_id}/depreciate")
async def depreciate_fixed_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await fixed_asset_service.depreciate_asset(db, asset_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fixed-assets/depreciate-all")
async def depreciate_all_fixed_assets(db: AsyncSession = Depends(get_db)):
    try:
        return await fixed_asset_service.depreciate_all(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
