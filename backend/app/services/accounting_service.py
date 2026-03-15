from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from decimal import Decimal
from typing import Optional, List

from app.models.accounting import Account, AccountType, JournalEntry, JournalLine, ExpenseCategory
from app.models.flock import Flock
from app.schemas.accounting import (
    AccountCreate, AccountUpdate, JournalEntryCreate, QuickExpenseCreate,
)

# ── Counter for journal entry numbers ──

async def _next_entry_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(JournalEntry.id)))
    count = result.scalar() or 0
    return f"JE-{count + 1:06d}"


# ── Accounts ──

async def get_all_accounts(db: AsyncSession, include_inactive: bool = False):
    query = select(Account).order_by(Account.account_number)
    if not include_inactive:
        query = query.where(Account.is_active == True)
    result = await db.execute(query)
    accounts = result.scalars().all()
    return [_account_to_dict(a) for a in accounts]


async def get_account(db: AsyncSession, account_id: str):
    return await db.get(Account, account_id)


async def create_account(db: AsyncSession, data: AccountCreate):
    existing = await db.execute(
        select(Account).where(Account.account_number == data.account_number)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Account number {data.account_number} already exists")

    account = Account(
        account_number=data.account_number,
        name=data.name,
        account_type=AccountType(data.account_type),
        parent_id=data.parent_id,
        description=data.description,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


async def update_account(db: AsyncSession, account_id: str, data: AccountUpdate):
    account = await get_account(db, account_id)
    if not account:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(account, key, val)
    await db.commit()
    await db.refresh(account)
    return account


# ── Seed Default Chart of Accounts ──

DEFAULT_ACCOUNTS = [
    # Assets (1000s)
    ("1000", "Assets", "asset", None),
    ("1010", "Cash", "asset", "1000"),
    ("1020", "Accounts Receivable", "asset", "1000"),
    ("1030", "Egg Inventory", "asset", "1000"),
    ("1040", "Bird Inventory", "asset", "1000"),
    ("1050", "Prepaid Expenses", "asset", "1000"),
    # Liabilities (2000s)
    ("2000", "Liabilities", "liability", None),
    ("2010", "Accounts Payable", "liability", "2000"),
    ("2020", "Grower Payables", "liability", "2000"),
    ("2030", "Accrued Expenses", "liability", "2000"),
    # Equity (3000s)
    ("3000", "Equity", "equity", None),
    ("3010", "Owner's Equity", "equity", "3000"),
    ("3020", "Retained Earnings", "equity", "3000"),
    # Revenue (4000s)
    ("4000", "Revenue", "revenue", None),
    ("4010", "Egg Sales", "revenue", "4000"),
    ("4020", "Bird Sales", "revenue", "4000"),
    ("4030", "Other Revenue", "revenue", "4000"),
    # Expenses (5000s)
    ("5000", "Expenses", "expense", None),
    ("5010", "Feed Costs", "expense", "5000"),
    ("5020", "Grower Payments", "expense", "5000"),
    ("5030", "Chick Purchases", "expense", "5000"),
    ("5040", "Veterinary & Service", "expense", "5000"),
    ("5050", "Transport Costs", "expense", "5000"),
    ("5060", "Utilities", "expense", "5000"),
    ("5070", "Flock Costs - Other", "expense", "5000"),
    ("5080", "Insurance", "expense", "5000"),
    ("5090", "Maintenance & Repairs", "expense", "5000"),
    ("5100", "General & Administrative", "expense", "5000"),
]


async def seed_accounts(db: AsyncSession):
    result = await db.execute(select(func.count(Account.id)))
    if result.scalar() > 0:
        return False

    # First pass: create accounts without parent links
    account_map = {}
    for acct_num, name, acct_type, _ in DEFAULT_ACCOUNTS:
        account = Account(
            account_number=acct_num,
            name=name,
            account_type=AccountType(acct_type),
        )
        db.add(account)
        await db.flush()
        account_map[acct_num] = account.id

    # Second pass: set parent links
    for acct_num, _, _, parent_num in DEFAULT_ACCOUNTS:
        if parent_num and parent_num in account_map:
            account = await db.execute(
                select(Account).where(Account.account_number == acct_num)
            )
            acct = account.scalar_one()
            acct.parent_id = account_map[parent_num]

    await db.commit()
    return True


# ── Journal Entries ──

async def get_all_journal_entries(
    db: AsyncSession,
    flock_id: str = None,
    category: str = None,
    posted_only: bool = False,
    date_from: str = None,
    date_to: str = None,
):
    query = select(JournalEntry).order_by(JournalEntry.entry_date.desc(), JournalEntry.entry_number.desc())

    if flock_id:
        query = query.where(JournalEntry.flock_id == flock_id)
    if category:
        query = query.where(JournalEntry.expense_category == category)
    if posted_only:
        query = query.where(JournalEntry.is_posted == True)
    if date_from:
        query = query.where(JournalEntry.entry_date >= date_from)
    if date_to:
        query = query.where(JournalEntry.entry_date <= date_to)

    result = await db.execute(query)
    entries = result.scalars().all()

    response = []
    for entry in entries:
        response.append(await _entry_to_dict(db, entry))
    return response


async def get_journal_entry(db: AsyncSession, entry_id: str):
    entry = await db.get(JournalEntry, entry_id)
    if not entry:
        return None
    return await _entry_to_dict(db, entry)


async def create_journal_entry(db: AsyncSession, data: JournalEntryCreate):
    # Validate debits = credits using Decimal for precision
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    for line in data.lines:
        total_debit += Decimal(str(line.debit))
        total_credit += Decimal(str(line.credit))

    if total_debit != total_credit:
        raise ValueError(
            f"Entry is not balanced: debits ({total_debit}) != credits ({total_credit})"
        )

    if not data.lines:
        raise ValueError("Journal entry must have at least two lines")

    entry_number = await _next_entry_number(db)

    try:
        entry = JournalEntry(
            entry_number=entry_number,
            entry_date=data.entry_date,
            description=data.description,
            flock_id=data.flock_id,
            expense_category=ExpenseCategory(data.expense_category) if data.expense_category else None,
            reference=data.reference,
            notes=data.notes,
        )
        db.add(entry)
        await db.flush()

        for line_data in data.lines:
            account = await get_account(db, line_data.account_id)
            if not account:
                raise ValueError(f"Account {line_data.account_id} not found")
            if not account.is_active:
                raise ValueError(f"Account '{account.name}' is inactive and cannot be used")

            line = JournalLine(
                journal_entry_id=entry.id,
                account_id=line_data.account_id,
                debit=Decimal(str(line_data.debit)),
                credit=Decimal(str(line_data.credit)),
                description=line_data.description,
            )
            db.add(line)

        await db.commit()
        await db.refresh(entry)
        return await _entry_to_dict(db, entry)
    except Exception:
        await db.rollback()
        raise


async def post_journal_entry(db: AsyncSession, entry_id: str):
    entry = await db.get(JournalEntry, entry_id)
    if not entry:
        raise ValueError("Journal entry not found")
    if entry.is_posted:
        raise ValueError("Entry is already posted")

    try:
        # Load lines and update account balances
        lines_result = await db.execute(
            select(JournalLine).where(JournalLine.journal_entry_id == entry_id)
        )
        lines = lines_result.scalars().all()

        for line in lines:
            account = await db.get(Account, line.account_id)
            if not account:
                raise ValueError(f"Account not found for line {line.id}")

            # For asset/expense accounts: debit increases, credit decreases
            # For liability/equity/revenue: credit increases, debit decreases
            if account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                account.balance += line.debit - line.credit
            else:
                account.balance += line.credit - line.debit

        entry.is_posted = True
        await db.commit()
        return await _entry_to_dict(db, entry)
    except Exception:
        await db.rollback()
        raise


async def unpost_journal_entry(db: AsyncSession, entry_id: str):
    entry = await db.get(JournalEntry, entry_id)
    if not entry:
        raise ValueError("Journal entry not found")
    if not entry.is_posted:
        raise ValueError("Entry is not posted")

    try:
        lines_result = await db.execute(
            select(JournalLine).where(JournalLine.journal_entry_id == entry_id)
        )
        lines = lines_result.scalars().all()

        for line in lines:
            account = await db.get(Account, line.account_id)
            if not account:
                continue
            # Reverse the posting
            if account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
                account.balance -= line.debit - line.credit
            else:
                account.balance -= line.credit - line.debit

        entry.is_posted = False
        await db.commit()
        return await _entry_to_dict(db, entry)
    except Exception:
        await db.rollback()
        raise


async def delete_journal_entry(db: AsyncSession, entry_id: str):
    entry = await db.get(JournalEntry, entry_id)
    if not entry:
        return False
    if entry.is_posted:
        raise ValueError("Cannot delete a posted entry. Unpost it first.")

    lines_result = await db.execute(
        select(JournalLine).where(JournalLine.journal_entry_id == entry_id)
    )
    for line in lines_result.scalars().all():
        await db.delete(line)
    await db.delete(entry)
    await db.commit()
    return True


# ── Quick Expense Entry ──

async def create_quick_expense(db: AsyncSession, data: QuickExpenseCreate):
    entry_data = JournalEntryCreate(
        entry_date=data.entry_date,
        description=data.description,
        flock_id=data.flock_id,
        expense_category=data.expense_category,
        reference=data.reference,
        notes=data.notes,
        lines=[
            {"account_id": data.expense_account_id, "debit": data.amount, "credit": 0.0},
            {"account_id": data.payment_account_id, "debit": 0.0, "credit": data.amount},
        ],
    )
    return await create_journal_entry(db, entry_data)


# ── Trial Balance ──

async def get_trial_balance(db: AsyncSession, as_of_date: str = None):
    query = select(Account).where(Account.is_active == True).order_by(Account.account_number)
    result = await db.execute(query)
    accounts = result.scalars().all()

    rows = []
    total_debits = Decimal("0")
    total_credits = Decimal("0")

    for account in accounts:
        # Calculate balance from posted journal lines up to date
        lines_query = (
            select(
                func.coalesce(func.sum(JournalLine.debit), 0).label("total_debit"),
                func.coalesce(func.sum(JournalLine.credit), 0).label("total_credit"),
            )
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalLine.account_id == account.id,
                JournalEntry.is_posted == True,
            )
        )
        if as_of_date:
            lines_query = lines_query.where(JournalEntry.entry_date <= as_of_date)

        lines_result = await db.execute(lines_query)
        row = lines_result.one()
        td = Decimal(str(row.total_debit))
        tc = Decimal(str(row.total_credit))

        if td == 0 and tc == 0:
            continue

        # For asset/expense: normal balance is debit
        # For liability/equity/revenue: normal balance is credit
        if account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
            net = td - tc
            debit_bal = max(net, Decimal("0"))
            credit_bal = max(-net, Decimal("0"))
        else:
            net = tc - td
            debit_bal = max(-net, Decimal("0"))
            credit_bal = max(net, Decimal("0"))

        total_debits += debit_bal
        total_credits += credit_bal

        rows.append({
            "account_id": account.id,
            "account_number": account.account_number,
            "account_name": account.name,
            "account_type": account.account_type.value,
            "debit_balance": float(round(debit_bal, 2)),
            "credit_balance": float(round(credit_bal, 2)),
        })

    return {
        "as_of_date": as_of_date or "current",
        "rows": rows,
        "total_debits": float(round(total_debits, 2)),
        "total_credits": float(round(total_credits, 2)),
        "is_balanced": abs(total_debits - total_credits) < Decimal("0.01"),
    }


# ── Account Ledger ──

async def get_account_ledger(db: AsyncSession, account_id: str, date_from: str = None, date_to: str = None):
    account = await get_account(db, account_id)
    if not account:
        raise ValueError("Account not found")

    query = (
        select(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalLine.account_id == account_id,
            JournalEntry.is_posted == True,
        )
        .order_by(JournalEntry.entry_date, JournalEntry.entry_number)
    )
    if date_from:
        query = query.where(JournalEntry.entry_date >= date_from)
    if date_to:
        query = query.where(JournalEntry.entry_date <= date_to)

    result = await db.execute(query)
    rows = result.all()

    running_balance = Decimal("0")
    ledger = []

    for line, entry in rows:
        debit = Decimal(str(line.debit))
        credit = Decimal(str(line.credit))

        if account.account_type in (AccountType.ASSET, AccountType.EXPENSE):
            running_balance += debit - credit
        else:
            running_balance += credit - debit

        flock_number = None
        if entry.flock_id:
            flock = await db.get(Flock, entry.flock_id)
            flock_number = flock.flock_number if flock else None

        ledger.append({
            "entry_date": entry.entry_date,
            "entry_number": entry.entry_number,
            "description": line.description or entry.description,
            "debit": float(debit),
            "credit": float(credit),
            "running_balance": float(round(running_balance, 2)),
            "journal_entry_id": entry.id,
            "flock_number": flock_number,
        })

    return ledger


# ── Helpers ──

def _account_to_dict(account: Account) -> dict:
    return {
        "id": account.id,
        "account_number": account.account_number,
        "name": account.name,
        "account_type": account.account_type.value if hasattr(account.account_type, 'value') else account.account_type,
        "parent_id": account.parent_id,
        "description": account.description,
        "is_active": account.is_active,
        "balance": float(account.balance),
        "created_at": account.created_at,
        "updated_at": account.updated_at,
    }


async def _entry_to_dict(db: AsyncSession, entry: JournalEntry) -> dict:
    lines_result = await db.execute(
        select(JournalLine).where(JournalLine.journal_entry_id == entry.id)
    )
    lines = lines_result.scalars().all()

    line_dicts = []
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    for line in lines:
        account = await db.get(Account, line.account_id)
        debit = Decimal(str(line.debit))
        credit = Decimal(str(line.credit))
        total_debit += debit
        total_credit += credit
        line_dicts.append({
            "id": line.id,
            "journal_entry_id": line.journal_entry_id,
            "account_id": line.account_id,
            "account_name": account.name if account else "",
            "account_number": account.account_number if account else "",
            "debit": float(debit),
            "credit": float(credit),
            "description": line.description,
        })

    flock_number = None
    if entry.flock_id:
        flock = await db.get(Flock, entry.flock_id)
        flock_number = flock.flock_number if flock else None

    return {
        "id": entry.id,
        "entry_number": entry.entry_number,
        "entry_date": entry.entry_date,
        "description": entry.description,
        "flock_id": entry.flock_id,
        "flock_number": flock_number,
        "expense_category": entry.expense_category.value if entry.expense_category else None,
        "reference": entry.reference,
        "is_posted": entry.is_posted,
        "notes": entry.notes,
        "lines": line_dicts,
        "total_debit": float(round(total_debit, 2)),
        "total_credit": float(round(total_credit, 2)),
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
    }
