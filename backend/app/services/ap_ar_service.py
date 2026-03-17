from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from datetime import date, timedelta
from typing import Optional

from app.models.accounting import (
    Bill, BillPayment, BillStatus, PaymentMethod,
    CustomerInvoice, InvoiceStatus, BankAccount,
)
from app.models.logistics import Shipment, ShipmentLine
from app.models.farm import Grower, Barn, FlockPlacement
from app.models.flock import Flock


# ── Auto-numbers ──

async def _next_invoice_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(CustomerInvoice.id)))
    count = result.scalar() or 0
    return f"INV-{count + 1:06d}"


# ── Bills (AP) ──

async def create_bill(db: AsyncSession, data: dict):
    bill = Bill(
        bill_number=data["bill_number"],
        vendor_name=data["vendor_name"],
        vendor_id=data.get("vendor_id"),
        bill_date=data["bill_date"],
        due_date=data["due_date"],
        amount=Decimal(str(data["amount"])),
        description=data.get("description"),
        flock_id=data.get("flock_id"),
        notes=data.get("notes"),
    )
    db.add(bill)
    await db.commit()
    await db.refresh(bill)
    return await _bill_to_dict(db, bill)


async def get_bills(db: AsyncSession, status: str = None):
    query = select(Bill).order_by(Bill.due_date.desc())
    if status:
        query = query.where(Bill.status == status)
    result = await db.execute(query)
    return [await _bill_to_dict(db, b) for b in result.scalars().all()]


async def record_bill_payment(db: AsyncSession, bill_id: str, data: dict):
    bill = await db.get(Bill, bill_id)
    if not bill:
        raise ValueError("Bill not found")

    payment = BillPayment(
        bill_id=bill_id,
        payment_date=data["payment_date"],
        amount=Decimal(str(data["amount"])),
        payment_method=PaymentMethod(data.get("payment_method", "check")),
        reference=data.get("reference"),
        notes=data.get("notes"),
    )
    db.add(payment)

    bill.amount_paid = bill.amount_paid + Decimal(str(data["amount"]))
    if bill.amount_paid >= bill.amount:
        bill.status = BillStatus.PAID
    else:
        bill.status = BillStatus.PARTIAL

    await db.commit()
    return await _bill_to_dict(db, bill)


async def _bill_to_dict(db: AsyncSession, bill: Bill) -> dict:
    payments_result = await db.execute(
        select(BillPayment).where(BillPayment.bill_id == bill.id).order_by(BillPayment.payment_date)
    )
    payments = [{
        "id": p.id, "payment_date": p.payment_date,
        "amount": float(p.amount),
        "payment_method": p.payment_method.value if hasattr(p.payment_method, 'value') else p.payment_method,
        "reference": p.reference, "notes": p.notes,
    } for p in payments_result.scalars().all()]

    return {
        "id": bill.id, "bill_number": bill.bill_number,
        "vendor_name": bill.vendor_name, "vendor_id": bill.vendor_id,
        "bill_date": bill.bill_date, "due_date": bill.due_date,
        "amount": float(bill.amount), "amount_paid": float(bill.amount_paid),
        "balance_due": float(bill.amount - bill.amount_paid),
        "status": bill.status.value if hasattr(bill.status, 'value') else bill.status,
        "description": bill.description, "flock_id": bill.flock_id,
        "notes": bill.notes, "payments": payments,
        "created_at": bill.created_at,
    }


# ── Customer Invoices (AR) ──

