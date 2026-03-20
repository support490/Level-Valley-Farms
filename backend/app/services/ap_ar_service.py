from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from datetime import date, timedelta
from typing import Optional

from app.models.accounting import (
    Bill, BillPayment, BillStatus, PaymentMethod,
    CustomerInvoice, InvoiceStatus, BankAccount,
    Check, CheckStatus, CheckExpenseLine, CheckItemLine,
    BillExpenseLine, BillItemLine, InvoiceLineItem,
    CustomerPayment, CustomerPaymentApplication,
    JournalEntry, JournalLine, Account, AccountType, ExpenseCategory,
    Item,
    VendorCredit, VendorCreditStatus, VendorCreditExpenseLine,
    FlockBudget, GrowerPaymentFormula,
    ItemReceipt, ItemReceiptLine, ItemReceiptStatus,
    SalesReceipt, SalesReceiptLineItem, SalesReceiptStatus,
    RefundReceipt, RefundReceiptLineItem, RefundReceiptStatus,
    CreditCardCharge, CreditCardChargeExpenseLine, CreditCardChargeStatus,
    CreditCardCredit, CreditCardCreditStatus,
    CustomerDepositModel, FinanceCharge, FinanceChargeStatus,
    InventoryAdjustment, InventoryAdjustmentStatus, AdjustmentType,
)
from app.models.base import generate_uuid
from app.models.logistics import Shipment, ShipmentLine
from app.models.farm import Grower, Barn, FlockPlacement
from app.models.flock import Flock, FlockStatus, MortalityRecord, ProductionRecord
from app.models.feed import Vendor, FeedDelivery


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


# ── Check Number Counter ──

async def _next_check_number(db: AsyncSession) -> int:
    result = await db.execute(select(func.count(Check.id)))
    count = result.scalar() or 0
    return count + 1


# ── Checks (Write Checks) ──

async def create_check(db: AsyncSession, data: dict):
    """Create a Check + expense/item lines + auto-create a balanced JournalEntry."""
    amount = Decimal(str(data["amount"]))

    # Resolve the bank account and its linked GL account
    bank_account = await db.get(BankAccount, data["bank_account_id"])
    if not bank_account:
        raise ValueError("Bank account not found")
    if not bank_account.linked_account_id:
        raise ValueError("Bank account has no linked GL account")

    # Auto-assign check number if not provided
    check_number = data.get("check_number")
    if check_number is None:
        check_number = await _next_check_number(db)

    check = Check(
        check_number=check_number,
        bank_account_id=data["bank_account_id"],
        payee_name=data["payee_name"],
        payee_vendor_id=data.get("payee_vendor_id"),
        check_date=data["check_date"],
        amount=amount,
        address=data.get("address"),
        memo=data.get("memo"),
        status=CheckStatus.PENDING,
    )
    db.add(check)
    await db.flush()

    # Add expense lines
    je_debit_lines = []
    for el in data.get("expense_lines", []):
        line = CheckExpenseLine(
            check_id=check.id,
            account_id=el["account_id"],
            amount=Decimal(str(el["amount"])),
            memo=el.get("memo"),
            flock_id=el.get("flock_id"),
        )
        db.add(line)
        je_debit_lines.append({"account_id": el["account_id"], "amount": Decimal(str(el["amount"]))})

    # Add item lines
    for il in data.get("item_lines", []):
        line = CheckItemLine(
            check_id=check.id,
            item_description=il["item_description"],
            quantity=Decimal(str(il.get("quantity", 1))),
            cost=Decimal(str(il.get("cost", 0))),
            amount=Decimal(str(il["amount"])),
            flock_id=il.get("flock_id"),
        )
        db.add(line)
        # Item lines also debit an expense/asset account — use a general expense if not specified
        # For item lines, we group their total into the journal entry debit side
        je_debit_lines.append({"account_id": None, "amount": Decimal(str(il["amount"]))})

    # Create auto-balanced JournalEntry
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["check_date"],
        description=f"Check #{check_number} to {data['payee_name']}",
        reference=f"CHK-{check_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    check.journal_entry_id = je.id

    # CR the bank's linked GL account for the full amount
    db.add(JournalLine(
        journal_entry_id=je.id,
        account_id=bank_account.linked_account_id,
        debit=Decimal("0"),
        credit=amount,
        description=f"Check #{check_number} to {data['payee_name']}",
    ))

    # DR each expense account from lines
    for dl in je_debit_lines:
        if dl["account_id"]:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=dl["account_id"],
                debit=dl["amount"],
                credit=Decimal("0"),
                description=f"Check #{check_number} to {data['payee_name']}",
            ))

    # Update account balances for posted JE
    bank_gl = await db.get(Account, bank_account.linked_account_id)
    if bank_gl:
        # Bank is asset: CR decreases
        bank_gl.balance -= amount

    for dl in je_debit_lines:
        if dl["account_id"]:
            acct = await db.get(Account, dl["account_id"])
            if acct:
                if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                    acct.balance += dl["amount"]
                else:
                    acct.balance -= dl["amount"]

    await db.commit()
    await db.refresh(check)
    return await _check_to_dict(db, check)


async def get_checks(db: AsyncSession, bank_account_id: str = None, status: str = None):
    """List checks with optional filters."""
    query = select(Check).order_by(Check.check_date.desc(), Check.check_number.desc())
    if bank_account_id:
        query = query.where(Check.bank_account_id == bank_account_id)
    if status:
        query = query.where(Check.status == status)
    result = await db.execute(query)
    return [await _check_to_dict(db, c) for c in result.scalars().all()]


async def void_check(db: AsyncSession, check_id: str):
    """Mark check as voided and create a reversing JournalEntry."""
    check = await db.get(Check, check_id)
    if not check:
        raise ValueError("Check not found")
    if check.is_voided:
        raise ValueError("Check is already voided")

    check.is_voided = True
    check.status = CheckStatus.VOIDED

    # Create reversing JE
    bank_account = await db.get(BankAccount, check.bank_account_id)
    if bank_account and bank_account.linked_account_id:
        entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
        entry_count = entry_count_result.scalar() or 0
        entry_number = f"JE-{entry_count + 1:06d}"

        je = JournalEntry(
            entry_number=entry_number,
            entry_date=check.check_date,
            description=f"VOID Check #{check.check_number} to {check.payee_name}",
            reference=f"VOID-CHK-{check.check_number}",
            is_posted=True,
        )
        db.add(je)
        await db.flush()

        # DR bank (reverse the original credit)
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=bank_account.linked_account_id,
            debit=check.amount,
            credit=Decimal("0"),
            description=f"VOID Check #{check.check_number}",
        ))

        # CR each expense account (reverse the original debits)
        # Read the original JE lines to get the debit accounts
        if check.journal_entry_id:
            orig_lines_result = await db.execute(
                select(JournalLine).where(
                    JournalLine.journal_entry_id == check.journal_entry_id,
                    JournalLine.debit > 0,
                )
            )
            for orig_line in orig_lines_result.scalars().all():
                db.add(JournalLine(
                    journal_entry_id=je.id,
                    account_id=orig_line.account_id,
                    debit=Decimal("0"),
                    credit=orig_line.debit,
                    description=f"VOID Check #{check.check_number}",
                ))

        # Update account balances for the reversing JE
        bank_gl = await db.get(Account, bank_account.linked_account_id)
        if bank_gl:
            bank_gl.balance += check.amount

        if check.journal_entry_id:
            orig_lines_result = await db.execute(
                select(JournalLine).where(
                    JournalLine.journal_entry_id == check.journal_entry_id,
                    JournalLine.debit > 0,
                )
            )
            for orig_line in orig_lines_result.scalars().all():
                acct = await db.get(Account, orig_line.account_id)
                if acct:
                    if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                        acct.balance -= orig_line.debit
                    else:
                        acct.balance += orig_line.debit

    await db.commit()
    await db.refresh(check)
    return await _check_to_dict(db, check)


async def mark_check_printed(db: AsyncSession, check_id: str, check_number: int = None):
    """Set is_printed=True, assign check_number if provided, set status=PRINTED."""
    check = await db.get(Check, check_id)
    if not check:
        raise ValueError("Check not found")
    if check.is_voided:
        raise ValueError("Cannot print a voided check")

    check.is_printed = True
    check.status = CheckStatus.PRINTED
    if check_number is not None:
        check.check_number = check_number

    await db.commit()
    await db.refresh(check)
    return await _check_to_dict(db, check)


async def _check_to_dict(db: AsyncSession, check: Check) -> dict:
    """Convert a Check to a dict with its lines."""
    # Load expense lines
    exp_result = await db.execute(
        select(CheckExpenseLine).where(CheckExpenseLine.check_id == check.id)
    )
    expense_lines = []
    for el in exp_result.scalars().all():
        acct = await db.get(Account, el.account_id) if el.account_id else None
        expense_lines.append({
            "id": el.id, "account_id": el.account_id,
            "account_name": acct.name if acct else "",
            "amount": float(el.amount), "memo": el.memo,
            "flock_id": el.flock_id,
        })

    # Load item lines
    item_result = await db.execute(
        select(CheckItemLine).where(CheckItemLine.check_id == check.id)
    )
    item_lines = [{
        "id": il.id, "item_description": il.item_description,
        "quantity": float(il.quantity), "cost": float(il.cost),
        "amount": float(il.amount), "flock_id": il.flock_id,
    } for il in item_result.scalars().all()]

    return {
        "id": check.id,
        "check_number": check.check_number,
        "bank_account_id": check.bank_account_id,
        "payee_name": check.payee_name,
        "payee_vendor_id": check.payee_vendor_id,
        "check_date": check.check_date,
        "amount": float(check.amount),
        "address": check.address,
        "memo": check.memo,
        "is_printed": check.is_printed,
        "is_voided": check.is_voided,
        "status": check.status.value if hasattr(check.status, 'value') else check.status,
        "journal_entry_id": check.journal_entry_id,
        "expense_lines": expense_lines,
        "item_lines": item_lines,
        "created_at": check.created_at,
    }


# ── Batch Bill Payment ──

async def pay_bills_batch(db: AsyncSession, data: dict):
    """Pay multiple bills in one transaction with a single JE."""
    bill_ids = data["bill_ids"]
    payment_date = data["payment_date"]
    payment_method = PaymentMethod(data.get("payment_method", "check"))
    bank_account_id = data["bank_account_id"]

    bank_account = await db.get(BankAccount, bank_account_id)
    if not bank_account:
        raise ValueError("Bank account not found")
    if not bank_account.linked_account_id:
        raise ValueError("Bank account has no linked GL account")

    total_paid = Decimal("0")
    paid_bills = []

    for bill_id in bill_ids:
        bill = await db.get(Bill, bill_id)
        if not bill:
            raise ValueError(f"Bill {bill_id} not found")

        balance_due = bill.amount - bill.amount_paid
        if balance_due <= 0:
            continue

        payment = BillPayment(
            bill_id=bill_id,
            payment_date=payment_date,
            amount=balance_due,
            payment_method=payment_method,
            reference=f"Batch payment {payment_date}",
            bank_account_id=bank_account_id,
        )
        db.add(payment)

        bill.amount_paid = bill.amount
        bill.status = BillStatus.PAID
        total_paid += balance_due
        paid_bills.append({
            "bill_id": bill.id,
            "bill_number": bill.bill_number,
            "vendor_name": bill.vendor_name,
            "amount_paid": float(balance_due),
        })

    if total_paid <= 0:
        raise ValueError("No outstanding balances on selected bills")

    # Create single JE for the batch
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=payment_date,
        description=f"Batch bill payment ({len(paid_bills)} bills)",
        reference=f"BILL-BATCH-{payment_date}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # DR Accounts Payable (reduce liability)
    # Find the AP account (2010)
    ap_result = await db.execute(
        select(Account).where(Account.account_number == "2010")
    )
    ap_account = ap_result.scalar_one_or_none()

    if ap_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ap_account.id,
            debit=total_paid,
            credit=Decimal("0"),
            description=f"Batch bill payment ({len(paid_bills)} bills)",
        ))
        # AP is liability: DR decreases
        ap_account.balance -= total_paid

    # CR bank
    db.add(JournalLine(
        journal_entry_id=je.id,
        account_id=bank_account.linked_account_id,
        debit=Decimal("0"),
        credit=total_paid,
        description=f"Batch bill payment ({len(paid_bills)} bills)",
    ))
    bank_gl = await db.get(Account, bank_account.linked_account_id)
    if bank_gl:
        bank_gl.balance -= total_paid

    await db.commit()

    return {
        "total_paid": float(total_paid),
        "bills_paid": paid_bills,
        "journal_entry_number": entry_number,
    }


# ── Customer Payment (Receive Payment) ──

async def create_customer_payment(db: AsyncSession, data: dict):
    """Create CustomerPayment + applications, update invoice statuses."""
    amount = Decimal(str(data["amount"]))

    payment = CustomerPayment(
        customer_name=data["customer_name"],
        buyer_id=data.get("buyer_id"),
        payment_date=data["payment_date"],
        amount=amount,
        reference=data.get("reference"),
        payment_method=PaymentMethod(data.get("payment_method", "check")),
        deposit_to_account_id=data.get("deposit_to_account_id"),
        memo=data.get("memo"),
    )
    db.add(payment)
    await db.flush()

    applied_total = Decimal("0")
    applications_out = []

    for app_data in data.get("applications", []):
        invoice = await db.get(CustomerInvoice, app_data["invoice_id"])
        if not invoice:
            raise ValueError(f"Invoice {app_data['invoice_id']} not found")

        app_amount = Decimal(str(app_data["amount_applied"]))
        application = CustomerPaymentApplication(
            payment_id=payment.id,
            invoice_id=app_data["invoice_id"],
            amount_applied=app_amount,
        )
        db.add(application)

        # Update invoice
        invoice.amount_paid = invoice.amount_paid + app_amount
        if invoice.amount_paid >= invoice.amount:
            invoice.status = InvoiceStatus.PAID
        else:
            invoice.status = InvoiceStatus.PARTIAL

        applied_total += app_amount
        applications_out.append({
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount_applied": float(app_amount),
        })

    # Create JE: DR bank/deposit account, CR Accounts Receivable
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["payment_date"],
        description=f"Payment received from {data['customer_name']}",
        reference=data.get("reference"),
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # Determine the debit account (bank GL account)
    debit_account_id = None
    if data.get("deposit_to_account_id"):
        bank_acct = await db.get(BankAccount, data["deposit_to_account_id"])
        if bank_acct and bank_acct.linked_account_id:
            debit_account_id = bank_acct.linked_account_id

    # If no bank account linked, use Cash (1010)
    if not debit_account_id:
        cash_result = await db.execute(
            select(Account).where(Account.account_number == "1010")
        )
        cash_acct = cash_result.scalar_one_or_none()
        if cash_acct:
            debit_account_id = cash_acct.id

    if debit_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=debit_account_id,
            debit=amount,
            credit=Decimal("0"),
            description=f"Payment from {data['customer_name']}",
        ))
        debit_gl = await db.get(Account, debit_account_id)
        if debit_gl:
            debit_gl.balance += amount

    # CR Accounts Receivable (1020)
    ar_result = await db.execute(
        select(Account).where(Account.account_number == "1020")
    )
    ar_account = ar_result.scalar_one_or_none()
    if ar_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ar_account.id,
            debit=Decimal("0"),
            credit=amount,
            description=f"Payment from {data['customer_name']}",
        ))
        # AR is asset: CR decreases
        ar_account.balance -= amount

    await db.commit()
    await db.refresh(payment)

    return {
        "id": payment.id,
        "customer_name": payment.customer_name,
        "buyer_id": payment.buyer_id,
        "payment_date": payment.payment_date,
        "amount": float(payment.amount),
        "reference": payment.reference,
        "payment_method": payment.payment_method.value if hasattr(payment.payment_method, 'value') else payment.payment_method,
        "deposit_to_account_id": payment.deposit_to_account_id,
        "memo": payment.memo,
        "applications": applications_out,
        "journal_entry_number": entry_number,
        "created_at": payment.created_at,
    }


