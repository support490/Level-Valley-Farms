from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from typing import Optional

from app.models.accounting import Account, AccountType, JournalEntry, JournalLine, ExpenseCategory
from app.models.flock import Flock, FlockStatus, FlockType, MortalityRecord, ProductionRecord, FlockSource
from app.models.farm import FlockPlacement, Barn, Grower
from app.models.inventory import EggSale
from app.models.contracts import EggContract, ContractFlockAssignment
from app.models.logistics import Shipment, ShipmentLine


# ── Flock Lifecycle Report ──

async def get_flock_report(db: AsyncSession, flock_id: str):
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Mortality
    mort_result = await db.execute(
        select(
            func.coalesce(func.sum(MortalityRecord.deaths), 0),
            func.coalesce(func.sum(MortalityRecord.culls), 0),
        ).where(MortalityRecord.flock_id == flock_id)
    )
    mort_row = mort_result.one()
    total_deaths = int(mort_row[0])
    total_culls = int(mort_row[1])
    mortality_pct = round(
        (total_deaths + total_culls) / flock.initial_bird_count * 100, 2
    ) if flock.initial_bird_count > 0 else 0

    # Expenses by category
    expense_query = (
        select(
            JournalEntry.expense_category,
            func.count(JournalEntry.id).label("entry_count"),
        )
        .where(
            JournalEntry.flock_id == flock_id,
            JournalEntry.is_posted == True,
            JournalEntry.expense_category.isnot(None),
        )
        .group_by(JournalEntry.expense_category)
    )
    expense_result = await db.execute(expense_query)
    expense_rows = expense_result.all()

    expenses_by_category = []
    total_expenses = 0.0

    for row in expense_rows:
        category = row[0].value if hasattr(row[0], 'value') else row[0]
        # Sum the debit amounts on expense accounts for this category
        amount_query = (
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(
                JournalEntry.flock_id == flock_id,
                JournalEntry.is_posted == True,
                JournalEntry.expense_category == row[0],
                Account.account_type == AccountType.EXPENSE,
            )
        )
        amount_result = await db.execute(amount_query)
        amount = float(amount_result.scalar() or 0)
        total_expenses += amount
        expenses_by_category.append({
            "category": category,
            "total": round(amount, 2),
            "entry_count": row[1],
        })

    # Revenue (egg sales)
    revenue_query = (
        select(func.coalesce(func.sum(EggSale.total_amount), 0))
        .where(EggSale.flock_id == flock_id)
    )
    revenue_result = await db.execute(revenue_query)
    total_revenue = float(revenue_result.scalar() or 0)

    # Production summary
    prod_result = await db.execute(
        select(ProductionRecord)
        .where(ProductionRecord.flock_id == flock_id)
        .order_by(ProductionRecord.record_date)
    )
    prod_records = prod_result.scalars().all()
    if prod_records:
        pcts = [r.production_pct for r in prod_records]
        production_summary = {
            "avg_production_pct": round(sum(pcts) / len(pcts), 2),
            "peak_production_pct": round(max(pcts), 2),
            "current_production_pct": round(pcts[-1], 2),
            "total_eggs": sum(r.egg_count for r in prod_records),
            "total_days": len(prod_records),
        }
    else:
        production_summary = {
            "avg_production_pct": 0, "peak_production_pct": 0,
            "current_production_pct": 0, "total_eggs": 0, "total_days": 0,
        }

    # Placement history
    place_result = await db.execute(
        select(FlockPlacement)
        .where(FlockPlacement.flock_id == flock_id)
        .order_by(FlockPlacement.placed_date)
    )
    placements = []
    for p in place_result.scalars().all():
        barn = await db.get(Barn, p.barn_id)
        grower = await db.get(Grower, barn.grower_id) if barn else None
        placements.append({
            "barn_name": barn.name if barn else "",
            "grower_name": grower.name if grower else "",
            "barn_type": barn.barn_type.value if barn else "",
            "bird_count": p.bird_count,
            "placed_date": p.placed_date,
            "removed_date": p.removed_date,
            "is_current": p.is_current,
        })

    # ── Layer Cost Report calculations ──
    birds_placed = flock.initial_bird_count
    total_eggs = production_summary.get("total_eggs", 0)
    eggs_produced_dozens = total_eggs / 12 if total_eggs > 0 else 0
    dozens_per_bird_housed = eggs_produced_dozens / birds_placed if birds_placed > 0 else 0
    expense_per_bird = total_expenses / birds_placed if birds_placed > 0 else 0
    gross_income_per_bird = total_revenue / birds_placed if birds_placed > 0 else 0
    net_profit = total_revenue - total_expenses
    net_profit_per_bird = net_profit / birds_placed if birds_placed > 0 else 0
    current_cost_per_bird = -net_profit_per_bird if net_profit < 0 else -net_profit_per_bird
    avg_sale_price_per_dozen = total_revenue / eggs_produced_dozens if eggs_produced_dozens > 0 else 0

    # Per-bird and per-dozen for each expense category
    for exp in expenses_by_category:
        exp["per_bird"] = round(exp["total"] / birds_placed, 2) if birds_placed > 0 else 0
        exp["per_dozen_eggs"] = round(exp["total"] / eggs_produced_dozens, 2) if eggs_produced_dozens > 0 else 0

    # Feed purchased in tons (from feed expense entries)
    # Estimate: if we know feed cost per ton from journal entries, we'd need a reference price
    # For now, estimate from feed expenses / avg price per ton (~$280/ton typical)
    feed_total = 0.0
    for exp in expenses_by_category:
        if exp["category"] == "feed":
            feed_total = exp["total"]
    # Feed conversion: lbs per dozen eggs
    # Typical: 1 ton = 2000 lbs, feed_purchased_tons = feed_total / cost_per_ton
    # We'll estimate tons from cost (approx $280/ton for layer feed)
    feed_purchased_tons = feed_total / 280.0 if feed_total > 0 else 0
    feed_conversion = (feed_purchased_tons * 2000) / eggs_produced_dozens if eggs_produced_dozens > 0 else 0

    # Contracts assigned to this flock
    contract_result = await db.execute(
        select(ContractFlockAssignment).where(ContractFlockAssignment.flock_id == flock_id)
    )
    contracts_list = []
    for assignment in contract_result.scalars().all():
        contract = await db.get(EggContract, assignment.contract_id)
        if contract:
            # Get shipped dozens for this contract+flock
            shipped_result = await db.execute(
                select(func.coalesce(func.sum(ShipmentLine.skids * ShipmentLine.dozens_per_skid), 0))
                .join(Shipment, ShipmentLine.shipment_id == Shipment.id)
                .where(
                    Shipment.contract_id == contract.id,
                    ShipmentLine.flock_id == flock_id,
                )
            )
            shipped_dozens = int(shipped_result.scalar() or 0)
            contracts_list.append({
                "contract_number": contract.contract_number,
                "buyer": contract.buyer,
                "price_per_dozen": float(contract.price_per_dozen) if contract.price_per_dozen else None,
                "grade": contract.grade,
                "shipped_dozens": shipped_dozens,
            })

    # Flock sources (for layer flocks that came from pullet splits)
    flock_sources_list = []
    if flock.flock_type == FlockType.LAYER:
        sources_result = await db.execute(
            select(FlockSource).where(FlockSource.layer_flock_id == flock_id)
        )
        for src in sources_result.scalars().all():
            pullet = await db.get(Flock, src.pullet_flock_id)
            flock_sources_list.append({
                "pullet_flock_number": pullet.flock_number if pullet else "",
                "bird_count": src.bird_count,
                "cost_per_bird": float(src.cost_per_bird),
                "transfer_date": src.transfer_date,
            })

    return {
        "flock_id": flock_id,
        "flock_number": flock.flock_number,
        "flock_type": flock.flock_type.value if hasattr(flock.flock_type, 'value') else flock.flock_type,
        "bird_color": flock.bird_color.value if hasattr(flock.bird_color, 'value') else flock.bird_color,
        "source_type": flock.source_type.value if hasattr(flock.source_type, 'value') else flock.source_type,
        "breed": flock.breed,
        "status": flock.status.value if hasattr(flock.status, 'value') else flock.status,
        "arrival_date": flock.arrival_date,
        "sold_date": flock.sold_date,
        "cost_per_bird": float(flock.cost_per_bird) if flock.cost_per_bird else 0,
        "initial_bird_count": flock.initial_bird_count,
        "current_bird_count": flock.current_bird_count,
        "total_deaths": total_deaths,
        "total_culls": total_culls,
        "mortality_pct": mortality_pct,
        "expenses_by_category": expenses_by_category,
        "total_expenses": round(total_expenses, 2),
        "total_revenue": round(total_revenue, 2),
        "net_profit_loss": round(net_profit, 2),
        "expense_per_bird": round(expense_per_bird, 2),
        "gross_income_per_bird": round(gross_income_per_bird, 2),
        "net_profit_per_bird": round(net_profit_per_bird, 2),
        "eggs_produced_dozens": round(eggs_produced_dozens, 1),
        "dozens_per_bird_housed": round(dozens_per_bird_housed, 1),
        "avg_sale_price_per_dozen": round(avg_sale_price_per_dozen, 2),
        "feed_purchased_tons": round(feed_purchased_tons, 1),
        "feed_conversion_lbs_per_doz": round(feed_conversion, 6),
        "current_cost_per_bird": round(current_cost_per_bird, 2),
        "production_summary": production_summary,
        "placement_history": placements,
        "contracts": contracts_list,
        "flock_sources": flock_sources_list,
    }


