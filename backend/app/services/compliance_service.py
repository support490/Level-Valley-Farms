from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from datetime import date
from typing import Optional
import calendar
import csv
from io import StringIO

from app.models.accounting import (
    Account, AccountType, JournalEntry, JournalLine, ExpenseCategory,
    FiscalPeriod, Bill, BillPayment, CustomerInvoice,
)
from app.models.flock import Flock, ProductionRecord
from app.models.inventory import EggSale
from app.models.farm import Grower


# ── Year-End Closing ──

async def perform_year_end_close(db: AsyncSession, year: int):
    """Create year-end closing entries: zero out revenue/expense to retained earnings."""
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    # Get revenue totals
    rev_accounts = await db.execute(
        select(Account).where(Account.account_type == AccountType.REVENUE, Account.is_active == True)
    )
    expense_accounts = await db.execute(
        select(Account).where(Account.account_type == AccountType.EXPENSE, Account.is_active == True)
    )

    total_revenue = Decimal("0")
    total_expenses = Decimal("0")
    close_lines = []

    for acct in rev_accounts.scalars().all():
        result = await db.execute(
            select(
                func.coalesce(func.sum(JournalLine.credit), 0),
                func.coalesce(func.sum(JournalLine.debit), 0),
            )
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(JournalLine.account_id == acct.id, JournalEntry.is_posted == True,
                   JournalEntry.entry_date >= start, JournalEntry.entry_date <= end)
        )
        row = result.one()
        bal = Decimal(str(row[0])) - Decimal(str(row[1]))
        if abs(bal) > Decimal("0.01"):
            total_revenue += bal
            close_lines.append({"account_id": acct.id, "debit": bal, "credit": Decimal("0"), "desc": f"Close {acct.name}"})

    for acct in expense_accounts.scalars().all():
        result = await db.execute(
            select(
                func.coalesce(func.sum(JournalLine.debit), 0),
                func.coalesce(func.sum(JournalLine.credit), 0),
            )
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(JournalLine.account_id == acct.id, JournalEntry.is_posted == True,
                   JournalEntry.entry_date >= start, JournalEntry.entry_date <= end)
        )
        row = result.one()
        bal = Decimal(str(row[0])) - Decimal(str(row[1]))
        if abs(bal) > Decimal("0.01"):
            total_expenses += bal
            close_lines.append({"account_id": acct.id, "debit": Decimal("0"), "credit": bal, "desc": f"Close {acct.name}"})

    net_income = total_revenue - total_expenses

    return {
        "year": year,
        "total_revenue": round(float(total_revenue), 2),
        "total_expenses": round(float(total_expenses), 2),
        "net_income": round(float(net_income), 2),
        "closing_entries": len(close_lines),
        "message": f"Year {year}: Net income ${float(net_income):,.2f} to be transferred to retained earnings",
    }


# ── Retained Earnings ──

async def get_retained_earnings(db: AsyncSession):
    """Calculate retained earnings: sum of all prior-year net incomes."""
    current_year = date.today().year
    retained = Decimal("0")

    for year in range(2020, current_year):
        start = f"{year}-01-01"
        end = f"{year}-12-31"

        rev_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.credit - JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(JournalEntry.is_posted == True, JournalEntry.entry_date >= start,
                   JournalEntry.entry_date <= end, Account.account_type == AccountType.REVENUE)
        )
        revenue = Decimal(str(rev_result.scalar() or 0))

        exp_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(JournalEntry.is_posted == True, JournalEntry.entry_date >= start,
                   JournalEntry.entry_date <= end, Account.account_type == AccountType.EXPENSE)
        )
        expenses = Decimal(str(exp_result.scalar() or 0))
        retained += revenue - expenses

    return {"retained_earnings": round(float(retained), 2), "through_year": current_year - 1}


# ── Schedule F (Farm Income Tax) ──