# ── Bank Register ──

async def get_bank_register(db: AsyncSession, bank_account_id: str):
    """Get transaction register for a bank account sorted by date with running balance."""
    bank_account = await db.get(BankAccount, bank_account_id)
    if not bank_account:
        raise ValueError("Bank account not found")

    transactions = []

    # 1. Checks on this bank account
    checks_result = await db.execute(
        select(Check).where(Check.bank_account_id == bank_account_id).order_by(Check.check_date)
    )
    for chk in checks_result.scalars().all():
        transactions.append({
            "date": chk.check_date,
            "type": "CHK",
            "number": str(chk.check_number) if chk.check_number else "",
            "payee": chk.payee_name,
            "memo": chk.memo or "",
            "payment": float(chk.amount) if not chk.is_voided else 0,
            "deposit": 0,
            "status": chk.status.value if hasattr(chk.status, 'value') else chk.status,
            "ref_id": chk.id,
        })

    # 2. Bill payments from this bank account
    bp_result = await db.execute(
        select(BillPayment).where(BillPayment.bank_account_id == bank_account_id).order_by(BillPayment.payment_date)
    )
    for bp in bp_result.scalars().all():
        bill = await db.get(Bill, bp.bill_id)
        transactions.append({
            "date": bp.payment_date,
            "type": "BILL PMT",
            "number": bp.reference or "",
            "payee": bill.vendor_name if bill else "",
            "memo": bp.notes or "",
            "payment": float(bp.amount),
            "deposit": 0,
            "status": "cleared",
            "ref_id": bp.id,
        })

    # 3. Customer payments deposited to this bank account
    cp_result = await db.execute(
        select(CustomerPayment).where(
            CustomerPayment.deposit_to_account_id == bank_account_id
        ).order_by(CustomerPayment.payment_date)
    )
    for cp in cp_result.scalars().all():
        transactions.append({
            "date": cp.payment_date,
            "type": "PMT",
            "number": cp.reference or "",
            "payee": cp.customer_name,
            "memo": cp.memo or "",
            "payment": 0,
            "deposit": float(cp.amount),
            "status": "cleared",
            "ref_id": cp.id,
        })

    # 4. Journal lines that touch the bank's linked GL account (non-check/non-bill-payment JEs)
    if bank_account.linked_account_id:
        je_result = await db.execute(
            select(JournalLine, JournalEntry)
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalLine.account_id == bank_account.linked_account_id,
                JournalEntry.is_posted == True,
            )
            .order_by(JournalEntry.entry_date)
        )
        # Collect check/bill-related JE IDs so we don't double-count
        check_je_ids = set()
        chk_result = await db.execute(
            select(Check.journal_entry_id).where(
                Check.bank_account_id == bank_account_id,
                Check.journal_entry_id.isnot(None),
            )
        )
        for row in chk_result.all():
            check_je_ids.add(row[0])

        for jl, je in je_result.all():
            if je.id in check_je_ids:
                continue
            # Skip if reference indicates a batch bill payment or check
            if je.reference and (je.reference.startswith("CHK-") or je.reference.startswith("VOID-CHK-") or je.reference.startswith("BILL-BATCH-")):
                continue

            debit_val = float(jl.debit)
            credit_val = float(jl.credit)
            transactions.append({
                "date": je.entry_date,
                "type": "JE",
                "number": je.entry_number,
                "payee": je.description,
                "memo": jl.description or "",
                "payment": credit_val if credit_val > 0 else 0,
                "deposit": debit_val if debit_val > 0 else 0,
                "status": "posted",
                "ref_id": je.id,
            })

    # Sort by date
    transactions.sort(key=lambda t: t["date"])

    # Calculate running balance
    running = Decimal("0")
    for t in transactions:
        running += Decimal(str(t["deposit"])) - Decimal(str(t["payment"]))
        t["running_balance"] = float(running)

    return {
        "bank_account_id": bank_account_id,
        "bank_account_name": bank_account.name,
        "transactions": transactions,
        "ending_balance": float(running),
    }


# ── Deposits ──

async def create_deposit(db: AsyncSession, bank_account_id: str, data: dict):
    """Create a deposit into a bank account with a balanced JournalEntry."""
    bank_account = await db.get(BankAccount, bank_account_id)
    if not bank_account:
        raise ValueError("Bank account not found")
    if not bank_account.linked_account_id:
        raise ValueError("Bank account has no linked GL account")

    deposit_date = data["deposit_date"]
    deposit_total = Decimal(str(data["total"]))
    deposit_lines = data.get("deposit_lines", [])
    cash_back_amount = Decimal(str(data.get("cash_back_amount", 0)))
    cash_back_account_id = data.get("cash_back_account_id")
    memo = data.get("memo", "")

    # Create JournalEntry
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=deposit_date,
        description=f"Deposit to {bank_account.name}",
        reference=f"DEP-{deposit_date}",
        is_posted=True,
        notes=memo,
    )
    db.add(je)
    await db.flush()

    # DR bank GL account for net deposit
    db.add(JournalLine(
        journal_entry_id=je.id,
        account_id=bank_account.linked_account_id,
        debit=deposit_total,
        credit=Decimal("0"),
        description=f"Deposit to {bank_account.name}",
    ))

    # CR each deposit line's from_account
    for line in deposit_lines:
        from_account_id = line.get("from_account_id")
        line_amount = Decimal(str(line["amount"]))
        if from_account_id:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=from_account_id,
                debit=Decimal("0"),
                credit=line_amount,
                description=line.get("memo") or f"Deposit from {line.get('received_from', '')}",
            ))
            acct = await db.get(Account, from_account_id)
            if acct:
                if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                    acct.balance -= line_amount
                else:
                    acct.balance += line_amount

    # Handle cash back: DR cash back account, CR bank
    if cash_back_amount > 0 and cash_back_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=cash_back_account_id,
            debit=cash_back_amount,
            credit=Decimal("0"),
            description="Cash back from deposit",
        ))
        cb_acct = await db.get(Account, cash_back_account_id)
        if cb_acct:
            if cb_acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                cb_acct.balance += cash_back_amount
            else:
                cb_acct.balance -= cash_back_amount

    # Update bank GL balance
    bank_gl = await db.get(Account, bank_account.linked_account_id)
    if bank_gl:
        bank_gl.balance += deposit_total

    # Update bank account balance
    bank_account.balance += deposit_total

    await db.commit()
    return {
        "bank_account_id": bank_account_id,
        "deposit_total": float(deposit_total),
        "journal_entry_number": entry_number,
    }


# ── Transfers ──

async def create_transfer(db: AsyncSession, data: dict):
    """Transfer funds between two bank accounts with a balanced JournalEntry."""
    from_account = await db.get(BankAccount, data["from_account_id"])
    to_account = await db.get(BankAccount, data["to_account_id"])
    if not from_account:
        raise ValueError("From bank account not found")
    if not to_account:
        raise ValueError("To bank account not found")
    if not from_account.linked_account_id:
        raise ValueError("From bank account has no linked GL account")
    if not to_account.linked_account_id:
        raise ValueError("To bank account has no linked GL account")

    amount = Decimal(str(data["amount"]))
    transfer_date = data["transfer_date"]
    memo = data.get("memo", "")

    # Create JournalEntry
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=transfer_date,
        description=f"Transfer from {from_account.name} to {to_account.name}",
        reference=f"XFER-{transfer_date}",
        is_posted=True,
        notes=memo,
    )
    db.add(je)
    await db.flush()

    # CR from bank GL
    db.add(JournalLine(
        journal_entry_id=je.id,
        account_id=from_account.linked_account_id,
        debit=Decimal("0"),
        credit=amount,
        description=f"Transfer to {to_account.name}",
    ))

    # DR to bank GL
    db.add(JournalLine(
        journal_entry_id=je.id,
        account_id=to_account.linked_account_id,
        debit=amount,
        credit=Decimal("0"),
        description=f"Transfer from {from_account.name}",
    ))

    # Update GL balances
    from_gl = await db.get(Account, from_account.linked_account_id)
    if from_gl:
        from_gl.balance -= amount
    to_gl = await db.get(Account, to_account.linked_account_id)
    if to_gl:
        to_gl.balance += amount

    # Update bank account balances
    from_account.balance -= amount
    to_account.balance += amount

    await db.commit()
    return {
        "from_account_id": data["from_account_id"],
        "to_account_id": data["to_account_id"],
        "amount": float(amount),
        "journal_entry_number": entry_number,
    }


# ── Items CRUD ──

async def get_items(db: AsyncSession):
    result = await db.execute(select(Item).order_by(Item.name))
    return [_item_to_dict(i) for i in result.scalars().all()]


async def create_item(db: AsyncSession, data: dict):
    item = Item(
        name=data["name"],
        description=data.get("description"),
        item_type=data.get("item_type", "Service"),
        income_account=data.get("income_account"),
        expense_account=data.get("expense_account"),
        price=Decimal(str(data.get("price", 0))),
        cost=Decimal(str(data.get("cost", 0))),
        is_active=data.get("is_active", True),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _item_to_dict(item)


async def update_item(db: AsyncSession, item_id: str, data: dict):
    item = await db.get(Item, item_id)
    if not item:
        return None
    for key in ["name", "description", "item_type", "income_account", "expense_account", "is_active"]:
        if key in data and data[key] is not None:
            setattr(item, key, data[key])
    if "price" in data and data["price"] is not None:
        item.price = Decimal(str(data["price"]))
    if "cost" in data and data["cost"] is not None:
        item.cost = Decimal(str(data["cost"]))
    await db.commit()
    await db.refresh(item)
    return _item_to_dict(item)


async def delete_item(db: AsyncSession, item_id: str):
    item = await db.get(Item, item_id)
    if not item:
        return None
    await db.delete(item)
    await db.commit()
    return {"ok": True}


def _item_to_dict(item: Item) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "item_type": item.item_type,
        "income_account": item.income_account,
        "expense_account": item.expense_account,
        "price": float(item.price),
        "cost": float(item.cost),
        "is_active": item.is_active,
        "created_at": item.created_at,
    }


# ── Vendor Credits (Bill Credits) ──

async def _next_vendor_credit_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(VendorCredit.id)))
    count = result.scalar() or 0
    return f"VC-{count + 1:06d}"


async def create_vendor_credit(db: AsyncSession, data: dict):
    """Create a vendor credit with expense lines and a reversing JE (DR AP, CR expense accounts)."""
    amount = Decimal(str(data["amount"]))
    credit_number = data.get("credit_number") or await _next_vendor_credit_number(db)

    vc = VendorCredit(
        credit_number=credit_number,
        vendor_name=data["vendor_name"],
        vendor_id=data.get("vendor_id"),
        credit_date=data["credit_date"],
        amount=amount,
        description=data.get("description"),
        flock_id=data.get("flock_id"),
        notes=data.get("notes"),
        ref_no=data.get("ref_no"),
        status=VendorCreditStatus.OPEN,
    )
    db.add(vc)
    await db.flush()

    # Add expense lines
    expense_lines_out = []
    for el in data.get("expense_lines", []):
        line = VendorCreditExpenseLine(
            vendor_credit_id=vc.id,
            account_id=el["account_id"],
            amount=Decimal(str(el["amount"])),
            memo=el.get("memo"),
            flock_id=el.get("flock_id"),
        )
        db.add(line)
        await db.flush()
        acct = await db.get(Account, el["account_id"]) if el.get("account_id") else None
        expense_lines_out.append({
            "id": line.id, "account_id": line.account_id,
            "account_name": acct.name if acct else "",
            "amount": float(line.amount), "memo": line.memo,
            "flock_id": line.flock_id,
        })

    # Create JE: DR Accounts Payable, CR expense accounts
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["credit_date"],
        description=f"Vendor Credit {credit_number} from {data['vendor_name']}",
        reference=f"VC-{credit_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # DR Accounts Payable (2010) — reduces the liability
    ap_result = await db.execute(
        select(Account).where(Account.account_number == "2010")
    )
    ap_account = ap_result.scalar_one_or_none()

    if ap_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ap_account.id,
            debit=amount,
            credit=Decimal("0"),
            description=f"Vendor Credit {credit_number} from {data['vendor_name']}",
        ))
        # AP is liability: DR decreases
        ap_account.balance -= amount

    # CR each expense account from lines
    for el in data.get("expense_lines", []):
        if el.get("account_id"):
            line_amount = Decimal(str(el["amount"]))
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=el["account_id"],
                debit=Decimal("0"),
                credit=line_amount,
                description=f"Vendor Credit {credit_number} from {data['vendor_name']}",
            ))
            acct = await db.get(Account, el["account_id"])
            if acct:
                if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                    acct.balance -= line_amount
                else:
                    acct.balance += line_amount

    await db.commit()
    await db.refresh(vc)
    result_dict = await _vendor_credit_to_dict(db, vc)
    result_dict["journal_entry_number"] = entry_number
    return result_dict