async def create_invoice_from_shipment(db: AsyncSession, shipment_id: str, due_days: int = 30):
    """Auto-generate an invoice from a shipment."""
    shipment = await db.get(Shipment, shipment_id)
    if not shipment:
        raise ValueError("Shipment not found")

    # Calculate total from lines
    lines_result = await db.execute(
        select(ShipmentLine).where(ShipmentLine.shipment_id == shipment_id)
    )
    lines = lines_result.scalars().all()
    total = sum(
        Decimal(str(l.skids)) * Decimal(str(l.dozens_per_skid)) * l.price_per_dozen
        for l in lines if l.price_per_dozen
    )

    inv_number = await _next_invoice_number(db)
    ship_date = date.fromisoformat(shipment.ship_date)
    due = ship_date + timedelta(days=due_days)

    invoice = CustomerInvoice(
        invoice_number=inv_number,
        buyer=shipment.buyer,
        shipment_id=shipment_id,
        invoice_date=shipment.ship_date,
        due_date=due.isoformat(),
        amount=total,
        description=f"Invoice for shipment {shipment.shipment_number} (BOL #{shipment.bol_number})",
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return _invoice_to_dict(invoice)


async def create_invoice(db: AsyncSession, data: dict):
    inv_number = await _next_invoice_number(db)
    invoice = CustomerInvoice(
        invoice_number=inv_number,
        buyer=data["buyer"],
        buyer_id=data.get("buyer_id"),
        shipment_id=data.get("shipment_id"),
        invoice_date=data["invoice_date"],
        due_date=data["due_date"],
        amount=Decimal(str(data["amount"])),
        description=data.get("description"),
        notes=data.get("notes"),
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return _invoice_to_dict(invoice)


async def get_invoices(db: AsyncSession, status: str = None):
    query = select(CustomerInvoice).order_by(CustomerInvoice.due_date.desc())
    if status:
        query = query.where(CustomerInvoice.status == status)
    result = await db.execute(query)
    return [_invoice_to_dict(inv) for inv in result.scalars().all()]


async def record_invoice_payment(db: AsyncSession, invoice_id: str, amount: float):
    invoice = await db.get(CustomerInvoice, invoice_id)
    if not invoice:
        raise ValueError("Invoice not found")
    invoice.amount_paid = invoice.amount_paid + Decimal(str(amount))
    if invoice.amount_paid >= invoice.amount:
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIAL
    await db.commit()
    return _invoice_to_dict(invoice)


def _invoice_to_dict(inv: CustomerInvoice) -> dict:
    return {
        "id": inv.id, "invoice_number": inv.invoice_number,
        "buyer": inv.buyer, "buyer_id": inv.buyer_id,
        "shipment_id": inv.shipment_id,
        "invoice_date": inv.invoice_date, "due_date": inv.due_date,
        "amount": float(inv.amount), "amount_paid": float(inv.amount_paid),
        "balance_due": float(inv.amount - inv.amount_paid),
        "status": inv.status.value if hasattr(inv.status, 'value') else inv.status,
        "description": inv.description, "notes": inv.notes,
        "created_at": inv.created_at,
    }


# ── AP/AR Aging Reports ──

async def get_ap_aging(db: AsyncSession):
    """AP aging report: bills grouped by 30/60/90/120+ day buckets."""
    today = date.today()
    result = await db.execute(
        select(Bill).where(Bill.status.in_([BillStatus.RECEIVED, BillStatus.PARTIAL, BillStatus.OVERDUE]))
    )
    bills = result.scalars().all()

    buckets = {"current": [], "30": [], "60": [], "90": [], "120_plus": []}
    totals = {"current": 0, "30": 0, "60": 0, "90": 0, "120_plus": 0}

    for bill in bills:
        balance = float(bill.amount - bill.amount_paid)
        if balance <= 0:
            continue
        try:
            due = date.fromisoformat(bill.due_date)
        except ValueError:
            continue
        days_overdue = (today - due).days

        entry = {"bill_number": bill.bill_number, "vendor": bill.vendor_name,
                 "due_date": bill.due_date, "amount": float(bill.amount),
                 "balance": balance, "days_overdue": max(0, days_overdue)}

        if days_overdue <= 0:
            buckets["current"].append(entry); totals["current"] += balance
        elif days_overdue <= 30:
            buckets["30"].append(entry); totals["30"] += balance
        elif days_overdue <= 60:
            buckets["60"].append(entry); totals["60"] += balance
        elif days_overdue <= 90:
            buckets["90"].append(entry); totals["90"] += balance
        else:
            buckets["120_plus"].append(entry); totals["120_plus"] += balance

    return {"buckets": buckets, "totals": {k: round(v, 2) for k, v in totals.items()},
            "total_outstanding": round(sum(totals.values()), 2)}


async def get_ar_aging(db: AsyncSession):
    """AR aging report: invoices grouped by 30/60/90/120+ day buckets."""
    today = date.today()
    result = await db.execute(
        select(CustomerInvoice).where(
            CustomerInvoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE])
        )
    )
    invoices = result.scalars().all()

    buckets = {"current": [], "30": [], "60": [], "90": [], "120_plus": []}
    totals = {"current": 0, "30": 0, "60": 0, "90": 0, "120_plus": 0}

    for inv in invoices:
        balance = float(inv.amount - inv.amount_paid)
        if balance <= 0:
            continue
        try:
            due = date.fromisoformat(inv.due_date)
        except ValueError:
            continue
        days_overdue = (today - due).days

        entry = {"invoice_number": inv.invoice_number, "buyer": inv.buyer,
                 "due_date": inv.due_date, "amount": float(inv.amount),
                 "balance": balance, "days_overdue": max(0, days_overdue)}

        if days_overdue <= 0:
            buckets["current"].append(entry); totals["current"] += balance
        elif days_overdue <= 30:
            buckets["30"].append(entry); totals["30"] += balance
        elif days_overdue <= 60:
            buckets["60"].append(entry); totals["60"] += balance
        elif days_overdue <= 90:
            buckets["90"].append(entry); totals["90"] += balance
        else:
            buckets["120_plus"].append(entry); totals["120_plus"] += balance

    return {"buckets": buckets, "totals": {k: round(v, 2) for k, v in totals.items()},
            "total_outstanding": round(sum(totals.values()), 2)}