async def get_schedule_f(db: AsyncSession, year: int):
    """Generate Schedule F data for farm income tax."""
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    # Income
    sales_result = await db.execute(
        select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
            EggSale.sale_date >= start, EggSale.sale_date <= end
        )
    )
    egg_sales = float(sales_result.scalar() or 0)

    # Expenses by category
    categories = {}
    for cat in ExpenseCategory:
        result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(JournalEntry.is_posted == True, JournalEntry.expense_category == cat,
                   JournalEntry.entry_date >= start, JournalEntry.entry_date <= end,
                   Account.account_type == AccountType.EXPENSE)
        )
        amount = float(result.scalar() or 0)
        if amount > 0:
            categories[cat.value] = round(amount, 2)

    total_expenses = sum(categories.values())
    net_farm_profit = egg_sales - total_expenses

    return {
        "year": year,
        "gross_income": {"egg_sales": round(egg_sales, 2), "total": round(egg_sales, 2)},
        "expenses": categories,
        "total_expenses": round(total_expenses, 2),
        "net_farm_profit": round(net_farm_profit, 2),
    }


# ── 1099 Tracking ──

async def get_1099_report(db: AsyncSession, year: int):
    """Track payments to growers/vendors that may require 1099 reporting."""
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    # Payments from bills
    result = await db.execute(
        select(
            Bill.vendor_name,
            func.sum(BillPayment.amount).label("total_paid"),
            func.count(BillPayment.id).label("num_payments"),
        )
        .join(BillPayment, BillPayment.bill_id == Bill.id)
        .where(BillPayment.payment_date >= start, BillPayment.payment_date <= end)
        .group_by(Bill.vendor_name)
    )
    vendors = []
    for row in result.all():
        total = float(row[1] or 0)
        vendors.append({
            "vendor_name": row[0],
            "total_paid": round(total, 2),
            "num_payments": row[2],
            "requires_1099": total >= 600,
        })

    # Also check grower payments from journal entries
    grower_result = await db.execute(
        select(func.coalesce(func.sum(JournalLine.debit), 0))
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(JournalEntry.is_posted == True, JournalEntry.expense_category == ExpenseCategory.GROWER_PAYMENT,
               JournalEntry.entry_date >= start, JournalEntry.entry_date <= end,
               Account.account_type == AccountType.EXPENSE)
    )
    grower_total = float(grower_result.scalar() or 0)

    vendors.sort(key=lambda x: x["total_paid"], reverse=True)
    return {
        "year": year, "threshold": 600,
        "vendors": vendors,
        "total_grower_payments": round(grower_total, 2),
        "vendors_requiring_1099": sum(1 for v in vendors if v["requires_1099"]),
    }


# ── Financial Statement Comparison ──

async def get_period_comparison(db: AsyncSession, period1_start: str, period1_end: str,
                                 period2_start: str, period2_end: str):
    """Compare two periods side-by-side."""
    async def get_period_totals(start, end):
        # Revenue
        rev_result = await db.execute(
            select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
                EggSale.sale_date >= start, EggSale.sale_date <= end
            )
        )
        revenue = float(rev_result.scalar() or 0)

        # Expenses
        exp_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(JournalEntry.is_posted == True, JournalEntry.entry_date >= start,
                   JournalEntry.entry_date <= end, Account.account_type == AccountType.EXPENSE)
        )
        expenses = float(exp_result.scalar() or 0)

        # Production
        prod_result = await db.execute(
            select(func.coalesce(func.sum(ProductionRecord.egg_count), 0)).where(
                ProductionRecord.record_date >= start, ProductionRecord.record_date <= end
            )
        )
        eggs = int(prod_result.scalar() or 0)

        return {"revenue": round(revenue, 2), "expenses": round(expenses, 2),
                "net_income": round(revenue - expenses, 2), "total_eggs": eggs,
                "total_dozens": round(eggs / 12, 1) if eggs > 0 else 0}

    p1 = await get_period_totals(period1_start, period1_end)
    p2 = await get_period_totals(period2_start, period2_end)

    def change(a, b):
        if b == 0:
            return 0
        return round(((a - b) / abs(b)) * 100, 1)

    return {
        "period1": {"start": period1_start, "end": period1_end, **p1},
        "period2": {"start": period2_start, "end": period2_end, **p2},
        "changes": {
            "revenue_pct": change(p1["revenue"], p2["revenue"]),
            "expenses_pct": change(p1["expenses"], p2["expenses"]),
            "net_income_pct": change(p1["net_income"], p2["net_income"]) if p2["net_income"] != 0 else 0,
            "production_pct": change(p1["total_eggs"], p2["total_eggs"]),
        }
    }