async def get_vendor_credits(db: AsyncSession, status: str = None):
    """List vendor credits, optionally filtered by status."""
    query = select(VendorCredit).order_by(VendorCredit.credit_date.desc())
    if status:
        query = query.where(VendorCredit.status == status)
    result = await db.execute(query)
    return [await _vendor_credit_to_dict(db, vc) for vc in result.scalars().all()]


async def apply_vendor_credit_to_bill(db: AsyncSession, credit_id: str, bill_id: str, amount: float):
    """Apply a vendor credit to reduce a bill balance."""
    vc = await db.get(VendorCredit, credit_id)
    if not vc:
        raise ValueError("Vendor credit not found")
    if vc.status == VendorCreditStatus.VOIDED:
        raise ValueError("Vendor credit is voided")
    if vc.status == VendorCreditStatus.APPLIED:
        raise ValueError("Vendor credit is fully applied")

    bill = await db.get(Bill, bill_id)
    if not bill:
        raise ValueError("Bill not found")

    apply_amount = Decimal(str(amount))

    # Validate amount does not exceed credit remaining
    credit_remaining = vc.amount - vc.amount_applied
    if apply_amount > credit_remaining:
        raise ValueError(f"Amount exceeds credit remaining (${float(credit_remaining):.2f})")

    # Validate amount does not exceed bill balance
    bill_balance = bill.amount - bill.amount_paid
    if apply_amount > bill_balance:
        raise ValueError(f"Amount exceeds bill balance (${float(bill_balance):.2f})")

    # Update vendor credit
    vc.amount_applied = vc.amount_applied + apply_amount
    if vc.amount_applied >= vc.amount:
        vc.status = VendorCreditStatus.APPLIED
    else:
        vc.status = VendorCreditStatus.PARTIAL

    # Update bill
    bill.amount_paid = bill.amount_paid + apply_amount
    if bill.amount_paid >= bill.amount:
        bill.status = BillStatus.PAID
    else:
        bill.status = BillStatus.PARTIAL

    # Create JE for the application: DR AP (reverse the credit), CR AP (reduce bill)
    # Net effect is zero on AP, but we record the application
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=bill.bill_date,
        description=f"Apply Vendor Credit {vc.credit_number} to Bill {bill.bill_number}",
        reference=f"VC-APPLY-{vc.credit_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # DR Accounts Payable (the credit side — reduces the credit on AP)
    # CR Accounts Payable (the bill side — reduces what we owe on the bill)
    # Since both sides hit AP, net is zero — but we record for audit trail
    ap_result = await db.execute(
        select(Account).where(Account.account_number == "2010")
    )
    ap_account = ap_result.scalar_one_or_none()

    if ap_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ap_account.id,
            debit=apply_amount,
            credit=Decimal("0"),
            description=f"Apply VC {vc.credit_number} to Bill {bill.bill_number} (credit side)",
        ))
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ap_account.id,
            debit=Decimal("0"),
            credit=apply_amount,
            description=f"Apply VC {vc.credit_number} to Bill {bill.bill_number} (bill side)",
        ))

    await db.commit()

    return {
        "credit_id": vc.id,
        "credit_number": vc.credit_number,
        "bill_id": bill.id,
        "bill_number": bill.bill_number,
        "amount_applied": float(apply_amount),
        "credit_remaining": float(vc.amount - vc.amount_applied),
        "credit_status": vc.status.value if hasattr(vc.status, 'value') else vc.status,
        "bill_balance_due": float(bill.amount - bill.amount_paid),
        "bill_status": bill.status.value if hasattr(bill.status, 'value') else bill.status,
        "journal_entry_number": entry_number,
    }


async def void_vendor_credit(db: AsyncSession, credit_id: str):
    """Void a vendor credit and create a reversing JE."""
    vc = await db.get(VendorCredit, credit_id)
    if not vc:
        raise ValueError("Vendor credit not found")
    if vc.status == VendorCreditStatus.VOIDED:
        raise ValueError("Vendor credit is already voided")

    vc.status = VendorCreditStatus.VOIDED

    # Create reversing JE: CR AP, DR expense accounts (opposite of creation)
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=vc.credit_date,
        description=f"VOID Vendor Credit {vc.credit_number} from {vc.vendor_name}",
        reference=f"VOID-VC-{vc.credit_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    amount = vc.amount

    # CR Accounts Payable (reverse the original debit)
    ap_result = await db.execute(
        select(Account).where(Account.account_number == "2010")
    )
    ap_account = ap_result.scalar_one_or_none()

    if ap_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ap_account.id,
            debit=Decimal("0"),
            credit=amount,
            description=f"VOID Vendor Credit {vc.credit_number}",
        ))
        # AP is liability: CR increases
        ap_account.balance += amount

    # DR each expense account (reverse the original credits)
    expense_lines_result = await db.execute(
        select(VendorCreditExpenseLine).where(VendorCreditExpenseLine.vendor_credit_id == vc.id)
    )
    for el in expense_lines_result.scalars().all():
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=el.account_id,
            debit=el.amount,
            credit=Decimal("0"),
            description=f"VOID Vendor Credit {vc.credit_number}",
        ))
        acct = await db.get(Account, el.account_id)
        if acct:
            if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                acct.balance += el.amount
            else:
                acct.balance -= el.amount

    await db.commit()
    await db.refresh(vc)
    result_dict = await _vendor_credit_to_dict(db, vc)
    result_dict["journal_entry_number"] = entry_number
    return result_dict


async def _vendor_credit_to_dict(db: AsyncSession, vc: VendorCredit) -> dict:
    """Serialize a VendorCredit with its expense lines."""
    exp_result = await db.execute(
        select(VendorCreditExpenseLine).where(VendorCreditExpenseLine.vendor_credit_id == vc.id)
    )
    expense_lines = []
    for el in exp_result.scalars().all():
        acct = await db.get(Account, el.account_id) if el.account_id else None
        expense_lines.append({
            "id": el.id, "account_id": el.account_id,
            "account_name": acct.name if acct else "",
            "amount": float(el.amount), "memo": el.memo,
            "flock_id": el.flock_id,
        })

    return {
        "id": vc.id,
        "credit_number": vc.credit_number,
        "vendor_name": vc.vendor_name,
        "vendor_id": vc.vendor_id,
        "credit_date": vc.credit_date,
        "amount": float(vc.amount),
        "amount_applied": float(vc.amount_applied),
        "balance_remaining": float(vc.amount - vc.amount_applied),
        "status": vc.status.value if hasattr(vc.status, 'value') else vc.status,
        "description": vc.description,
        "flock_id": vc.flock_id,
        "notes": vc.notes,
        "ref_no": vc.ref_no,
        "expense_lines": expense_lines,
        "created_at": vc.created_at,
    }


# ── Item Receipts ──

async def _next_receipt_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(ItemReceipt.id)))
    count = result.scalar() or 0
    return f"IR-{count + 1:06d}"


async def create_item_receipt(db: AsyncSession, data: dict):
    """Create an item receipt with lines and an accrual JE (DR expense, CR Accrued Expenses)."""
    total_amount = Decimal(str(data["total_amount"]))
    receipt_number = data.get("receipt_number") or await _next_receipt_number(db)

    ir = ItemReceipt(
        receipt_number=receipt_number,
        vendor_name=data["vendor_name"],
        vendor_id=data.get("vendor_id"),
        receipt_date=data["receipt_date"],
        total_amount=total_amount,
        description=data.get("description"),
        flock_id=data.get("flock_id"),
        notes=data.get("notes"),
        ref_no=data.get("ref_no"),
        status=ItemReceiptStatus.OPEN,
    )
    db.add(ir)
    await db.flush()

    # Add lines
    lines_out = []
    je_debit_lines = []
    for line_data in data.get("lines", []):
        line_amount = Decimal(str(line_data["amount"]))
        line = ItemReceiptLine(
            item_receipt_id=ir.id,
            item_description=line_data["item_description"],
            quantity=Decimal(str(line_data.get("quantity", 1))),
            cost=Decimal(str(line_data.get("cost", 0))),
            amount=line_amount,
            account_id=line_data.get("account_id"),
            flock_id=line_data.get("flock_id"),
        )
        db.add(line)
        await db.flush()

        acct = await db.get(Account, line_data["account_id"]) if line_data.get("account_id") else None
        lines_out.append({
            "id": line.id, "item_description": line.item_description,
            "quantity": float(line.quantity), "cost": float(line.cost),
            "amount": float(line.amount), "account_id": line.account_id,
            "account_name": acct.name if acct else "",
            "flock_id": line.flock_id,
        })
        if line_data.get("account_id"):
            je_debit_lines.append({"account_id": line_data["account_id"], "amount": line_amount})

    # Create accrual JE: DR expense accounts per line, CR Accrued Expenses (2015)
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["receipt_date"],
        description=f"Item Receipt {receipt_number} from {data['vendor_name']}",
        reference=f"IR-{receipt_number}",
        flock_id=data.get("flock_id"),
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    ir.journal_entry_id = je.id

    # DR each expense account from lines
    for dl in je_debit_lines:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=dl["account_id"],
            debit=dl["amount"],
            credit=Decimal("0"),
            description=f"Item Receipt {receipt_number} from {data['vendor_name']}",
        ))
        acct = await db.get(Account, dl["account_id"])
        if acct:
            if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                acct.balance += dl["amount"]
            else:
                acct.balance -= dl["amount"]

    # CR Accrued Expenses (2015) — if not found, try AP (2010)
    accrued_result = await db.execute(
        select(Account).where(Account.account_number == "2015")
    )
    accrued_account = accrued_result.scalar_one_or_none()
    if not accrued_account:
        accrued_result = await db.execute(
            select(Account).where(Account.account_number == "2010")
        )
        accrued_account = accrued_result.scalar_one_or_none()

    if accrued_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=accrued_account.id,
            debit=Decimal("0"),
            credit=total_amount,
            description=f"Item Receipt {receipt_number} from {data['vendor_name']}",
        ))
        # Liability: CR increases
        accrued_account.balance += total_amount

    await db.commit()
    await db.refresh(ir)
    result_dict = await _item_receipt_to_dict(db, ir)
    result_dict["journal_entry_number"] = entry_number
    return result_dict


async def get_item_receipts(db: AsyncSession, status: str = None):
    """List item receipts, optionally filtered by status."""
    query = select(ItemReceipt).order_by(ItemReceipt.receipt_date.desc())
    if status:
        query = query.where(ItemReceipt.status == status)
    result = await db.execute(query)
    return [await _item_receipt_to_dict(db, ir) for ir in result.scalars().all()]


async def convert_receipt_to_bill(db: AsyncSession, receipt_id: str, bill_data: dict = None):
    """Convert an item receipt to a bill. Reverses the accrual JE and creates a normal bill."""
    ir = await db.get(ItemReceipt, receipt_id)
    if not ir:
        raise ValueError("Item receipt not found")
    if ir.status == ItemReceiptStatus.BILLED:
        raise ValueError("Item receipt is already billed")
    if ir.status == ItemReceiptStatus.VOIDED:
        raise ValueError("Item receipt is voided")

    # Auto-generate bill number
    bill_count_result = await db.execute(select(func.count(Bill.id)))
    bill_count = bill_count_result.scalar() or 0
    bill_number = (bill_data or {}).get("bill_number") or f"BILL-{bill_count + 1:06d}"

    today_str = date.today().isoformat()
    due_date = (bill_data or {}).get("due_date") or today_str

    # Create the bill
    bill = Bill(
        bill_number=bill_number,
        vendor_name=ir.vendor_name,
        vendor_id=ir.vendor_id,
        bill_date=(bill_data or {}).get("bill_date") or today_str,
        due_date=due_date,
        amount=ir.total_amount,
        description=ir.description or f"From Item Receipt {ir.receipt_number}",
        flock_id=ir.flock_id,
        notes=ir.notes,
        ref_no=ir.ref_no,
        status=BillStatus.RECEIVED,
    )
    db.add(bill)
    await db.flush()

    # Copy receipt lines as bill expense lines
    lines_result = await db.execute(
        select(ItemReceiptLine).where(ItemReceiptLine.item_receipt_id == ir.id)
    )
    for rl in lines_result.scalars().all():
        bill_line = BillExpenseLine(
            bill_id=bill.id,
            account_id=rl.account_id or "",
            amount=rl.amount,
            memo=rl.item_description,
            flock_id=rl.flock_id,
        )
        db.add(bill_line)

    # Reverse the accrual JE: DR Accrued Expenses, CR expense accounts
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=today_str,
        description=f"Reverse accrual for Item Receipt {ir.receipt_number} (now Bill {bill_number})",
        reference=f"IR-REV-{ir.receipt_number}",
        flock_id=ir.flock_id,
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # DR Accrued Expenses (reverse the original credit)
    accrued_result = await db.execute(
        select(Account).where(Account.account_number == "2015")
    )
    accrued_account = accrued_result.scalar_one_or_none()
    if not accrued_account:
        accrued_result = await db.execute(
            select(Account).where(Account.account_number == "2010")
        )
        accrued_account = accrued_result.scalar_one_or_none()

    if accrued_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=accrued_account.id,
            debit=ir.total_amount,
            credit=Decimal("0"),
            description=f"Reverse accrual for IR {ir.receipt_number}",
        ))
        # Liability: DR decreases
        accrued_account.balance -= ir.total_amount

    # CR each expense account (reverse the original debits)
    lines_result2 = await db.execute(
        select(ItemReceiptLine).where(ItemReceiptLine.item_receipt_id == ir.id)
    )
    for rl in lines_result2.scalars().all():
        if rl.account_id:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=rl.account_id,
                debit=Decimal("0"),
                credit=rl.amount,
                description=f"Reverse accrual for IR {ir.receipt_number}",
            ))
            acct = await db.get(Account, rl.account_id)
            if acct:
                if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                    acct.balance -= rl.amount
                else:
                    acct.balance += rl.amount

    # Now create the normal bill JE: DR expense accounts, CR AP (2010)
    entry_count_result2 = await db.execute(select(func.count(JournalEntry.id)))
    entry_count2 = entry_count_result2.scalar() or 0
    bill_entry_number = f"JE-{entry_count2 + 1:06d}"

    bill_je = JournalEntry(
        entry_number=bill_entry_number,
        entry_date=(bill_data or {}).get("bill_date") or today_str,
        description=f"Bill {bill_number} from {ir.vendor_name}",
        reference=f"BILL-{bill_number}",
        flock_id=ir.flock_id,
        is_posted=True,
    )
    db.add(bill_je)
    await db.flush()

    # DR expense accounts
    lines_result3 = await db.execute(
        select(ItemReceiptLine).where(ItemReceiptLine.item_receipt_id == ir.id)
    )
    for rl in lines_result3.scalars().all():
        if rl.account_id:
            db.add(JournalLine(
                journal_entry_id=bill_je.id,
                account_id=rl.account_id,
                debit=rl.amount,
                credit=Decimal("0"),
                description=f"Bill {bill_number} from {ir.vendor_name}",
            ))
            acct = await db.get(Account, rl.account_id)
            if acct:
                if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                    acct.balance += rl.amount
                else:
                    acct.balance -= rl.amount

    # CR Accounts Payable (2010)
    ap_result = await db.execute(
        select(Account).where(Account.account_number == "2010")
    )
    ap_account = ap_result.scalar_one_or_none()
    if ap_account:
        db.add(JournalLine(
            journal_entry_id=bill_je.id,
            account_id=ap_account.id,
            debit=Decimal("0"),
            credit=ir.total_amount,
            description=f"Bill {bill_number} from {ir.vendor_name}",
        ))
        # AP is liability: CR increases
        ap_account.balance += ir.total_amount

    # Update receipt status
    ir.status = ItemReceiptStatus.BILLED
    ir.bill_id = bill.id

    await db.commit()
    await db.refresh(bill)

    return {
        "receipt_id": ir.id,
        "receipt_number": ir.receipt_number,
        "bill_id": bill.id,
        "bill_number": bill.bill_number,
        "vendor_name": bill.vendor_name,
        "amount": float(bill.amount),
        "bill_status": bill.status.value if hasattr(bill.status, 'value') else bill.status,
        "receipt_status": ir.status.value if hasattr(ir.status, 'value') else ir.status,
        "reversal_je_number": entry_number,
        "bill_je_number": bill_entry_number,
    }


