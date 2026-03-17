from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from datetime import date
from typing import Optional
import calendar

from app.models.budget import Budget, BudgetLine, DepreciationSchedule, DepreciationMethod
from app.models.accounting import Account, AccountType, JournalEntry, JournalLine, ExpenseCategory
from app.models.flock import Flock, FlockType, ProductionRecord
from app.models.farm import Barn, Grower, FlockPlacement
from app.models.inventory import EggSale
from app.models.logistics import Shipment, ShipmentLine, ShipmentStatus
from app.models.contracts import EggContract

MONTH_FIELDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


# ── Budgets ──

async def create_budget(db: AsyncSession, data: dict):
    lines_data = data.pop("lines", [])
    budget = Budget(
        name=data["name"], year=data["year"],
        notes=data.get("notes"),
    )
    db.add(budget)
    await db.flush()

    total = Decimal("0")
    for ld in lines_data:
        annual = Decimal(str(ld.get("annual_amount", 0)))
        total += annual
        line = BudgetLine(
            budget_id=budget.id, category=ld["category"],
            account_id=ld.get("account_id"),
            annual_amount=annual,
            **{m: Decimal(str(ld.get(m, 0))) for m in MONTH_FIELDS},
            notes=ld.get("notes"),
        )
        db.add(line)

    budget.total_amount = total
    await db.commit()
    await db.refresh(budget)
    return await _budget_to_dict(db, budget)


async def get_budgets(db: AsyncSession, year: int = None):
    query = select(Budget).order_by(Budget.year.desc())
    if year:
        query = query.where(Budget.year == year)
    result = await db.execute(query)
    return [await _budget_to_dict(db, b) for b in result.scalars().all()]


async def _budget_to_dict(db: AsyncSession, budget: Budget) -> dict:
    lines_result = await db.execute(
        select(BudgetLine).where(BudgetLine.budget_id == budget.id)
    )
    lines = [{
        "id": l.id, "category": l.category, "account_id": l.account_id,
        "annual_amount": float(l.annual_amount),
        **{m: float(getattr(l, m)) for m in MONTH_FIELDS},
        "notes": l.notes,
    } for l in lines_result.scalars().all()]

    return {
        "id": budget.id, "name": budget.name, "year": budget.year,
        "total_amount": float(budget.total_amount),
        "notes": budget.notes, "is_active": budget.is_active,
        "lines": lines, "created_at": budget.created_at,
    }


# ── Budget vs Actual Variance ──

async def get_budget_variance(db: AsyncSession, year: int):
    """Compare budget to actual expenses by category and month."""
    # Get budget for year
    budget_result = await db.execute(
        select(Budget).where(Budget.year == year, Budget.is_active == True).limit(1)
    )
    budget = budget_result.scalar_one_or_none()

    budget_lines = []
    if budget:
        lines_result = await db.execute(
            select(BudgetLine).where(BudgetLine.budget_id == budget.id)
        )
        budget_lines = lines_result.scalars().all()

    # Get actual expenses by category by month
    categories = [e.value for e in ExpenseCategory]
    variance = []

    for cat in categories:
        bl = next((l for l in budget_lines if l.category == cat), None)
        monthly = {}

        for month_idx in range(1, 13):
            month_name = MONTH_FIELDS[month_idx - 1]
            start = f"{year}-{month_idx:02d}-01"
            last_day = calendar.monthrange(year, month_idx)[1]
            end = f"{year}-{month_idx:02d}-{last_day:02d}"

            # Actual expense for this category+month
            actual_result = await db.execute(
                select(func.coalesce(func.sum(JournalLine.debit), 0))
                .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
                .join(Account, JournalLine.account_id == Account.id)
                .where(
                    JournalEntry.is_posted == True,
                    JournalEntry.expense_category == cat,
                    JournalEntry.entry_date >= start,
                    JournalEntry.entry_date <= end,
                    Account.account_type == AccountType.EXPENSE,
                )
            )
            actual = float(actual_result.scalar() or 0)
            budgeted = float(getattr(bl, month_name, 0)) if bl else 0
            monthly[month_name] = {
                "budgeted": round(budgeted, 2),
                "actual": round(actual, 2),
                "variance": round(budgeted - actual, 2),
            }

        annual_budget = float(bl.annual_amount) if bl else 0
        annual_actual = sum(m["actual"] for m in monthly.values())

        variance.append({
            "category": cat,
            "annual_budget": round(annual_budget, 2),
            "annual_actual": round(annual_actual, 2),
            "annual_variance": round(annual_budget - annual_actual, 2),
            "monthly": monthly,
        })

    return {"year": year, "budget_name": budget.name if budget else None, "categories": variance}


