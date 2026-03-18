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
)
from app.models.base import generate_uuid
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