async def _item_receipt_to_dict(db: AsyncSession, ir: ItemReceipt) -> dict:
    """Serialize an ItemReceipt with its lines."""
    lines_result = await db.execute(
        select(ItemReceiptLine).where(ItemReceiptLine.item_receipt_id == ir.id)
    )
    lines = []
    for rl in lines_result.scalars().all():
        acct = await db.get(Account, rl.account_id) if rl.account_id else None
        lines.append({
            "id": rl.id, "item_description": rl.item_description,
            "quantity": float(rl.quantity), "cost": float(rl.cost),
            "amount": float(rl.amount), "account_id": rl.account_id,
            "account_name": acct.name if acct else "",
            "flock_id": rl.flock_id,
        })

    return {
        "id": ir.id,
        "receipt_number": ir.receipt_number,
        "vendor_name": ir.vendor_name,
        "vendor_id": ir.vendor_id,
        "receipt_date": ir.receipt_date,
        "total_amount": float(ir.total_amount),
        "status": ir.status.value if hasattr(ir.status, 'value') else ir.status,
        "description": ir.description,
        "flock_id": ir.flock_id,
        "notes": ir.notes,
        "ref_no": ir.ref_no,
        "bill_id": ir.bill_id,
        "journal_entry_id": ir.journal_entry_id,
        "lines": lines,
        "created_at": ir.created_at,
    }


# ── Flock Closeout ──

async def execute_flock_closeout(db: AsyncSession, flock_id: str, data: dict):
    """Close out a flock: generate closing journal entries and update flock status."""
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")
    if flock.status in (FlockStatus.SOLD, FlockStatus.CULLED):
        raise ValueError(f"Flock is already closed (status: {flock.status.value})")

    closeout_date = data["closeout_date"]
    bird_sale_revenue = Decimal(str(data.get("bird_sale_revenue", 0)))
    bird_sale_buyer = data.get("bird_sale_buyer")
    disposal_cost = Decimal(str(data.get("disposal_cost", 0)))
    remaining_feed_value = Decimal(str(data.get("remaining_feed_value", 0)))

    # Get total accumulated expenses for the flock (sum of debit JE lines tagged to this flock)
    expense_result = await db.execute(
        select(func.coalesce(func.sum(JournalLine.debit), 0))
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.flock_id == flock_id,
            JournalEntry.is_posted == True,
        )
    )
    total_expenses = Decimal(str(expense_result.scalar() or 0))

    # Get total accumulated revenue for the flock (sum of credit JE lines tagged to this flock)
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(JournalLine.credit), 0))
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.flock_id == flock_id,
            JournalEntry.is_posted == True,
        )
    )
    total_revenue = Decimal(str(revenue_result.scalar() or 0))

    # Create closing JE
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=closeout_date,
        description=f"Flock Closeout - {flock.flock_number}",
        reference=f"CLOSEOUT-{flock.flock_number}",
        flock_id=flock_id,
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    je_lines_created = []

    # If bird_sale_revenue > 0: DR Cash/AR (1010 or 1020), CR Bird Sale Revenue (4020)
    if bird_sale_revenue > 0:
        # DR Accounts Receivable (1020)
        ar_result = await db.execute(
            select(Account).where(Account.account_number == "1020")
        )
        ar_account = ar_result.scalar_one_or_none()
        if ar_account:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=ar_account.id,
                debit=bird_sale_revenue,
                credit=Decimal("0"),
                description=f"Bird sale - {flock.flock_number} to {bird_sale_buyer or 'buyer'}",
            ))
            ar_account.balance += bird_sale_revenue
            je_lines_created.append(f"DR A/R ${float(bird_sale_revenue):.2f}")

        # CR Bird Sale Revenue (4020) — if not found, use general revenue (4010)
        rev_result = await db.execute(
            select(Account).where(Account.account_number == "4020")
        )
        rev_account = rev_result.scalar_one_or_none()
        if not rev_account:
            rev_result = await db.execute(
                select(Account).where(Account.account_number == "4010")
            )
            rev_account = rev_result.scalar_one_or_none()
        if rev_account:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=rev_account.id,
                debit=Decimal("0"),
                credit=bird_sale_revenue,
                description=f"Bird sale revenue - {flock.flock_number}",
            ))
            # Revenue: CR increases
            rev_account.balance += bird_sale_revenue
            je_lines_created.append(f"CR Revenue ${float(bird_sale_revenue):.2f}")

    # If disposal_cost > 0: DR Disposal Expense (5090 or general expense), CR AP (2010)
    if disposal_cost > 0:
        # DR Disposal Expense — try 5090, fallback to general expense
        disp_result = await db.execute(
            select(Account).where(Account.account_number == "5090")
        )
        disp_account = disp_result.scalar_one_or_none()
        if not disp_account:
            disp_result = await db.execute(
                select(Account).where(Account.account_number == "5010")
            )
            disp_account = disp_result.scalar_one_or_none()
        if disp_account:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=disp_account.id,
                debit=disposal_cost,
                credit=Decimal("0"),
                description=f"Bird disposal cost - {flock.flock_number}",
            ))
            if disp_account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                disp_account.balance += disposal_cost
            else:
                disp_account.balance -= disposal_cost
            je_lines_created.append(f"DR Disposal Expense ${float(disposal_cost):.2f}")

        # CR Accounts Payable (2010)
        ap_result = await db.execute(
            select(Account).where(Account.account_number == "2010")
        )
        ap_account = ap_result.scalar_one_or_none()
        if ap_account:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=ap_account.id,
                debit=Decimal("0"),
                credit=disposal_cost,
                description=f"Bird disposal cost - {flock.flock_number}",
            ))
            ap_account.balance += disposal_cost
            je_lines_created.append(f"CR A/P ${float(disposal_cost):.2f}")

    # If remaining_feed_value > 0: DR Feed Inventory (1030), CR Feed Expense (5020)
    if remaining_feed_value > 0:
        # DR Feed Inventory (1030) — if not found, try general inventory
        inv_result = await db.execute(
            select(Account).where(Account.account_number == "1030")
        )
        inv_account = inv_result.scalar_one_or_none()
        if inv_account:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=inv_account.id,
                debit=remaining_feed_value,
                credit=Decimal("0"),
                description=f"Remaining feed value - {flock.flock_number}",
            ))
            inv_account.balance += remaining_feed_value
            je_lines_created.append(f"DR Feed Inventory ${float(remaining_feed_value):.2f}")

        # CR Feed Expense (5020) — reduces flock's feed cost
        feed_result = await db.execute(
            select(Account).where(Account.account_number == "5020")
        )
        feed_account = feed_result.scalar_one_or_none()
        if not feed_account:
            feed_result = await db.execute(
                select(Account).where(Account.account_number == "5010")
            )
            feed_account = feed_result.scalar_one_or_none()
        if feed_account:
            db.add(JournalLine(
                journal_entry_id=je.id,
                account_id=feed_account.id,
                debit=Decimal("0"),
                credit=remaining_feed_value,
                description=f"Remaining feed value transfer - {flock.flock_number}",
            ))
            if feed_account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                feed_account.balance -= remaining_feed_value
            else:
                feed_account.balance += remaining_feed_value
            je_lines_created.append(f"CR Feed Expense ${float(remaining_feed_value):.2f}")

    # Update flock status
    if bird_sale_revenue > 0:
        flock.status = FlockStatus.SOLD
        flock.sold_date = closeout_date
        if bird_sale_revenue > 0 and flock.current_bird_count > 0:
            flock.sale_price_per_bird = bird_sale_revenue / Decimal(str(flock.current_bird_count))
    else:
        flock.status = FlockStatus.CULLED

    flock.closeout_date = closeout_date

    await db.commit()
    await db.refresh(flock)

    net_income = total_revenue + bird_sale_revenue - total_expenses - disposal_cost + remaining_feed_value

    return {
        "flock_id": flock.id,
        "flock_number": flock.flock_number,
        "closeout_date": closeout_date,
        "status": flock.status.value if hasattr(flock.status, 'value') else flock.status,
        "summary": {
            "total_accumulated_expenses": float(total_expenses),
            "total_accumulated_revenue": float(total_revenue),
            "bird_sale_revenue": float(bird_sale_revenue),
            "bird_sale_buyer": bird_sale_buyer,
            "disposal_cost": float(disposal_cost),
            "remaining_feed_value": float(remaining_feed_value),
            "net_income": float(net_income),
        },
        "journal_entry_number": entry_number,
        "journal_lines_created": je_lines_created,
    }


# ── Flock-Accounting Integration: Suggest Flocks for Vendor ──

async def get_suggested_flocks_for_vendor(db: AsyncSession, vendor_id: str):
    """Given a vendor_id, return flocks currently placed at that vendor's linked grower/barn locations."""
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise ValueError("Vendor not found")

    # Try to find a grower whose name matches the vendor name
    grower_result = await db.execute(
        select(Grower).where(Grower.name.ilike(f"%{vendor.name}%"), Grower.is_active == True)
    )
    growers = grower_result.scalars().all()

    if not growers:
        return []

    suggested = []
    for grower in growers:
        # Find all barns for this grower
        barns_result = await db.execute(
            select(Barn).where(Barn.grower_id == grower.id)
        )
        barns = barns_result.scalars().all()
        barn_ids = [b.id for b in barns]
        barn_map = {b.id: b.name for b in barns}

        if not barn_ids:
            continue

        # Find current flock placements at those barns
        placements_result = await db.execute(
            select(FlockPlacement).where(
                FlockPlacement.barn_id.in_(barn_ids),
                FlockPlacement.is_current == True,
            )
        )
        placements = placements_result.scalars().all()

        for placement in placements:
            flock = await db.get(Flock, placement.flock_id)
            if flock:
                suggested.append({
                    "flock_id": flock.id,
                    "flock_number": flock.flock_number,
                    "barn_id": placement.barn_id,
                    "barn_name": barn_map.get(placement.barn_id, ""),
                    "grower_id": grower.id,
                    "grower_name": grower.name,
                    "bird_count": placement.bird_count,
                })

    return suggested


async def get_active_flocks_with_location(db: AsyncSession):
    """Return all active flocks with their current barn/grower info."""
    flocks_result = await db.execute(
        select(Flock).where(Flock.status.in_([FlockStatus.ACTIVE, FlockStatus.CLOSING]))
        .order_by(Flock.flock_number)
    )
    flocks = flocks_result.scalars().all()

    result = []
    for flock in flocks:
        # Find current placement
        placement_result = await db.execute(
            select(FlockPlacement).where(
                FlockPlacement.flock_id == flock.id,
                FlockPlacement.is_current == True,
            )
        )
        placements = placement_result.scalars().all()

        locations = []
        for p in placements:
            barn = await db.get(Barn, p.barn_id)
            grower = await db.get(Grower, barn.grower_id) if barn else None
            locations.append({
                "barn_id": p.barn_id,
                "barn_name": barn.name if barn else "",
                "grower_id": grower.id if grower else None,
                "grower_name": grower.name if grower else "",
                "bird_count": p.bird_count,
            })

        result.append({
            "flock_id": flock.id,
            "flock_number": flock.flock_number,
            "flock_type": flock.flock_type.value if hasattr(flock.flock_type, 'value') else flock.flock_type,
            "status": flock.status.value if hasattr(flock.status, 'value') else flock.status,
            "current_bird_count": flock.current_bird_count,
            "locations": locations,
        })

    return result


# ── Feed Delivery to Bill Auto-Link ──

async def _next_bill_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(Bill.id)))
    count = result.scalar() or 0
    return f"BILL-{count + 1:06d}"