# ── Cost Centers ──

async def get_cost_centers(db: AsyncSession):
    """Expenses grouped by flock, barn, grower."""
    # By flock
    flock_result = await db.execute(
        select(
            JournalEntry.flock_id,
            func.coalesce(func.sum(JournalLine.debit), 0),
        )
        .join(JournalLine, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(
            JournalEntry.is_posted == True,
            JournalEntry.flock_id.isnot(None),
            Account.account_type == AccountType.EXPENSE,
        )
        .group_by(JournalEntry.flock_id)
    )
    by_flock = []
    for flock_id, total in flock_result.all():
        flock = await db.get(Flock, flock_id)
        if flock:
            by_flock.append({
                "flock_id": flock_id, "flock_number": flock.flock_number,
                "total_expenses": round(float(total), 2),
            })
    by_flock.sort(key=lambda x: x["total_expenses"], reverse=True)

    # By grower (aggregate flocks at grower's barns)
    growers_result = await db.execute(
        select(Grower).where(Grower.is_active == True).order_by(Grower.name)
    )
    by_grower = []
    for grower in growers_result.scalars().all():
        barns_result = await db.execute(select(Barn.id).where(Barn.grower_id == grower.id))
        barn_ids = [r[0] for r in barns_result.all()]
        if not barn_ids:
            continue
        place_result = await db.execute(
            select(FlockPlacement.flock_id).where(FlockPlacement.barn_id.in_(barn_ids)).distinct()
        )
        flock_ids = [r[0] for r in place_result.all()]
        if not flock_ids:
            by_grower.append({"grower_name": grower.name, "total_expenses": 0})
            continue

        exp_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(
                JournalEntry.flock_id.in_(flock_ids),
                JournalEntry.is_posted == True,
                Account.account_type == AccountType.EXPENSE,
            )
        )
        by_grower.append({
            "grower_name": grower.name,
            "total_expenses": round(float(exp_result.scalar() or 0), 2),
        })

    return {"by_flock": by_flock, "by_grower": by_grower}


# ── Depreciation ──

async def create_depreciation(db: AsyncSession, data: dict):
    cost = Decimal(str(data["purchase_cost"]))
    salvage = Decimal(str(data.get("salvage_value", 0)))
    months = int(data["useful_life_months"])
    monthly = round((cost - salvage) / months, 2) if months > 0 else Decimal("0")

    sched = DepreciationSchedule(
        asset_name=data["asset_name"], purchase_date=data["purchase_date"],
        purchase_cost=cost, useful_life_months=months, salvage_value=salvage,
        method=DepreciationMethod(data.get("method", "straight_line")),
        monthly_depreciation=monthly,
        notes=data.get("notes"),
    )
    db.add(sched)
    await db.commit()
    await db.refresh(sched)
    return _dep_to_dict(sched)


async def get_depreciation_schedules(db: AsyncSession):
    result = await db.execute(
        select(DepreciationSchedule).order_by(DepreciationSchedule.asset_name)
    )
    return [_dep_to_dict(d) for d in result.scalars().all()]


def _dep_to_dict(d: DepreciationSchedule) -> dict:
    book_value = float(d.purchase_cost) - float(d.accumulated_depreciation)
    # Calculate months elapsed
    try:
        purchase = date.fromisoformat(d.purchase_date)
        today = date.today()
        months_elapsed = (today.year - purchase.year) * 12 + (today.month - purchase.month)
        months_elapsed = max(0, min(months_elapsed, d.useful_life_months))
    except ValueError:
        months_elapsed = 0

    expected_accum = round(float(d.monthly_depreciation) * months_elapsed, 2)

    return {
        "id": d.id, "asset_name": d.asset_name, "purchase_date": d.purchase_date,
        "purchase_cost": float(d.purchase_cost), "useful_life_months": d.useful_life_months,
        "salvage_value": float(d.salvage_value),
        "method": d.method.value if hasattr(d.method, 'value') else d.method,
        "monthly_depreciation": float(d.monthly_depreciation),
        "accumulated_depreciation": float(d.accumulated_depreciation),
        "expected_accumulated": expected_accum,
        "book_value": round(book_value, 2),
        "months_elapsed": months_elapsed,
        "is_active": d.is_active, "notes": d.notes,
    }