# ── Income Statement ──

async def get_income_statement(db: AsyncSession, date_from: str, date_to: str):
    revenue_rows = await _get_account_totals(db, AccountType.REVENUE, date_from, date_to)
    expense_rows = await _get_account_totals(db, AccountType.EXPENSE, date_from, date_to)

    total_revenue = sum(r["amount"] for r in revenue_rows)
    total_expenses = sum(r["amount"] for r in expense_rows)

    return {
        "period_from": date_from,
        "period_to": date_to,
        "revenue": revenue_rows,
        "total_revenue": round(total_revenue, 2),
        "expenses": expense_rows,
        "total_expenses": round(total_expenses, 2),
        "net_income": round(total_revenue - total_expenses, 2),
    }


# ── Balance Sheet ──

async def get_balance_sheet(db: AsyncSession, as_of_date: str):
    asset_rows = await _get_account_balances(db, AccountType.ASSET, as_of_date)
    liability_rows = await _get_account_balances(db, AccountType.LIABILITY, as_of_date)
    equity_rows = await _get_account_balances(db, AccountType.EQUITY, as_of_date)

    # Add net income to equity
    revenue_total = sum(r["amount"] for r in await _get_account_totals(db, AccountType.REVENUE, None, as_of_date))
    expense_total = sum(r["amount"] for r in await _get_account_totals(db, AccountType.EXPENSE, None, as_of_date))
    net_income = revenue_total - expense_total

    if abs(net_income) > 0.01:
        equity_rows.append({
            "account_id": "",
            "account_number": "",
            "account_name": "Net Income (Current Period)",
            "amount": round(net_income, 2),
        })

    total_assets = sum(r["amount"] for r in asset_rows)
    total_liabilities = sum(r["amount"] for r in liability_rows)
    total_equity = sum(r["amount"] for r in equity_rows)
    total_le = total_liabilities + total_equity

    return {
        "as_of_date": as_of_date,
        "assets": {"accounts": asset_rows, "total": round(total_assets, 2)},
        "liabilities": {"accounts": liability_rows, "total": round(total_liabilities, 2)},
        "equity": {"accounts": equity_rows, "total": round(total_equity, 2)},
        "total_liabilities_equity": round(total_le, 2),
        "is_balanced": abs(total_assets - total_le) < 0.01,
    }