async def create_bill_from_feed_delivery(db: AsyncSession, delivery_id: str):
    """Auto-create a bill from a feed delivery record."""
    delivery = await db.get(FeedDelivery, delivery_id)
    if not delivery:
        raise ValueError("Feed delivery not found")

    # Get vendor info
    vendor = await db.get(Vendor, delivery.vendor_id) if delivery.vendor_id else None
    vendor_name = vendor.name if vendor else "Unknown Feed Mill"

    # Calculate amount from delivery cost fields
    amount = delivery.total_cost
    if not amount and delivery.cost_per_ton:
        amount = delivery.tons * delivery.cost_per_ton
    if not amount:
        raise ValueError("Feed delivery has no cost information")

    bill_number = await _next_bill_number(db)

    # Due date 30 days from delivery
    delivery_date = date.fromisoformat(delivery.delivery_date)
    due = delivery_date + timedelta(days=30)

    bill = Bill(
        bill_number=bill_number,
        vendor_name=vendor_name,
        vendor_id=delivery.vendor_id,
        bill_date=delivery.delivery_date,
        due_date=due.isoformat(),
        amount=Decimal(str(amount)),
        description=f"Feed delivery {delivery.ticket_number} - {delivery.feed_type.value if hasattr(delivery.feed_type, 'value') else delivery.feed_type} ({float(delivery.tons)} tons)",
        flock_id=delivery.flock_id,
        ref_no=delivery.ticket_number,
        status=BillStatus.RECEIVED,
    )
    db.add(bill)
    await db.flush()

    # Add expense line for feed account (5010)
    feed_account_result = await db.execute(
        select(Account).where(Account.account_number == "5010")
    )
    feed_account = feed_account_result.scalar_one_or_none()

    if feed_account:
        expense_line = BillExpenseLine(
            bill_id=bill.id,
            account_id=feed_account.id,
            amount=Decimal(str(amount)),
            memo=f"Feed: {delivery.feed_type.value if hasattr(delivery.feed_type, 'value') else delivery.feed_type} - {float(delivery.tons)} tons",
            flock_id=delivery.flock_id,
        )
        db.add(expense_line)

    await db.commit()
    await db.refresh(bill)
    return await _bill_to_dict(db, bill)


# ── Flock Budget ──

async def create_flock_budget(db: AsyncSession, flock_id: str, budgets: list):
    """Create budget entries for a flock (list of {category, amount, notes})."""
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    created = []
    for entry in budgets:
        budget = FlockBudget(
            flock_id=flock_id,
            category=ExpenseCategory(entry["category"]),
            budgeted_amount=Decimal(str(entry["amount"])),
            notes=entry.get("notes"),
        )
        db.add(budget)
        await db.flush()
        created.append({
            "id": budget.id,
            "flock_id": budget.flock_id,
            "category": budget.category.value if hasattr(budget.category, 'value') else budget.category,
            "budgeted_amount": float(budget.budgeted_amount),
            "notes": budget.notes,
        })

    await db.commit()
    return {"flock_id": flock_id, "flock_number": flock.flock_number, "budgets": created}


async def get_flock_budget(db: AsyncSession, flock_id: str):
    """Get all budget entries for a flock."""
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    result = await db.execute(
        select(FlockBudget).where(FlockBudget.flock_id == flock_id).order_by(FlockBudget.category)
    )
    budgets = [{
        "id": b.id,
        "flock_id": b.flock_id,
        "category": b.category.value if hasattr(b.category, 'value') else b.category,
        "budgeted_amount": float(b.budgeted_amount),
        "notes": b.notes,
    } for b in result.scalars().all()]

    total_budget = sum(b["budgeted_amount"] for b in budgets)
    return {
        "flock_id": flock_id,
        "flock_number": flock.flock_number,
        "total_budget": round(total_budget, 2),
        "budgets": budgets,
    }


async def get_flock_budget_variance(db: AsyncSession, flock_id: str):
    """Compare actual expenses (from JournalEntry where flock_id) to budget by category."""
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Get budgets
    budget_result = await db.execute(
        select(FlockBudget).where(FlockBudget.flock_id == flock_id)
    )
    budgets = {b.category.value if hasattr(b.category, 'value') else b.category: float(b.budgeted_amount)
               for b in budget_result.scalars().all()}

    # Get actual expenses by category
    categories = [e.value for e in ExpenseCategory]
    variance = []

    for cat in categories:
        actual_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(
                JournalEntry.flock_id == flock_id,
                JournalEntry.is_posted == True,
                JournalEntry.expense_category == cat,
                Account.account_type == AccountType.EXPENSE,
            )
        )
        actual = float(actual_result.scalar() or 0)
        budgeted = budgets.get(cat, 0)
        var = round(budgeted - actual, 2)

        variance.append({
            "category": cat,
            "budgeted": round(budgeted, 2),
            "actual": round(actual, 2),
            "variance": var,
            "over_budget": var < 0,
        })

    total_budgeted = sum(v["budgeted"] for v in variance)
    total_actual = sum(v["actual"] for v in variance)

    return {
        "flock_id": flock_id,
        "flock_number": flock.flock_number,
        "total_budgeted": round(total_budgeted, 2),
        "total_actual": round(total_actual, 2),
        "total_variance": round(total_budgeted - total_actual, 2),
        "categories": variance,
    }


# ── Shared Expense Allocation ──

async def allocate_expense(db: AsyncSession, data: dict):
    """Allocate an expense across multiple flocks by bird_count, equal, or custom method."""
    amount = Decimal(str(data["amount"]))
    description = data["description"]
    account_id = data["account_id"]
    allocation_method = data["allocation_method"]
    flock_ids = data["flock_ids"]
    custom_percentages = data.get("custom_percentages")

    if not flock_ids:
        raise ValueError("At least one flock_id is required")

    # Validate account exists
    account = await db.get(Account, account_id)
    if not account:
        raise ValueError("Expense account not found")

    # Calculate allocations
    allocations = []
    if allocation_method == "equal":
        per_flock = amount / len(flock_ids)
        for flock_id in flock_ids:
            flock = await db.get(Flock, flock_id)
            if not flock:
                raise ValueError(f"Flock {flock_id} not found")
            allocations.append({
                "flock_id": flock_id,
                "flock_number": flock.flock_number,
                "amount": per_flock,
                "percentage": round(100 / len(flock_ids), 2),
            })

    elif allocation_method == "bird_count":
        total_birds = 0
        flock_data = []
        for flock_id in flock_ids:
            flock = await db.get(Flock, flock_id)
            if not flock:
                raise ValueError(f"Flock {flock_id} not found")
            flock_data.append(flock)
            total_birds += flock.current_bird_count

        if total_birds == 0:
            raise ValueError("Total bird count across flocks is zero")

        for flock in flock_data:
            pct = Decimal(str(flock.current_bird_count)) / Decimal(str(total_birds))
            flock_amount = amount * pct
            allocations.append({
                "flock_id": flock.id,
                "flock_number": flock.flock_number,
                "amount": flock_amount,
                "percentage": round(float(pct * 100), 2),
                "bird_count": flock.current_bird_count,
            })

    elif allocation_method == "custom":
        if not custom_percentages or len(custom_percentages) != len(flock_ids):
            raise ValueError("Custom percentages must match the number of flocks")
        total_pct = sum(custom_percentages)
        if abs(total_pct - 100) > 0.01:
            raise ValueError(f"Custom percentages must sum to 100 (got {total_pct})")

        for i, flock_id in enumerate(flock_ids):
            flock = await db.get(Flock, flock_id)
            if not flock:
                raise ValueError(f"Flock {flock_id} not found")
            pct = Decimal(str(custom_percentages[i])) / Decimal("100")
            flock_amount = amount * pct
            allocations.append({
                "flock_id": flock_id,
                "flock_number": flock.flock_number,
                "amount": flock_amount,
                "percentage": custom_percentages[i],
            })
    else:
        raise ValueError(f"Invalid allocation_method: {allocation_method}")

    # Create one JournalEntry per flock allocation for proper flock-level tracking
    allocation_results = []
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0

    for idx, alloc in enumerate(allocations):
        flock_amount = alloc["amount"]
        flock_je_number = f"JE-{entry_count + 1 + idx:06d}"

        flock_je = JournalEntry(
            entry_number=flock_je_number,
            entry_date=date.today().isoformat(),
            description=f"{description} (allocated to {alloc['flock_number']})",
            flock_id=alloc["flock_id"],
            expense_category=data.get("expense_category"),
            reference=f"ALLOC-{date.today().isoformat()}",
            is_posted=True,
        )
        db.add(flock_je)
        await db.flush()

        # DR expense
        db.add(JournalLine(
            journal_entry_id=flock_je.id,
            account_id=account_id,
            debit=flock_amount,
            credit=Decimal("0"),
            description=f"{description} ({alloc['percentage']}%)",
        ))

        # CR cash/clearing account (1010 Cash)
        cash_result = await db.execute(
            select(Account).where(Account.account_number == "1010")
        )
        cash_account = cash_result.scalar_one_or_none()
        if cash_account:
            db.add(JournalLine(
                journal_entry_id=flock_je.id,
                account_id=cash_account.id,
                debit=Decimal("0"),
                credit=flock_amount,
                description=f"{description} ({alloc['percentage']}%)",
            ))

        allocation_results.append({
            "flock_id": alloc["flock_id"],
            "flock_number": alloc["flock_number"],
            "amount": round(float(flock_amount), 2),
            "percentage": alloc["percentage"],
            "journal_entry_number": flock_je_number,
        })

    await db.commit()

    return {
        "total_amount": float(amount),
        "allocation_method": allocation_method,
        "description": description,
        "allocations": allocation_results,
    }


# ── Grower Settlement Calculation ──

async def calculate_grower_settlement(db: AsyncSession, flock_id: str):
    """Calculate grower settlement using the grower's payment formula."""
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Find the grower via flock placement
    placement_result = await db.execute(
        select(FlockPlacement).where(
            FlockPlacement.flock_id == flock_id,
            FlockPlacement.is_current == True,
        ).limit(1)
    )
    placement = placement_result.scalar_one_or_none()
    if not placement:
        raise ValueError("No current placement found for this flock")

    barn = await db.get(Barn, placement.barn_id)
    if not barn:
        raise ValueError("Barn not found")

    grower = await db.get(Grower, barn.grower_id)
    if not grower:
        raise ValueError("Grower not found")

    # Get payment formula
    formula_result = await db.execute(
        select(GrowerPaymentFormula).where(
            GrowerPaymentFormula.grower_id == grower.id,
            GrowerPaymentFormula.is_active == True,
        ).limit(1)
    )
    formula = formula_result.scalar_one_or_none()
    if not formula:
        raise ValueError(f"No active payment formula found for grower {grower.name}")

    # Calculate weeks active
    try:
        arrival = date.fromisoformat(flock.arrival_date)
        today = date.today()
        weeks_active = max(1, (today - arrival).days / 7)
    except ValueError:
        weeks_active = 1

    # Calculate base payment
    base_rate = float(formula.base_rate_per_bird)
    base_payment = flock.initial_bird_count * base_rate * weeks_active

    # Calculate mortality
    mortality_result = await db.execute(
        select(func.coalesce(func.sum(MortalityRecord.deaths + MortalityRecord.culls), 0))
        .where(MortalityRecord.flock_id == flock_id)
    )
    total_mortality = int(mortality_result.scalar() or 0)
    mortality_pct = (total_mortality / flock.initial_bird_count * 100) if flock.initial_bird_count > 0 else 0

    # Standard mortality allowance (5%). Excess beyond that gets deducted.
    standard_mortality_pct = 5.0
    excess_mortality_pct = max(0, mortality_pct - standard_mortality_pct)
    mortality_deduction = excess_mortality_pct * float(formula.mortality_deduction_rate) * flock.initial_bird_count

    # Calculate production bonus
    prod_result = await db.execute(
        select(func.avg(ProductionRecord.production_pct))
        .where(ProductionRecord.flock_id == flock_id)
    )
    avg_production = float(prod_result.scalar() or 0)
    production_target = float(formula.production_target_pct)
    production_above_target = max(0, avg_production - production_target)
    production_bonus = production_above_target * float(formula.production_bonus_rate) * flock.initial_bird_count

    # Feed conversion bonus (simplified - bonus per bird if feed conversion is good)
    feed_conversion_bonus = float(formula.feed_conversion_bonus) * flock.current_bird_count

    # Total settlement
    total = round(base_payment - mortality_deduction + production_bonus + feed_conversion_bonus, 2)

    return {
        "flock_id": flock_id,
        "flock_number": flock.flock_number,
        "grower_id": grower.id,
        "grower_name": grower.name,
        "formula_id": formula.id,
        "weeks_active": round(weeks_active, 1),
        "initial_bird_count": flock.initial_bird_count,
        "current_bird_count": flock.current_bird_count,
        "breakdown": {
            "base_rate_per_bird": base_rate,
            "base_payment": round(base_payment, 2),
            "mortality_pct": round(mortality_pct, 2),
            "excess_mortality_pct": round(excess_mortality_pct, 2),
            "mortality_deduction": round(mortality_deduction, 2),
            "avg_production_pct": round(avg_production, 2),
            "production_target_pct": production_target,
            "production_above_target": round(production_above_target, 2),
            "production_bonus": round(production_bonus, 2),
            "feed_conversion_bonus": round(feed_conversion_bonus, 2),
        },
        "total_settlement": total,
    }


async def execute_grower_settlement(db: AsyncSession, flock_id: str):
    """Execute a grower settlement: calculate, create bill + JE."""
    settlement = await calculate_grower_settlement(db, flock_id)

    total = Decimal(str(settlement["total_settlement"]))
    if total <= 0:
        raise ValueError("Settlement amount must be positive")

    # Create bill for the grower
    bill_number = await _next_bill_number(db)
    today_str = date.today().isoformat()
    due = date.today() + timedelta(days=30)

    bill = Bill(
        bill_number=bill_number,
        vendor_name=settlement["grower_name"],
        bill_date=today_str,
        due_date=due.isoformat(),
        amount=total,
        description=f"Grower settlement for flock {settlement['flock_number']}",
        flock_id=flock_id,
        status=BillStatus.RECEIVED,
    )
    db.add(bill)
    await db.flush()

    # Add expense line for grower payment account (5020)
    grower_account_result = await db.execute(
        select(Account).where(Account.account_number == "5020")
    )
    grower_account = grower_account_result.scalar_one_or_none()

    if grower_account:
        expense_line = BillExpenseLine(
            bill_id=bill.id,
            account_id=grower_account.id,
            amount=total,
            memo=f"Grower settlement - {settlement['flock_number']}",
            flock_id=flock_id,
        )
        db.add(expense_line)

    # Create JE: DR Grower Payment expense, CR Accounts Payable
    entry_count_result = await db.execute(select(func.count(JournalEntry.id)))
    entry_count = entry_count_result.scalar() or 0
    entry_number = f"JE-{entry_count + 1:06d}"

    je = JournalEntry(
        entry_number=entry_number,
        entry_date=today_str,
        description=f"Grower settlement: {settlement['grower_name']} - Flock {settlement['flock_number']}",
        flock_id=flock_id,
        expense_category=ExpenseCategory.GROWER_PAYMENT,
        reference=f"SETTLE-{bill_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # DR expense account
    if grower_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=grower_account.id,
            debit=total,
            credit=Decimal("0"),
            description=f"Grower settlement - {settlement['grower_name']}",
        ))
        if grower_account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
            grower_account.balance += total
        else:
            grower_account.balance -= total

    # CR Accounts Payable (2010)
    ap_result = await db.execute(
        select(Account).where(Account.account_number == "2010")
    )
    ap_account = ap_result.scalar_one_or_none()

    if ap_account:
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ap_account.id,
            debit=Decimal("0"),
            credit=total,
            description=f"Grower settlement - {settlement['grower_name']}",
        ))
        # AP is liability: CR increases
        ap_account.balance += total

    await db.commit()
    await db.refresh(bill)

    settlement["bill_id"] = bill.id
    settlement["bill_number"] = bill_number
    settlement["journal_entry_number"] = entry_number
    return settlement