# ── Ratio Analysis ──

async def get_ratio_analysis(db: AsyncSession):
    """Financial ratios for the current year."""
    today = date.today()
    start = f"{today.year}-01-01"
    end = today.isoformat()

    # Revenue
    rev_result = await db.execute(
        select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
            EggSale.sale_date >= start, EggSale.sale_date <= end)
    )
    revenue = float(rev_result.scalar() or 0)

    # Expenses
    exp_result = await db.execute(
        select(func.coalesce(func.sum(JournalLine.debit), 0))
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(JournalEntry.is_posted == True, JournalEntry.entry_date >= start,
               JournalEntry.entry_date <= end, Account.account_type == AccountType.EXPENSE)
    )
    expenses = float(exp_result.scalar() or 0)

    # Assets & Liabilities
    asset_result = await db.execute(
        select(func.coalesce(func.sum(Account.balance), 0)).where(Account.account_type == AccountType.ASSET)
    )
    total_assets = float(asset_result.scalar() or 0)

    liab_result = await db.execute(
        select(func.coalesce(func.sum(Account.balance), 0)).where(Account.account_type == AccountType.LIABILITY)
    )
    total_liabilities = float(liab_result.scalar() or 0)

    net_income = revenue - expenses
    equity = total_assets - total_liabilities

    return {
        "period": f"{start} to {end}",
        "profit_margin": round((net_income / revenue * 100), 2) if revenue > 0 else 0,
        "expense_ratio": round((expenses / revenue * 100), 2) if revenue > 0 else 0,
        "current_ratio": round(total_assets / total_liabilities, 2) if total_liabilities > 0 else 0,
        "debt_to_equity": round(total_liabilities / equity, 2) if equity > 0 else 0,
        "return_on_assets": round((net_income / total_assets * 100), 2) if total_assets > 0 else 0,
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "equity": round(equity, 2),
        "revenue": round(revenue, 2),
        "expenses": round(expenses, 2),
        "net_income": round(net_income, 2),
    }


# ── Audit Preparation Export ──

async def get_audit_export(db: AsyncSession, year: int):
    """Generate audit-ready data package."""
    sched_f = await get_schedule_f(db, year)
    retained = await get_retained_earnings(db)
    ratios = await get_ratio_analysis(db)
    report_1099 = await get_1099_report(db, year)

    return {
        "year": year,
        "schedule_f": sched_f,
        "retained_earnings": retained,
        "financial_ratios": ratios,
        "report_1099": report_1099,
    }


# ── QuickBooks/Xero Export ──

async def export_qb_csv(db: AsyncSession, year: int):
    """Export journal entries in QuickBooks-compatible CSV format."""
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.is_posted == True,
            JournalEntry.entry_date >= start,
            JournalEntry.entry_date <= end,
        ).order_by(JournalEntry.entry_date)
    )
    entries = result.scalars().all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Transaction Type", "Num", "Name", "Memo", "Account", "Debit", "Credit"])

    for je in entries:
        lines_result = await db.execute(
            select(JournalLine).where(JournalLine.journal_entry_id == je.id)
        )
        for line in lines_result.scalars().all():
            acct = await db.get(Account, line.account_id)
            writer.writerow([
                je.entry_date, "Journal Entry", je.entry_number, "",
                je.description, acct.name if acct else "",
                float(line.debit) if line.debit > 0 else "",
                float(line.credit) if line.credit > 0 else "",
            ])

    return output.getvalue()