# ── Break-Even Analysis ──

async def get_break_even(db: AsyncSession):
    """Calculate break-even point: fixed costs / margin per dozen."""
    today = date.today()
    year = today.year
    start = f"{year}-01-01"
    end = today.isoformat()

    # Total expenses (as proxy for fixed + variable costs)
    exp_result = await db.execute(
        select(func.coalesce(func.sum(JournalLine.debit), 0))
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(JournalEntry.is_posted == True, JournalEntry.entry_date >= start,
               JournalEntry.entry_date <= end, Account.account_type == AccountType.EXPENSE)
    )
    total_expenses = float(exp_result.scalar() or 0)

    # Total revenue
    rev_result = await db.execute(
        select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
            EggSale.sale_date >= start, EggSale.sale_date <= end
        )
    )
    total_revenue = float(rev_result.scalar() or 0)

    # Total dozens produced
    egg_result = await db.execute(
        select(func.coalesce(func.sum(ProductionRecord.egg_count), 0)).where(
            ProductionRecord.record_date >= start, ProductionRecord.record_date <= end
        )
    )
    total_eggs = int(egg_result.scalar() or 0)
    total_dozens = total_eggs / 12 if total_eggs > 0 else 0

    revenue_per_dozen = total_revenue / total_dozens if total_dozens > 0 else 0
    cost_per_dozen = total_expenses / total_dozens if total_dozens > 0 else 0
    margin_per_dozen = revenue_per_dozen - cost_per_dozen
    break_even_dozens = total_expenses / revenue_per_dozen if revenue_per_dozen > 0 else 0

    return {
        "period": f"{start} to {end}",
        "total_expenses": round(total_expenses, 2),
        "total_revenue": round(total_revenue, 2),
        "total_dozens_produced": round(total_dozens, 1),
        "revenue_per_dozen": round(revenue_per_dozen, 4),
        "cost_per_dozen": round(cost_per_dozen, 4),
        "margin_per_dozen": round(margin_per_dozen, 4),
        "break_even_dozens": round(break_even_dozens, 0),
        "is_profitable": margin_per_dozen > 0,
    }


# ── Margin Analysis ──

async def get_margin_analysis(db: AsyncSession):
    """Margin analysis per contract."""
    contracts_result = await db.execute(
        select(EggContract).where(EggContract.is_active == True).order_by(EggContract.contract_number)
    )
    margins = []
    for contract in contracts_result.scalars().all():
        rev_result = await db.execute(
            select(func.coalesce(
                func.sum(ShipmentLine.skids * ShipmentLine.dozens_per_skid * ShipmentLine.price_per_dozen), 0
            ))
            .select_from(Shipment)
            .join(ShipmentLine, ShipmentLine.shipment_id == Shipment.id)
            .where(Shipment.contract_id == contract.id, Shipment.status != ShipmentStatus.CANCELLED,
                   ShipmentLine.price_per_dozen.isnot(None))
        )
        revenue = float(rev_result.scalar() or 0)

        doz_result = await db.execute(
            select(func.coalesce(func.sum(ShipmentLine.skids * ShipmentLine.dozens_per_skid), 0))
            .select_from(Shipment)
            .join(ShipmentLine, ShipmentLine.shipment_id == Shipment.id)
            .where(Shipment.contract_id == contract.id, Shipment.status != ShipmentStatus.CANCELLED)
        )
        dozens = int(doz_result.scalar() or 0)

        freight_result = await db.execute(
            select(func.coalesce(func.sum(Shipment.freight_cost), 0)).where(
                Shipment.contract_id == contract.id, Shipment.status != ShipmentStatus.CANCELLED,
                Shipment.freight_cost.isnot(None)
            )
        )
        freight = float(freight_result.scalar() or 0)

        net = revenue - freight
        margin_pct = round((net / revenue * 100), 1) if revenue > 0 else 0

        margins.append({
            "contract_number": contract.contract_number, "buyer": contract.buyer,
            "grade": contract.grade, "price_per_dozen": float(contract.price_per_dozen) if contract.price_per_dozen else None,
            "total_dozens": dozens, "revenue": round(revenue, 2),
            "freight": round(freight, 2), "net_revenue": round(net, 2),
            "margin_pct": margin_pct,
        })

    return margins