# ── Tier 2: Auto-number generators ──

async def _next_je_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(JournalEntry.id)))
    count = result.scalar() or 0
    return f"JE-{count + 1:06d}"


async def _next_sales_receipt_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(SalesReceipt.id)))
    count = result.scalar() or 0
    return f"SR-{count + 1:06d}"


async def _next_refund_receipt_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(RefundReceipt.id)))
    count = result.scalar() or 0
    return f"RR-{count + 1:06d}"


async def _next_cc_charge_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(CreditCardCharge.id)))
    count = result.scalar() or 0
    return f"CC-{count + 1:06d}"


async def _next_cc_credit_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(CreditCardCredit.id)))
    count = result.scalar() or 0
    return f"CCR-{count + 1:06d}"


async def _next_customer_deposit_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(CustomerDepositModel.id)))
    count = result.scalar() or 0
    return f"DEP-{count + 1:06d}"


async def _next_finance_charge_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(FinanceCharge.id)))
    count = result.scalar() or 0
    return f"FC-{count + 1:06d}"


async def _next_inventory_adjustment_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(InventoryAdjustment.id)))
    count = result.scalar() or 0
    return f"ADJ-{count + 1:06d}"


# ── Tier 2: Sales Receipts ──

async def create_sales_receipt(db: AsyncSession, data: dict):
    """Create a cash egg sale receipt + JE (DR deposit account, CR revenue)."""
    amount = Decimal(str(data["amount"]))
    receipt_number = await _next_sales_receipt_number(db)

    sr = SalesReceipt(
        receipt_number=receipt_number,
        customer_name=data["customer_name"],
        customer_id=data.get("customer_id"),
        receipt_date=data["receipt_date"],
        payment_method=PaymentMethod(data.get("payment_method", "cash")),
        amount=amount,
        deposit_to_account_id=data.get("deposit_to_account_id"),
        memo=data.get("memo"),
        flock_id=data.get("flock_id"),
        status=SalesReceiptStatus.COMPLETED,
    )
    db.add(sr)
    await db.flush()

    # Add line items
    line_items_out = []
    for li in data.get("line_items", []):
        line = SalesReceiptLineItem(
            sales_receipt_id=sr.id,
            item_description=li["item_description"],
            quantity=Decimal(str(li.get("quantity", 1))),
            rate=Decimal(str(li.get("rate", 0))),
            amount=Decimal(str(li["amount"])),
            flock_id=li.get("flock_id"),
        )
        db.add(line)
        await db.flush()
        line_items_out.append({
            "id": line.id, "item_description": line.item_description,
            "quantity": float(line.quantity), "rate": float(line.rate),
            "amount": float(line.amount), "flock_id": line.flock_id,
        })

    # Create JE: DR deposit account, CR revenue
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["receipt_date"],
        description=f"Sales Receipt {receipt_number} - {data['customer_name']}",
        reference=f"SR-{receipt_number}",
        flock_id=data.get("flock_id"),
        is_posted=True,
    )
    db.add(je)
    await db.flush()
    sr.journal_entry_id = je.id

    # DR deposit account (default: Cash 1010)
    debit_account_id = data.get("deposit_to_account_id")
    if not debit_account_id:
        cash_result = await db.execute(select(Account).where(Account.account_number == "1010"))
        cash_acct = cash_result.scalar_one_or_none()
        if cash_acct:
            debit_account_id = cash_acct.id

    if debit_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=debit_account_id,
            debit=amount, credit=Decimal("0"),
            description=f"Sales Receipt {receipt_number} - {data['customer_name']}",
        ))
        acct = await db.get(Account, debit_account_id)
        if acct:
            acct.balance += amount

    # CR Egg Sales Revenue (4010)
    rev_result = await db.execute(select(Account).where(Account.account_number == "4010"))
    rev_account = rev_result.scalar_one_or_none()
    if rev_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=rev_account.id,
            debit=Decimal("0"), credit=amount,
            description=f"Sales Receipt {receipt_number} - {data['customer_name']}",
        ))
        rev_account.balance += amount  # Revenue: CR increases

    await db.commit()
    await db.refresh(sr)
    return {
        "id": sr.id, "receipt_number": sr.receipt_number,
        "customer_name": sr.customer_name, "customer_id": sr.customer_id,
        "receipt_date": sr.receipt_date,
        "payment_method": sr.payment_method.value if hasattr(sr.payment_method, 'value') else sr.payment_method,
        "amount": float(sr.amount),
        "deposit_to_account_id": sr.deposit_to_account_id,
        "memo": sr.memo, "flock_id": sr.flock_id,
        "status": sr.status.value if hasattr(sr.status, 'value') else sr.status,
        "line_items": line_items_out,
        "journal_entry_number": entry_number,
        "created_at": sr.created_at,
    }


async def get_sales_receipts(db: AsyncSession, status: str = None):
    query = select(SalesReceipt).order_by(SalesReceipt.receipt_date.desc())
    if status:
        query = query.where(SalesReceipt.status == status)
    result = await db.execute(query)
    out = []
    for sr in result.scalars().all():
        lines_result = await db.execute(
            select(SalesReceiptLineItem).where(SalesReceiptLineItem.sales_receipt_id == sr.id)
        )
        line_items = [{
            "id": li.id, "item_description": li.item_description,
            "quantity": float(li.quantity), "rate": float(li.rate),
            "amount": float(li.amount), "flock_id": li.flock_id,
        } for li in lines_result.scalars().all()]
        out.append({
            "id": sr.id, "receipt_number": sr.receipt_number,
            "customer_name": sr.customer_name, "customer_id": sr.customer_id,
            "receipt_date": sr.receipt_date,
            "payment_method": sr.payment_method.value if hasattr(sr.payment_method, 'value') else sr.payment_method,
            "amount": float(sr.amount),
            "deposit_to_account_id": sr.deposit_to_account_id,
            "memo": sr.memo, "flock_id": sr.flock_id,
            "status": sr.status.value if hasattr(sr.status, 'value') else sr.status,
            "line_items": line_items,
            "created_at": sr.created_at,
        })
    return out


async def void_sales_receipt(db: AsyncSession, receipt_id: str):
    sr = await db.get(SalesReceipt, receipt_id)
    if not sr:
        raise ValueError("Sales receipt not found")
    if sr.status == SalesReceiptStatus.VOIDED:
        raise ValueError("Sales receipt is already voided")

    sr.status = SalesReceiptStatus.VOIDED

    # Create reversing JE
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=sr.receipt_date,
        description=f"VOID Sales Receipt {sr.receipt_number}",
        reference=f"VOID-SR-{sr.receipt_number}",
        flock_id=sr.flock_id,
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # Reverse: CR deposit account, DR revenue
    debit_account_id = sr.deposit_to_account_id
    if not debit_account_id:
        cash_result = await db.execute(select(Account).where(Account.account_number == "1010"))
        cash_acct = cash_result.scalar_one_or_none()
        if cash_acct:
            debit_account_id = cash_acct.id

    if debit_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=debit_account_id,
            debit=Decimal("0"), credit=sr.amount,
            description=f"VOID Sales Receipt {sr.receipt_number}",
        ))
        acct = await db.get(Account, debit_account_id)
        if acct:
            acct.balance -= sr.amount

    rev_result = await db.execute(select(Account).where(Account.account_number == "4010"))
    rev_account = rev_result.scalar_one_or_none()
    if rev_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=rev_account.id,
            debit=sr.amount, credit=Decimal("0"),
            description=f"VOID Sales Receipt {sr.receipt_number}",
        ))
        rev_account.balance -= sr.amount

    await db.commit()
    await db.refresh(sr)
    return {
        "id": sr.id, "receipt_number": sr.receipt_number,
        "status": sr.status.value, "journal_entry_number": entry_number,
    }


# ── Tier 2: Refund Receipts ──

async def create_refund_receipt(db: AsyncSession, data: dict):
    """Create a refund receipt + reversing JE (DR revenue, CR cash/refund account)."""
    amount = Decimal(str(data["amount"]))
    refund_number = await _next_refund_receipt_number(db)

    rr = RefundReceipt(
        refund_number=refund_number,
        customer_name=data["customer_name"],
        customer_id=data.get("customer_id"),
        refund_date=data["refund_date"],
        refund_method=PaymentMethod(data.get("refund_method", "cash")),
        amount=amount,
        refund_from_account_id=data.get("refund_from_account_id"),
        memo=data.get("memo"),
        original_receipt_id=data.get("original_receipt_id"),
        status=RefundReceiptStatus.COMPLETED,
    )
    db.add(rr)
    await db.flush()

    # Add line items
    line_items_out = []
    for li in data.get("line_items", []):
        line = RefundReceiptLineItem(
            refund_receipt_id=rr.id,
            item_description=li["item_description"],
            quantity=Decimal(str(li.get("quantity", 1))),
            rate=Decimal(str(li.get("rate", 0))),
            amount=Decimal(str(li["amount"])),
        )
        db.add(line)
        await db.flush()
        line_items_out.append({
            "id": line.id, "item_description": line.item_description,
            "quantity": float(line.quantity), "rate": float(line.rate),
            "amount": float(line.amount),
        })

    # Create reversing JE: DR revenue, CR cash/refund account
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["refund_date"],
        description=f"Refund Receipt {refund_number} - {data['customer_name']}",
        reference=f"RR-{refund_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()
    rr.journal_entry_id = je.id

    # DR Egg Sales Revenue (4010) — reduces revenue
    rev_result = await db.execute(select(Account).where(Account.account_number == "4010"))
    rev_account = rev_result.scalar_one_or_none()
    if rev_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=rev_account.id,
            debit=amount, credit=Decimal("0"),
            description=f"Refund Receipt {refund_number} - {data['customer_name']}",
        ))
        rev_account.balance -= amount

    # CR refund account (default: Cash 1010)
    credit_account_id = data.get("refund_from_account_id")
    if not credit_account_id:
        cash_result = await db.execute(select(Account).where(Account.account_number == "1010"))
        cash_acct = cash_result.scalar_one_or_none()
        if cash_acct:
            credit_account_id = cash_acct.id

    if credit_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=credit_account_id,
            debit=Decimal("0"), credit=amount,
            description=f"Refund Receipt {refund_number} - {data['customer_name']}",
        ))
        acct = await db.get(Account, credit_account_id)
        if acct:
            acct.balance -= amount

    await db.commit()
    await db.refresh(rr)
    return {
        "id": rr.id, "refund_number": rr.refund_number,
        "customer_name": rr.customer_name, "customer_id": rr.customer_id,
        "refund_date": rr.refund_date,
        "refund_method": rr.refund_method.value if hasattr(rr.refund_method, 'value') else rr.refund_method,
        "amount": float(rr.amount),
        "refund_from_account_id": rr.refund_from_account_id,
        "memo": rr.memo, "original_receipt_id": rr.original_receipt_id,
        "status": rr.status.value if hasattr(rr.status, 'value') else rr.status,
        "line_items": line_items_out,
        "journal_entry_number": entry_number,
        "created_at": rr.created_at,
    }


async def get_refund_receipts(db: AsyncSession, status: str = None):
    query = select(RefundReceipt).order_by(RefundReceipt.refund_date.desc())
    if status:
        query = query.where(RefundReceipt.status == status)
    result = await db.execute(query)
    out = []
    for rr in result.scalars().all():
        lines_result = await db.execute(
            select(RefundReceiptLineItem).where(RefundReceiptLineItem.refund_receipt_id == rr.id)
        )
        line_items = [{
            "id": li.id, "item_description": li.item_description,
            "quantity": float(li.quantity), "rate": float(li.rate),
            "amount": float(li.amount),
        } for li in lines_result.scalars().all()]
        out.append({
            "id": rr.id, "refund_number": rr.refund_number,
            "customer_name": rr.customer_name, "customer_id": rr.customer_id,
            "refund_date": rr.refund_date,
            "refund_method": rr.refund_method.value if hasattr(rr.refund_method, 'value') else rr.refund_method,
            "amount": float(rr.amount),
            "refund_from_account_id": rr.refund_from_account_id,
            "memo": rr.memo, "original_receipt_id": rr.original_receipt_id,
            "status": rr.status.value if hasattr(rr.status, 'value') else rr.status,
            "line_items": line_items,
            "created_at": rr.created_at,
        })
    return out


async def void_refund_receipt(db: AsyncSession, receipt_id: str):
    rr = await db.get(RefundReceipt, receipt_id)
    if not rr:
        raise ValueError("Refund receipt not found")
    if rr.status == RefundReceiptStatus.VOIDED:
        raise ValueError("Refund receipt is already voided")

    rr.status = RefundReceiptStatus.VOIDED

    # Reversing JE: CR revenue (restore), DR cash (restore)
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=rr.refund_date,
        description=f"VOID Refund Receipt {rr.refund_number}",
        reference=f"VOID-RR-{rr.refund_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    rev_result = await db.execute(select(Account).where(Account.account_number == "4010"))
    rev_account = rev_result.scalar_one_or_none()
    if rev_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=rev_account.id,
            debit=Decimal("0"), credit=rr.amount,
            description=f"VOID Refund Receipt {rr.refund_number}",
        ))
        rev_account.balance += rr.amount

    credit_account_id = rr.refund_from_account_id
    if not credit_account_id:
        cash_result = await db.execute(select(Account).where(Account.account_number == "1010"))
        cash_acct = cash_result.scalar_one_or_none()
        if cash_acct:
            credit_account_id = cash_acct.id

    if credit_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=credit_account_id,
            debit=rr.amount, credit=Decimal("0"),
            description=f"VOID Refund Receipt {rr.refund_number}",
        ))
        acct = await db.get(Account, credit_account_id)
        if acct:
            acct.balance += rr.amount

    await db.commit()
    return {
        "id": rr.id, "refund_number": rr.refund_number,
        "status": rr.status.value, "journal_entry_number": entry_number,
    }