# ── Helpers ──

async def _get_account_totals(db: AsyncSession, account_type: AccountType, date_from: str = None, date_to: str = None):
    """Get totals for each account of a given type from posted journal entries."""
    accounts_result = await db.execute(
        select(Account)
        .where(Account.account_type == account_type, Account.is_active == True, Account.parent_id.isnot(None))
        .order_by(Account.account_number)
    )
    accounts = accounts_result.scalars().all()

    rows = []
    for account in accounts:
        query = (
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
        if date_from:
            query = query.where(JournalEntry.entry_date >= date_from)
        if date_to:
            query = query.where(JournalEntry.entry_date <= date_to)

        result = await db.execute(query)
        row = result.one()
        total_debit = float(row.total_debit)
        total_credit = float(row.total_credit)

        # Revenue/Liability/Equity normal = credit, Expense/Asset normal = debit
        if account_type in (AccountType.REVENUE, AccountType.LIABILITY, AccountType.EQUITY):
            amount = total_credit - total_debit
        else:
            amount = total_debit - total_credit

        if abs(amount) > 0.001:
            rows.append({
                "account_id": account.id,
                "account_number": account.account_number,
                "account_name": account.name,
                "amount": round(amount, 2),
            })

    return rows


async def _get_account_balances(db: AsyncSession, account_type: AccountType, as_of_date: str):
    """Get balance for each account up to as_of_date."""
    return await _get_account_totals(db, account_type, None, as_of_date)