# ── Cash Flow Statement ──

async def get_cash_flow(db: AsyncSession, year: int = None):
    """Simple cash flow: receipts vs disbursements by month."""
    if not year:
        year = date.today().year

    months = []
    for month_idx in range(1, 13):
        start = f"{year}-{month_idx:02d}-01"
        last_day = calendar.monthrange(year, month_idx)[1]
        end = f"{year}-{month_idx:02d}-{last_day:02d}"
        label = calendar.month_abbr[month_idx]

        # Receipts = revenue credits
        rev_result = await db.execute(
            select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
                EggSale.sale_date >= start, EggSale.sale_date <= end
            )
        )
        receipts = float(rev_result.scalar() or 0)

        # Disbursements = expense debits
        exp_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(JournalEntry.is_posted == True, JournalEntry.entry_date >= start,
                   JournalEntry.entry_date <= end, Account.account_type == AccountType.EXPENSE)
        )
        disbursements = float(exp_result.scalar() or 0)

        months.append({
            "month": f"{label} {year}",
            "receipts": round(receipts, 2),
            "disbursements": round(disbursements, 2),
            "net_cash_flow": round(receipts - disbursements, 2),
        })

    total_receipts = sum(m["receipts"] for m in months)
    total_disbursements = sum(m["disbursements"] for m in months)

    return {
        "year": year, "months": months,
        "total_receipts": round(total_receipts, 2),
        "total_disbursements": round(total_disbursements, 2),
        "net_cash_flow": round(total_receipts - total_disbursements, 2),
    }


# ── Financial KPIs ──

async def get_financial_kpis(db: AsyncSession):
    """Key financial metrics for dashboard."""
    today = date.today()
    year = today.year
    start = f"{year}-01-01"
    end = today.isoformat()

    # Revenue YTD
    rev_result = await db.execute(
        select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
            EggSale.sale_date >= start, EggSale.sale_date <= end
        )
    )
    revenue_ytd = float(rev_result.scalar() or 0)

    # Expenses YTD
    exp_result = await db.execute(
        select(func.coalesce(func.sum(JournalLine.debit), 0))
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(JournalEntry.is_posted == True, JournalEntry.entry_date >= start,
               JournalEntry.entry_date <= end, Account.account_type == AccountType.EXPENSE)
    )
    expenses_ytd = float(exp_result.scalar() or 0)

    # Production YTD
    egg_result = await db.execute(
        select(func.coalesce(func.sum(ProductionRecord.egg_count), 0)).where(
            ProductionRecord.record_date >= start, ProductionRecord.record_date <= end
        )
    )
    total_eggs = int(egg_result.scalar() or 0)
    total_dozens = total_eggs / 12

    # Active flocks
    flock_result = await db.execute(
        select(func.count(Flock.id)).where(Flock.status.in_(["active", "closing"]))
    )
    active_flocks = flock_result.scalar() or 0

    net_income = revenue_ytd - expenses_ytd
    profit_margin = round((net_income / revenue_ytd * 100), 1) if revenue_ytd > 0 else 0
    cost_per_dozen = round(expenses_ytd / total_dozens, 4) if total_dozens > 0 else 0
    revenue_per_dozen = round(revenue_ytd / total_dozens, 4) if total_dozens > 0 else 0

    return {
        "revenue_ytd": round(revenue_ytd, 2),
        "expenses_ytd": round(expenses_ytd, 2),
        "net_income_ytd": round(net_income, 2),
        "profit_margin_pct": profit_margin,
        "total_dozens_ytd": round(total_dozens, 1),
        "cost_per_dozen": cost_per_dozen,
        "revenue_per_dozen": revenue_per_dozen,
        "active_flocks": active_flocks,
    }