# ── Tier 2: Credit Card Charges ──

async def create_cc_charge(db: AsyncSession, data: dict):
    """Create a credit card charge + JE (DR expense accounts, CR CC liability)."""
    amount = Decimal(str(data["amount"]))
    charge_number = await _next_cc_charge_number(db)

    cc = CreditCardCharge(
        charge_number=charge_number,
        credit_card_account_id=data["credit_card_account_id"],
        vendor_name=data["vendor_name"],
        vendor_id=data.get("vendor_id"),
        charge_date=data["charge_date"],
        amount=amount,
        memo=data.get("memo"),
        flock_id=data.get("flock_id"),
        status=CreditCardChargeStatus.PENDING,
    )
    db.add(cc)
    await db.flush()

    # Add expense lines
    expense_lines_out = []
    je_debit_lines = []
    for el in data.get("expense_lines", []):
        line = CreditCardChargeExpenseLine(
            charge_id=cc.id,
            account_id=el["account_id"],
            amount=Decimal(str(el["amount"])),
            memo=el.get("memo"),
            flock_id=el.get("flock_id"),
        )
        db.add(line)
        await db.flush()
        acct = await db.get(Account, el["account_id"]) if el.get("account_id") else None
        expense_lines_out.append({
            "id": line.id, "account_id": line.account_id,
            "account_name": acct.name if acct else "",
            "amount": float(line.amount), "memo": line.memo,
            "flock_id": line.flock_id,
        })
        je_debit_lines.append({"account_id": el["account_id"], "amount": Decimal(str(el["amount"]))})

    # Create JE: DR expense accounts, CR CC liability account
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["charge_date"],
        description=f"CC Charge {charge_number} - {data['vendor_name']}",
        reference=f"CC-{charge_number}",
        flock_id=data.get("flock_id"),
        is_posted=True,
    )
    db.add(je)
    await db.flush()
    cc.journal_entry_id = je.id

    # DR each expense account
    for dl in je_debit_lines:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=dl["account_id"],
            debit=dl["amount"], credit=Decimal("0"),
            description=f"CC Charge {charge_number} - {data['vendor_name']}",
        ))
        acct = await db.get(Account, dl["account_id"])
        if acct:
            if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                acct.balance += dl["amount"]
            else:
                acct.balance -= dl["amount"]

    # CR CC liability account
    cc_account = await db.get(Account, data["credit_card_account_id"])
    if cc_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=cc_account.id,
            debit=Decimal("0"), credit=amount,
            description=f"CC Charge {charge_number} - {data['vendor_name']}",
        ))
        # CC is liability: CR increases
        cc_account.balance += amount

    await db.commit()
    await db.refresh(cc)
    return {
        "id": cc.id, "charge_number": cc.charge_number,
        "credit_card_account_id": cc.credit_card_account_id,
        "vendor_name": cc.vendor_name, "vendor_id": cc.vendor_id,
        "charge_date": cc.charge_date, "amount": float(cc.amount),
        "memo": cc.memo, "flock_id": cc.flock_id,
        "status": cc.status.value if hasattr(cc.status, 'value') else cc.status,
        "expense_lines": expense_lines_out,
        "journal_entry_number": entry_number,
        "created_at": cc.created_at,
    }


async def get_cc_charges(db: AsyncSession, status: str = None):
    query = select(CreditCardCharge).order_by(CreditCardCharge.charge_date.desc())
    if status:
        query = query.where(CreditCardCharge.status == status)
    result = await db.execute(query)
    out = []
    for cc in result.scalars().all():
        exp_result = await db.execute(
            select(CreditCardChargeExpenseLine).where(CreditCardChargeExpenseLine.charge_id == cc.id)
        )
        expense_lines = []
        for el in exp_result.scalars().all():
            acct = await db.get(Account, el.account_id) if el.account_id else None
            expense_lines.append({
                "id": el.id, "account_id": el.account_id,
                "account_name": acct.name if acct else "",
                "amount": float(el.amount), "memo": el.memo,
                "flock_id": el.flock_id,
            })
        out.append({
            "id": cc.id, "charge_number": cc.charge_number,
            "credit_card_account_id": cc.credit_card_account_id,
            "vendor_name": cc.vendor_name, "vendor_id": cc.vendor_id,
            "charge_date": cc.charge_date, "amount": float(cc.amount),
            "memo": cc.memo, "flock_id": cc.flock_id,
            "status": cc.status.value if hasattr(cc.status, 'value') else cc.status,
            "expense_lines": expense_lines,
            "created_at": cc.created_at,
        })
    return out


async def void_cc_charge(db: AsyncSession, charge_id: str):
    cc = await db.get(CreditCardCharge, charge_id)
    if not cc:
        raise ValueError("Credit card charge not found")
    if cc.status == CreditCardChargeStatus.VOIDED:
        raise ValueError("Credit card charge is already voided")

    cc.status = CreditCardChargeStatus.VOIDED

    # Reversing JE: DR CC liability, CR expense accounts
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=cc.charge_date,
        description=f"VOID CC Charge {cc.charge_number}",
        reference=f"VOID-CC-{cc.charge_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # DR CC liability (reverse original credit)
    cc_account = await db.get(Account, cc.credit_card_account_id)
    if cc_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=cc_account.id,
            debit=cc.amount, credit=Decimal("0"),
            description=f"VOID CC Charge {cc.charge_number}",
        ))
        cc_account.balance -= cc.amount

    # CR expense accounts (reverse original debits)
    if cc.journal_entry_id:
        orig_lines_result = await db.execute(
            select(JournalLine).where(
                JournalLine.journal_entry_id == cc.journal_entry_id,
                JournalLine.debit > 0,
            )
        )
        for orig_line in orig_lines_result.scalars().all():
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=orig_line.account_id,
                debit=Decimal("0"), credit=orig_line.debit,
                description=f"VOID CC Charge {cc.charge_number}",
            ))
            acct = await db.get(Account, orig_line.account_id)
            if acct:
                if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                    acct.balance -= orig_line.debit
                else:
                    acct.balance += orig_line.debit

    await db.commit()
    return {
        "id": cc.id, "charge_number": cc.charge_number,
        "status": cc.status.value, "journal_entry_number": entry_number,
    }


# ── Tier 2: Credit Card Credits ──

async def create_cc_credit(db: AsyncSession, data: dict):
    """Create a credit card credit/return + JE (DR CC liability, CR expense/revenue)."""
    amount = Decimal(str(data["amount"]))
    credit_number = await _next_cc_credit_number(db)

    ccr = CreditCardCredit(
        credit_number=credit_number,
        credit_card_account_id=data["credit_card_account_id"],
        vendor_name=data["vendor_name"],
        charge_date=data["charge_date"],
        amount=amount,
        memo=data.get("memo"),
        status=CreditCardCreditStatus.PENDING,
    )
    db.add(ccr)
    await db.flush()

    # Create JE: DR CC liability (reduces what we owe), CR expense account
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["charge_date"],
        description=f"CC Credit {credit_number} - {data['vendor_name']}",
        reference=f"CCR-{credit_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()
    ccr.journal_entry_id = je.id

    # DR CC liability account (reduces liability)
    cc_account = await db.get(Account, data["credit_card_account_id"])
    if cc_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=cc_account.id,
            debit=amount, credit=Decimal("0"),
            description=f"CC Credit {credit_number} - {data['vendor_name']}",
        ))
        cc_account.balance -= amount  # Liability: DR decreases

    # CR expense account (if provided, else use a general expense)
    expense_account_id = data.get("expense_account_id")
    if expense_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=expense_account_id,
            debit=Decimal("0"), credit=amount,
            description=f"CC Credit {credit_number} - {data['vendor_name']}",
        ))
        acct = await db.get(Account, expense_account_id)
        if acct:
            if acct.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                acct.balance -= amount
            else:
                acct.balance += amount

    await db.commit()
    await db.refresh(ccr)
    return {
        "id": ccr.id, "credit_number": ccr.credit_number,
        "credit_card_account_id": ccr.credit_card_account_id,
        "vendor_name": ccr.vendor_name,
        "charge_date": ccr.charge_date, "amount": float(ccr.amount),
        "memo": ccr.memo,
        "status": ccr.status.value if hasattr(ccr.status, 'value') else ccr.status,
        "journal_entry_number": entry_number,
        "created_at": ccr.created_at,
    }


async def get_cc_credits(db: AsyncSession, status: str = None):
    query = select(CreditCardCredit).order_by(CreditCardCredit.charge_date.desc())
    if status:
        query = query.where(CreditCardCredit.status == status)
    result = await db.execute(query)
    return [{
        "id": ccr.id, "credit_number": ccr.credit_number,
        "credit_card_account_id": ccr.credit_card_account_id,
        "vendor_name": ccr.vendor_name,
        "charge_date": ccr.charge_date, "amount": float(ccr.amount),
        "memo": ccr.memo,
        "status": ccr.status.value if hasattr(ccr.status, 'value') else ccr.status,
        "created_at": ccr.created_at,
    } for ccr in result.scalars().all()]


# ── Tier 2: Customer Deposits ──

async def create_customer_deposit(db: AsyncSession, data: dict):
    """Create a customer deposit + JE (DR cash, CR customer deposits liability)."""
    amount = Decimal(str(data["amount"]))
    deposit_number = await _next_customer_deposit_number(db)

    dep = CustomerDepositModel(
        deposit_number=deposit_number,
        customer_name=data["customer_name"],
        customer_id=data.get("customer_id"),
        deposit_date=data["deposit_date"],
        amount=amount,
        deposit_to_account_id=data.get("deposit_to_account_id"),
        payment_method=PaymentMethod(data.get("payment_method", "check")),
        memo=data.get("memo"),
    )
    db.add(dep)
    await db.flush()

    # Create JE: DR cash/deposit account, CR customer deposits liability (2030)
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["deposit_date"],
        description=f"Customer Deposit {deposit_number} - {data['customer_name']}",
        reference=f"CDEP-{deposit_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()
    dep.journal_entry_id = je.id

    # DR cash/deposit account (default: Cash 1010)
    debit_account_id = data.get("deposit_to_account_id")
    if not debit_account_id:
        cash_result = await db.execute(select(Account).where(Account.account_number == "1010"))
        cash_acct = cash_result.scalar_one_or_none()
        if cash_acct:
            debit_account_id = cash_acct.id

    if debit_account_id:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=debit_account_id,
            debit=amount, credit=Decimal("0"),
            description=f"Customer Deposit {deposit_number} - {data['customer_name']}",
        ))
        acct = await db.get(Account, debit_account_id)
        if acct:
            acct.balance += amount

    # CR Customer Deposits liability (2030, fallback to 2010)
    dep_liab_result = await db.execute(select(Account).where(Account.account_number == "2030"))
    dep_liab = dep_liab_result.scalar_one_or_none()
    if not dep_liab:
        dep_liab_result = await db.execute(select(Account).where(Account.account_number == "2010"))
        dep_liab = dep_liab_result.scalar_one_or_none()

    if dep_liab:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=dep_liab.id,
            debit=Decimal("0"), credit=amount,
            description=f"Customer Deposit {deposit_number} - {data['customer_name']}",
        ))
        dep_liab.balance += amount  # Liability: CR increases

    await db.commit()
    await db.refresh(dep)
    return {
        "id": dep.id, "deposit_number": dep.deposit_number,
        "customer_name": dep.customer_name, "customer_id": dep.customer_id,
        "deposit_date": dep.deposit_date, "amount": float(dep.amount),
        "deposit_to_account_id": dep.deposit_to_account_id,
        "payment_method": dep.payment_method.value if hasattr(dep.payment_method, 'value') else dep.payment_method,
        "memo": dep.memo,
        "is_applied": dep.is_applied,
        "applied_to_invoice_id": dep.applied_to_invoice_id,
        "journal_entry_number": entry_number,
        "created_at": dep.created_at,
    }


async def get_customer_deposits(db: AsyncSession, status: str = None):
    query = select(CustomerDepositModel).order_by(CustomerDepositModel.deposit_date.desc())
    if status == "applied":
        query = query.where(CustomerDepositModel.is_applied == True)
    elif status == "unapplied":
        query = query.where(CustomerDepositModel.is_applied == False)
    result = await db.execute(query)
    return [{
        "id": dep.id, "deposit_number": dep.deposit_number,
        "customer_name": dep.customer_name, "customer_id": dep.customer_id,
        "deposit_date": dep.deposit_date, "amount": float(dep.amount),
        "deposit_to_account_id": dep.deposit_to_account_id,
        "payment_method": dep.payment_method.value if hasattr(dep.payment_method, 'value') else dep.payment_method,
        "memo": dep.memo,
        "is_applied": dep.is_applied,
        "applied_to_invoice_id": dep.applied_to_invoice_id,
        "created_at": dep.created_at,
    } for dep in result.scalars().all()]