# ── Bank Accounts ──

async def create_bank_account(db: AsyncSession, data: dict):
    acct = BankAccount(
        name=data["name"],
        account_number_last4=data.get("account_number_last4"),
        bank_name=data.get("bank_name"),
        account_type=data.get("account_type", "checking"),
        balance=Decimal(str(data.get("balance", 0))),
        notes=data.get("notes"),
    )
    db.add(acct)
    await db.commit()
    await db.refresh(acct)
    return _bank_to_dict(acct)


async def get_bank_accounts(db: AsyncSession):
    result = await db.execute(select(BankAccount).order_by(BankAccount.name))
    return [_bank_to_dict(a) for a in result.scalars().all()]


async def update_bank_account(db: AsyncSession, acct_id: str, data: dict):
    acct = await db.get(BankAccount, acct_id)
    if not acct:
        return None
    for key, value in data.items():
        if key == "balance" and value is not None:
            value = Decimal(str(value))
        if hasattr(acct, key):
            setattr(acct, key, value)
    await db.commit()
    await db.refresh(acct)
    return _bank_to_dict(acct)


def _bank_to_dict(a: BankAccount) -> dict:
    return {
        "id": a.id, "name": a.name,
        "account_number_last4": a.account_number_last4,
        "bank_name": a.bank_name, "account_type": a.account_type,
        "balance": float(a.balance), "is_active": a.is_active,
        "notes": a.notes, "created_at": a.created_at,
    }


# ── Grower Payment Calculator ──

async def calculate_grower_payments(db: AsyncSession):
    """Calculate what's owed to each grower based on their flocks' production."""
    growers_result = await db.execute(
        select(Grower).where(Grower.is_active == True).order_by(Grower.name)
    )
    growers = growers_result.scalars().all()
    payments = []

    for grower in growers:
        barns_result = await db.execute(select(Barn).where(Barn.grower_id == grower.id))
        barns = barns_result.scalars().all()
        barn_ids = [b.id for b in barns]
        if not barn_ids:
            continue

        placements_result = await db.execute(
            select(FlockPlacement.flock_id).where(
                FlockPlacement.barn_id.in_(barn_ids), FlockPlacement.is_current == True
            ).distinct()
        )
        flock_ids = [r[0] for r in placements_result.all()]

        total_birds = sum(b.current_bird_count for b in barns)

        # Find unpaid bills for this grower's vendor name
        bills_result = await db.execute(
            select(func.coalesce(func.sum(Bill.amount - Bill.amount_paid), 0)).where(
                Bill.vendor_name.ilike(f"%{grower.name}%"),
                Bill.status.in_([BillStatus.RECEIVED, BillStatus.PARTIAL]),
            )
        )
        outstanding = float(bills_result.scalar() or 0)

        payments.append({
            "grower_id": grower.id,
            "grower_name": grower.name,
            "num_barns": len(barns),
            "total_birds": total_birds,
            "active_flocks": len(flock_ids),
            "outstanding_bills": round(outstanding, 2),
        })

    return payments