async def apply_customer_deposit(db: AsyncSession, deposit_id: str, invoice_id: str):
    """Apply a customer deposit to an invoice."""
    dep = await db.get(CustomerDepositModel, deposit_id)
    if not dep:
        raise ValueError("Customer deposit not found")
    if dep.is_applied:
        raise ValueError("Deposit is already applied")

    invoice = await db.get(CustomerInvoice, invoice_id)
    if not invoice:
        raise ValueError("Invoice not found")

    # Apply deposit to invoice
    invoice.amount_paid = invoice.amount_paid + dep.amount
    if invoice.amount_paid >= invoice.amount:
        invoice.status = InvoiceStatus.PAID
    else:
        invoice.status = InvoiceStatus.PARTIAL

    dep.is_applied = True
    dep.applied_to_invoice_id = invoice_id

    # Create JE: DR customer deposits liability, CR accounts receivable
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=date.today().isoformat(),
        description=f"Apply Deposit {dep.deposit_number} to Invoice {invoice.invoice_number}",
        reference=f"CDEP-APPLY-{dep.deposit_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # DR Customer Deposits liability (2030)
    dep_liab_result = await db.execute(select(Account).where(Account.account_number == "2030"))
    dep_liab = dep_liab_result.scalar_one_or_none()
    if not dep_liab:
        dep_liab_result = await db.execute(select(Account).where(Account.account_number == "2010"))
        dep_liab = dep_liab_result.scalar_one_or_none()

    if dep_liab:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=dep_liab.id,
            debit=dep.amount, credit=Decimal("0"),
            description=f"Apply Deposit {dep.deposit_number} to Invoice {invoice.invoice_number}",
        ))
        dep_liab.balance -= dep.amount  # Liability: DR decreases

    # CR Accounts Receivable (1020)
    ar_result = await db.execute(select(Account).where(Account.account_number == "1020"))
    ar_account = ar_result.scalar_one_or_none()
    if ar_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=ar_account.id,
            debit=Decimal("0"), credit=dep.amount,
            description=f"Apply Deposit {dep.deposit_number} to Invoice {invoice.invoice_number}",
        ))
        ar_account.balance -= dep.amount  # Asset: CR decreases

    await db.commit()
    return {
        "deposit_id": dep.id, "deposit_number": dep.deposit_number,
        "invoice_id": invoice.id, "invoice_number": invoice.invoice_number,
        "amount_applied": float(dep.amount),
        "invoice_new_balance": float(invoice.amount - invoice.amount_paid),
        "invoice_status": invoice.status.value if hasattr(invoice.status, 'value') else invoice.status,
        "journal_entry_number": entry_number,
    }


# ── Tier 2: Finance Charges ──

async def assess_finance_charges(db: AsyncSession, annual_rate: float, grace_days: int):
    """Auto-assess finance charges on all overdue invoices past grace period."""
    today = date.today()
    rate = Decimal(str(annual_rate))
    daily_rate = rate / Decimal("365") / Decimal("100")

    result = await db.execute(
        select(CustomerInvoice).where(
            CustomerInvoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE])
        )
    )
    invoices = result.scalars().all()

    charges_created = []
    for inv in invoices:
        try:
            due = date.fromisoformat(inv.due_date)
        except ValueError:
            continue

        days_overdue = (today - due).days
        if days_overdue <= grace_days:
            continue

        balance = inv.amount - inv.amount_paid
        if balance <= 0:
            continue

        # Check if already charged for this invoice recently (within last 30 days)
        existing_result = await db.execute(
            select(func.count(FinanceCharge.id)).where(
                FinanceCharge.invoice_id == inv.id,
                FinanceCharge.status == FinanceChargeStatus.PENDING,
            )
        )
        if (existing_result.scalar() or 0) > 0:
            continue

        # Calculate charge: balance * daily_rate * days_overdue
        charge_amount = (balance * daily_rate * Decimal(str(days_overdue))).quantize(Decimal("0.01"))
        if charge_amount <= 0:
            continue

        charge_number = await _next_finance_charge_number(db)

        fc = FinanceCharge(
            charge_number=charge_number,
            customer_name=inv.buyer,
            invoice_id=inv.id,
            charge_date=today.isoformat(),
            amount=charge_amount,
            annual_rate=rate,
            grace_days=grace_days,
            status=FinanceChargeStatus.PENDING,
        )
        db.add(fc)
        await db.flush()

        # Create JE: DR Accounts Receivable, CR Finance Charge Revenue
        entry_number = await _next_je_number(db)
        je = JournalEntry(
            entry_number=entry_number,
            entry_date=today.isoformat(),
            description=f"Finance Charge {charge_number} on Invoice {inv.invoice_number}",
            reference=f"FC-{charge_number}",
            is_posted=True,
        )
        db.add(je)
        await db.flush()
        fc.journal_entry_id = je.id

        # DR Accounts Receivable (1020)
        ar_result = await db.execute(select(Account).where(Account.account_number == "1020"))
        ar_account = ar_result.scalar_one_or_none()
        if ar_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=ar_account.id,
                debit=charge_amount, credit=Decimal("0"),
                description=f"Finance Charge {charge_number}",
            ))
            ar_account.balance += charge_amount

        # CR Finance Charge Revenue (4030, fallback to 4010)
        fc_rev_result = await db.execute(select(Account).where(Account.account_number == "4030"))
        fc_rev = fc_rev_result.scalar_one_or_none()
        if not fc_rev:
            fc_rev_result = await db.execute(select(Account).where(Account.account_number == "4010"))
            fc_rev = fc_rev_result.scalar_one_or_none()
        if fc_rev:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=fc_rev.id,
                debit=Decimal("0"), credit=charge_amount,
                description=f"Finance Charge {charge_number}",
            ))
            fc_rev.balance += charge_amount  # Revenue: CR increases

        # Update invoice amount to include finance charge
        inv.amount = inv.amount + charge_amount

        charges_created.append({
            "id": fc.id, "charge_number": charge_number,
            "invoice_number": inv.invoice_number,
            "customer_name": inv.buyer,
            "amount": float(charge_amount),
            "days_overdue": days_overdue,
            "journal_entry_number": entry_number,
        })

    await db.commit()
    return {
        "charges_assessed": len(charges_created),
        "annual_rate": float(rate),
        "grace_days": grace_days,
        "charges": charges_created,
    }


async def get_finance_charges(db: AsyncSession, status: str = None):
    query = select(FinanceCharge).order_by(FinanceCharge.charge_date.desc())
    if status:
        query = query.where(FinanceCharge.status == status)
    result = await db.execute(query)
    return [{
        "id": fc.id, "charge_number": fc.charge_number,
        "customer_name": fc.customer_name, "invoice_id": fc.invoice_id,
        "charge_date": fc.charge_date, "amount": float(fc.amount),
        "annual_rate": float(fc.annual_rate), "grace_days": fc.grace_days,
        "status": fc.status.value if hasattr(fc.status, 'value') else fc.status,
        "created_at": fc.created_at,
    } for fc in result.scalars().all()]


async def waive_finance_charge(db: AsyncSession, charge_id: str):
    fc = await db.get(FinanceCharge, charge_id)
    if not fc:
        raise ValueError("Finance charge not found")
    if fc.status == FinanceChargeStatus.WAIVED:
        raise ValueError("Finance charge is already waived")

    fc.status = FinanceChargeStatus.WAIVED

    # Reversing JE: CR AR, DR finance charge revenue
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=date.today().isoformat(),
        description=f"Waive Finance Charge {fc.charge_number}",
        reference=f"FC-WAIVE-{fc.charge_number}",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    # CR AR (reverse the original debit)
    ar_result = await db.execute(select(Account).where(Account.account_number == "1020"))
    ar_account = ar_result.scalar_one_or_none()
    if ar_account:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=ar_account.id,
            debit=Decimal("0"), credit=fc.amount,
            description=f"Waive Finance Charge {fc.charge_number}",
        ))
        ar_account.balance -= fc.amount

    # DR Finance Charge Revenue (reverse the original credit)
    fc_rev_result = await db.execute(select(Account).where(Account.account_number == "4030"))
    fc_rev = fc_rev_result.scalar_one_or_none()
    if not fc_rev:
        fc_rev_result = await db.execute(select(Account).where(Account.account_number == "4010"))
        fc_rev = fc_rev_result.scalar_one_or_none()
    if fc_rev:
        db.add(JournalLine(
            journal_entry_id=je.id, account_id=fc_rev.id,
            debit=fc.amount, credit=Decimal("0"),
            description=f"Waive Finance Charge {fc.charge_number}",
        ))
        fc_rev.balance -= fc.amount

    # Reduce invoice amount
    invoice = await db.get(CustomerInvoice, fc.invoice_id)
    if invoice:
        invoice.amount = invoice.amount - fc.amount
        if invoice.amount_paid >= invoice.amount:
            invoice.status = InvoiceStatus.PAID

    await db.commit()
    return {
        "id": fc.id, "charge_number": fc.charge_number,
        "status": fc.status.value, "journal_entry_number": entry_number,
    }


# ── Tier 2: Inventory Adjustments ──

async def create_inventory_adjustment(db: AsyncSession, data: dict):
    """Create an inventory adjustment + JE (debit/credit inventory + adjustment account)."""
    quantity = Decimal(str(data["quantity"]))
    unit_value = Decimal(str(data["unit_value"]))
    total_value = (quantity * unit_value).quantize(Decimal("0.01"))
    adjustment_number = await _next_inventory_adjustment_number(db)
    adj_type = AdjustmentType(data["adjustment_type"])

    adj = InventoryAdjustment(
        adjustment_number=adjustment_number,
        adjustment_date=data["adjustment_date"],
        adjustment_type=adj_type,
        account_id=data["account_id"],
        quantity=quantity,
        unit_value=unit_value,
        total_value=total_value,
        reason=data.get("reason"),
        flock_id=data.get("flock_id"),
        status=InventoryAdjustmentStatus.COMPLETED,
    )
    db.add(adj)
    await db.flush()

    # Create JE
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=data["adjustment_date"],
        description=f"Inventory Adjustment {adjustment_number} ({adj_type.value})",
        reference=f"ADJ-{adjustment_number}",
        flock_id=data.get("flock_id"),
        is_posted=True,
    )
    db.add(je)
    await db.flush()
    adj.journal_entry_id = je.id

    # Find inventory account (1030 for egg inventory, fallback to provided account)
    inv_result = await db.execute(select(Account).where(Account.account_number == "1030"))
    inv_account = inv_result.scalar_one_or_none()

    # Adjustment account (the one provided — for inventory shrinkage or overage)
    adj_account = await db.get(Account, data["account_id"])

    if adj_type == AdjustmentType.INCREASE:
        # DR Inventory, CR Adjustment account
        if inv_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=inv_account.id,
                debit=total_value, credit=Decimal("0"),
                description=f"Inventory Adjustment {adjustment_number} (increase)",
            ))
            inv_account.balance += total_value

        if adj_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=adj_account.id,
                debit=Decimal("0"), credit=total_value,
                description=f"Inventory Adjustment {adjustment_number} (increase)",
            ))
            if adj_account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                adj_account.balance -= total_value
            else:
                adj_account.balance += total_value
    else:
        # DR Adjustment account, CR Inventory
        if adj_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=adj_account.id,
                debit=total_value, credit=Decimal("0"),
                description=f"Inventory Adjustment {adjustment_number} (decrease)",
            ))
            if adj_account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                adj_account.balance += total_value
            else:
                adj_account.balance -= total_value

        if inv_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=inv_account.id,
                debit=Decimal("0"), credit=total_value,
                description=f"Inventory Adjustment {adjustment_number} (decrease)",
            ))
            inv_account.balance -= total_value

    await db.commit()
    await db.refresh(adj)
    return {
        "id": adj.id, "adjustment_number": adj.adjustment_number,
        "adjustment_date": adj.adjustment_date,
        "adjustment_type": adj.adjustment_type.value if hasattr(adj.adjustment_type, 'value') else adj.adjustment_type,
        "account_id": adj.account_id,
        "quantity": float(adj.quantity), "unit_value": float(adj.unit_value),
        "total_value": float(adj.total_value),
        "reason": adj.reason, "flock_id": adj.flock_id,
        "status": adj.status.value if hasattr(adj.status, 'value') else adj.status,
        "journal_entry_number": entry_number,
        "created_at": adj.created_at,
    }


async def get_inventory_adjustments(db: AsyncSession, status: str = None):
    query = select(InventoryAdjustment).order_by(InventoryAdjustment.adjustment_date.desc())
    if status:
        query = query.where(InventoryAdjustment.status == status)
    result = await db.execute(query)
    return [{
        "id": adj.id, "adjustment_number": adj.adjustment_number,
        "adjustment_date": adj.adjustment_date,
        "adjustment_type": adj.adjustment_type.value if hasattr(adj.adjustment_type, 'value') else adj.adjustment_type,
        "account_id": adj.account_id,
        "quantity": float(adj.quantity), "unit_value": float(adj.unit_value),
        "total_value": float(adj.total_value),
        "reason": adj.reason, "flock_id": adj.flock_id,
        "status": adj.status.value if hasattr(adj.status, 'value') else adj.status,
        "created_at": adj.created_at,
    } for adj in result.scalars().all()]


async def void_inventory_adjustment(db: AsyncSession, adjustment_id: str):
    adj = await db.get(InventoryAdjustment, adjustment_id)
    if not adj:
        raise ValueError("Inventory adjustment not found")
    if adj.status == InventoryAdjustmentStatus.VOIDED:
        raise ValueError("Inventory adjustment is already voided")

    adj.status = InventoryAdjustmentStatus.VOIDED

    # Reversing JE: swap debits/credits from original
    entry_number = await _next_je_number(db)
    je = JournalEntry(
        entry_number=entry_number,
        entry_date=adj.adjustment_date,
        description=f"VOID Inventory Adjustment {adj.adjustment_number}",
        reference=f"VOID-ADJ-{adj.adjustment_number}",
        flock_id=adj.flock_id,
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    inv_result = await db.execute(select(Account).where(Account.account_number == "1030"))
    inv_account = inv_result.scalar_one_or_none()
    adj_account = await db.get(Account, adj.account_id)

    if adj.adjustment_type == AdjustmentType.INCREASE:
        # Reverse: CR Inventory, DR Adjustment account
        if inv_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=inv_account.id,
                debit=Decimal("0"), credit=adj.total_value,
                description=f"VOID Inventory Adjustment {adj.adjustment_number}",
            ))
            inv_account.balance -= adj.total_value

        if adj_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=adj_account.id,
                debit=adj.total_value, credit=Decimal("0"),
                description=f"VOID Inventory Adjustment {adj.adjustment_number}",
            ))
            if adj_account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                adj_account.balance += adj.total_value
            else:
                adj_account.balance -= adj.total_value
    else:
        # Reverse: DR Inventory, CR Adjustment account
        if inv_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=inv_account.id,
                debit=adj.total_value, credit=Decimal("0"),
                description=f"VOID Inventory Adjustment {adj.adjustment_number}",
            ))
            inv_account.balance += adj.total_value

        if adj_account:
            db.add(JournalLine(
                journal_entry_id=je.id, account_id=adj_account.id,
                debit=Decimal("0"), credit=adj.total_value,
                description=f"VOID Inventory Adjustment {adj.adjustment_number}",
            ))
            if adj_account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                adj_account.balance -= adj.total_value
            else:
                adj_account.balance += adj.total_value

    await db.commit()
    return {
        "id": adj.id, "adjustment_number": adj.adjustment_number,
        "status": adj.status.value, "journal_entry_number": entry_number,
    }
