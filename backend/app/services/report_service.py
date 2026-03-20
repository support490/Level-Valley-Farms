from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from decimal import Decimal
from typing import Optional
from datetime import date, timedelta

from app.models.accounting import (
    Account, AccountType, JournalEntry, JournalLine, ExpenseCategory,
    Bill, BillStatus, CustomerInvoice, InvoiceStatus, InvoiceLineItem,
    CustomerPayment, CreditMemo, CreditMemoStatus,
    BillPayment, VendorCredit, VendorCreditStatus,
    CustomerDepositModel,
)
from app.models.settings import AuditLog
from app.models.flock import Flock, FlockStatus, FlockType, MortalityRecord, ProductionRecord, FlockSource
from app.models.farm import FlockPlacement, Barn, Grower
from app.models.inventory import EggSale
from app.models.contracts import EggContract, ContractFlockAssignment, Buyer
from app.models.logistics import Shipment, ShipmentLine, PickupItem, PickupJob, PickupStatus
from app.models.weekly_record import WeeklyRecord, WeeklyProductionLog


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

    # ── Inventory Reconciliation & Warnings ──
    inventory_reconciliation = None
    warnings = []

    if flock.status in (FlockStatus.CLOSING, FlockStatus.SOLD, FlockStatus.CULLED):
        # Total eggs from weekly production logs
        weekly_eggs_result = await db.execute(
            select(func.coalesce(func.sum(WeeklyProductionLog.egg_production), 0))
            .join(WeeklyRecord, WeeklyProductionLog.weekly_record_id == WeeklyRecord.id)
            .where(WeeklyRecord.flock_id == flock_id)
        )
        total_eggs_from_weekly = int(weekly_eggs_result.scalar() or 0)
        # Also count from production records
        total_eggs_from_prod = production_summary.get("total_eggs", 0)
        total_eggs_produced = max(total_eggs_from_weekly, total_eggs_from_prod)
        total_dozens_produced = total_eggs_produced / 12 if total_eggs_produced > 0 else 0

        # Total dozens picked up (skids_actual * 900 dozens per skid)
        pickup_result = await db.execute(
            select(func.coalesce(func.sum(PickupItem.skids_actual * 900), 0))
            .join(PickupJob, PickupItem.pickup_job_id == PickupJob.id)
            .where(
                PickupItem.flock_id == flock_id,
                PickupJob.status == PickupStatus.COMPLETED,
            )
        )
        total_dozens_picked_up = int(pickup_result.scalar() or 0)

        # Total dozens shipped
        shipped_result = await db.execute(
            select(func.coalesce(func.sum(ShipmentLine.skids * ShipmentLine.dozens_per_skid), 0))
            .where(ShipmentLine.flock_id == flock_id)
        )
        total_dozens_shipped = int(shipped_result.scalar() or 0)

        prod_vs_pickup = total_dozens_produced - total_dozens_picked_up
        pickup_vs_ship = total_dozens_picked_up - total_dozens_shipped

        inventory_reconciliation = {
            "total_eggs_produced": total_eggs_produced,
            "total_dozens_produced": round(total_dozens_produced, 1),
            "total_dozens_picked_up": total_dozens_picked_up,
            "total_dozens_shipped": total_dozens_shipped,
            "production_vs_pickup_diff": round(prod_vs_pickup, 1),
            "pickup_vs_shipment_diff": pickup_vs_ship,
        }

        threshold_pct = 0.05
        if total_dozens_produced > 0 and abs(prod_vs_pickup) > total_dozens_produced * threshold_pct:
            pct = round(abs(prod_vs_pickup) / total_dozens_produced * 100, 1)
            warnings.append(
                f"Production records show {total_dozens_produced:,.0f} dozens produced but only "
                f"{total_dozens_picked_up:,} dozens were picked up — difference of "
                f"{abs(prod_vs_pickup):,.0f} dozens ({pct}%)"
            )
        if total_dozens_picked_up > 0 and abs(pickup_vs_ship) > total_dozens_picked_up * threshold_pct:
            warnings.append(
                f"{total_dozens_picked_up:,} dozens were picked up but only "
                f"{total_dozens_shipped:,} dozens were shipped — difference of "
                f"{abs(pickup_vs_ship):,} dozens"
            )

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
        "inventory_reconciliation": inventory_reconciliation,
        "warnings": warnings,
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


# ── Grower Performance Scorecard ──

async def get_grower_scorecard(db: AsyncSession):
    """Aggregate production, mortality, expenses per grower."""
    growers_result = await db.execute(
        select(Grower).where(Grower.is_active == True).order_by(Grower.name)
    )
    growers = growers_result.scalars().all()
    scorecards = []

    for grower in growers:
        # Get barns for this grower
        barns_result = await db.execute(
            select(Barn).where(Barn.grower_id == grower.id)
        )
        barns = barns_result.scalars().all()
        barn_ids = [b.id for b in barns]
        if not barn_ids:
            continue

        # Get flocks placed at these barns
        placements_result = await db.execute(
            select(FlockPlacement.flock_id).where(
                FlockPlacement.barn_id.in_(barn_ids)
            ).distinct()
        )
        flock_ids = [r[0] for r in placements_result.all()]
        if not flock_ids:
            scorecards.append({
                "grower_id": grower.id,
                "grower_name": grower.name,
                "location": grower.location,
                "num_barns": len(barns),
                "total_birds": sum(b.current_bird_count for b in barns),
                "active_flocks": 0,
                "avg_production_pct": 0,
                "total_eggs": 0,
                "total_deaths": 0,
                "total_culls": 0,
                "mortality_pct": 0,
                "total_expenses": 0,
                "total_revenue": 0,
                "net_profit": 0,
            })
            continue

        # Active flock count
        active_result = await db.execute(
            select(func.count(Flock.id)).where(
                Flock.id.in_(flock_ids),
                Flock.status == FlockStatus.ACTIVE,
            )
        )
        active_flocks = active_result.scalar() or 0

        # Production
        prod_result = await db.execute(
            select(
                func.coalesce(func.avg(ProductionRecord.production_pct), 0),
                func.coalesce(func.sum(ProductionRecord.egg_count), 0),
            ).where(ProductionRecord.flock_id.in_(flock_ids))
        )
        prod_row = prod_result.one()
        avg_prod = round(float(prod_row[0]), 1)
        total_eggs = int(prod_row[1])

        # Mortality
        mort_result = await db.execute(
            select(
                func.coalesce(func.sum(MortalityRecord.deaths), 0),
                func.coalesce(func.sum(MortalityRecord.culls), 0),
            ).where(MortalityRecord.flock_id.in_(flock_ids))
        )
        mort_row = mort_result.one()
        total_deaths = int(mort_row[0])
        total_culls = int(mort_row[1])

        # Initial bird count for mortality %
        bird_result = await db.execute(
            select(func.coalesce(func.sum(Flock.initial_bird_count), 0)).where(
                Flock.id.in_(flock_ids)
            )
        )
        initial_birds = int(bird_result.scalar() or 1)
        mortality_pct = round((total_deaths + total_culls) / initial_birds * 100, 2) if initial_birds > 0 else 0

        # Expenses
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
        total_expenses = float(exp_result.scalar() or 0)

        # Revenue
        rev_result = await db.execute(
            select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
                EggSale.flock_id.in_(flock_ids)
            )
        )
        total_revenue = float(rev_result.scalar() or 0)

        scorecards.append({
            "grower_id": grower.id,
            "grower_name": grower.name,
            "location": grower.location,
            "num_barns": len(barns),
            "total_birds": sum(b.current_bird_count for b in barns),
            "active_flocks": active_flocks,
            "avg_production_pct": avg_prod,
            "total_eggs": total_eggs,
            "total_deaths": total_deaths,
            "total_culls": total_culls,
            "mortality_pct": mortality_pct,
            "total_expenses": round(total_expenses, 2),
            "total_revenue": round(total_revenue, 2),
            "net_profit": round(total_revenue - total_expenses, 2),
        })

    return scorecards


# ── Farm-wide P&L by Period ──

async def get_farm_pnl(db: AsyncSession, period: str = "monthly", year: int = None):
    """Get P&L broken down by month, quarter, or year."""
    from datetime import date as dt_date
    if not year:
        year = dt_date.today().year

    periods = []
    if period == "monthly":
        for month in range(1, 13):
            start = f"{year}-{month:02d}-01"
            if month == 12:
                end = f"{year}-12-31"
            else:
                end = f"{year}-{month + 1:02d}-01"
                # Subtract one day
                from datetime import date as d, timedelta
                end = (d.fromisoformat(end) - timedelta(days=1)).isoformat()
            import calendar
            label = calendar.month_abbr[month]
            periods.append({"label": f"{label} {year}", "start": start, "end": end})
    elif period == "quarterly":
        quarters = [(1, 3), (4, 6), (7, 9), (10, 12)]
        for i, (sm, em) in enumerate(quarters):
            start = f"{year}-{sm:02d}-01"
            from datetime import date as d
            import calendar
            last_day = calendar.monthrange(year, em)[1]
            end = f"{year}-{em:02d}-{last_day:02d}"
            periods.append({"label": f"Q{i+1} {year}", "start": start, "end": end})
    else:  # yearly
        periods.append({"label": str(year), "start": f"{year}-01-01", "end": f"{year}-12-31"})

    results = []
    for p in periods:
        revenue_rows = await _get_account_totals(db, AccountType.REVENUE, p["start"], p["end"])
        expense_rows = await _get_account_totals(db, AccountType.EXPENSE, p["start"], p["end"])
        total_rev = sum(r["amount"] for r in revenue_rows)
        total_exp = sum(r["amount"] for r in expense_rows)
        results.append({
            "period": p["label"],
            "start_date": p["start"],
            "end_date": p["end"],
            "revenue": round(total_rev, 2),
            "expenses": round(total_exp, 2),
            "net_income": round(total_rev - total_exp, 2),
        })

    return {
        "year": year,
        "period_type": period,
        "periods": results,
        "total_revenue": round(sum(r["revenue"] for r in results), 2),
        "total_expenses": round(sum(r["expenses"] for r in results), 2),
        "total_net_income": round(sum(r["net_income"] for r in results), 2),
    }


# ── Cost per Dozen Trend ──

async def get_cost_per_dozen_trend(db: AsyncSession, months: int = 12):
    """Track cost per dozen eggs over time."""
    from datetime import date as dt_date, timedelta
    today = dt_date.today()
    trends = []

    for i in range(months - 1, -1, -1):
        # Calculate month start/end
        month_date = today.replace(day=1) - timedelta(days=i * 30)
        year = month_date.year
        month = month_date.month
        import calendar
        start = f"{year}-{month:02d}-01"
        last_day = calendar.monthrange(year, month)[1]
        end = f"{year}-{month:02d}-{last_day:02d}"
        label = f"{calendar.month_abbr[month]} {year}"

        # Total expenses in this period
        exp_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(
                JournalEntry.is_posted == True,
                JournalEntry.entry_date >= start,
                JournalEntry.entry_date <= end,
                Account.account_type == AccountType.EXPENSE,
            )
        )
        total_expenses = float(exp_result.scalar() or 0)

        # Total eggs produced in this period
        egg_result = await db.execute(
            select(func.coalesce(func.sum(ProductionRecord.egg_count), 0)).where(
                ProductionRecord.record_date >= start,
                ProductionRecord.record_date <= end,
            )
        )
        total_eggs = int(egg_result.scalar() or 0)
        total_dozens = total_eggs / 12 if total_eggs > 0 else 0
        cost_per_dozen = round(total_expenses / total_dozens, 4) if total_dozens > 0 else 0

        # Revenue per dozen
        rev_result = await db.execute(
            select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
                EggSale.sale_date >= start,
                EggSale.sale_date <= end,
            )
        )
        total_revenue = float(rev_result.scalar() or 0)
        revenue_per_dozen = round(total_revenue / total_dozens, 4) if total_dozens > 0 else 0

        trends.append({
            "period": label,
            "start_date": start,
            "end_date": end,
            "total_expenses": round(total_expenses, 2),
            "total_eggs": total_eggs,
            "total_dozens": round(total_dozens, 1),
            "cost_per_dozen": cost_per_dozen,
            "revenue_per_dozen": revenue_per_dozen,
            "margin_per_dozen": round(revenue_per_dozen - cost_per_dozen, 4),
        })

    return trends


# ── Flock Comparison Report ──

async def get_flock_comparison(db: AsyncSession):
    """Rank flocks by profitability."""
    flocks_result = await db.execute(
        select(Flock).where(Flock.flock_type == "layer").order_by(Flock.flock_number)
    )
    flocks = flocks_result.scalars().all()
    comparisons = []

    for flock in flocks:
        # Expenses
        exp_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(
                JournalEntry.flock_id == flock.id,
                JournalEntry.is_posted == True,
                Account.account_type == AccountType.EXPENSE,
            )
        )
        total_expenses = float(exp_result.scalar() or 0)

        # Revenue
        rev_result = await db.execute(
            select(func.coalesce(func.sum(EggSale.total_amount), 0)).where(
                EggSale.flock_id == flock.id
            )
        )
        total_revenue = float(rev_result.scalar() or 0)

        # Production
        prod_result = await db.execute(
            select(
                func.coalesce(func.avg(ProductionRecord.production_pct), 0),
                func.coalesce(func.sum(ProductionRecord.egg_count), 0),
                func.count(ProductionRecord.id),
            ).where(ProductionRecord.flock_id == flock.id)
        )
        prod_row = prod_result.one()
        avg_prod = round(float(prod_row[0]), 1)
        total_eggs = int(prod_row[1])
        prod_days = int(prod_row[2])

        # Mortality
        mort_result = await db.execute(
            select(
                func.coalesce(func.sum(MortalityRecord.deaths), 0),
                func.coalesce(func.sum(MortalityRecord.culls), 0),
            ).where(MortalityRecord.flock_id == flock.id)
        )
        mort_row = mort_result.one()
        total_deaths = int(mort_row[0]) + int(mort_row[1])
        mortality_pct = round(total_deaths / flock.initial_bird_count * 100, 2) if flock.initial_bird_count > 0 else 0

        net_profit = total_revenue - total_expenses
        dozens = total_eggs / 12 if total_eggs > 0 else 0
        cost_per_dozen = round(total_expenses / dozens, 4) if dozens > 0 else 0
        profit_per_bird = round(net_profit / flock.initial_bird_count, 2) if flock.initial_bird_count > 0 else 0

        comparisons.append({
            "flock_id": flock.id,
            "flock_number": flock.flock_number,
            "status": flock.status.value if hasattr(flock.status, 'value') else flock.status,
            "bird_count": flock.initial_bird_count,
            "current_birds": flock.current_bird_count,
            "avg_production_pct": avg_prod,
            "total_eggs": total_eggs,
            "total_dozens": round(dozens, 1),
            "total_expenses": round(total_expenses, 2),
            "total_revenue": round(total_revenue, 2),
            "net_profit": round(net_profit, 2),
            "cost_per_dozen": cost_per_dozen,
            "profit_per_bird": profit_per_bird,
            "mortality_pct": mortality_pct,
            "prod_days": prod_days,
        })

    # Sort by net profit descending
    comparisons.sort(key=lambda x: x["net_profit"], reverse=True)
    return comparisons


# ── CSV Export ──

async def export_report_csv(db: AsyncSession, report_type: str, **kwargs):
    """Generate CSV content for a report."""
    import csv
    from io import StringIO

    output = StringIO()
    writer = csv.writer(output)

    if report_type == "flock-comparison":
        data = await get_flock_comparison(db)
        writer.writerow(["Flock #", "Status", "Birds", "Avg Prod %", "Total Eggs", "Dozens",
                         "Expenses", "Revenue", "Net Profit", "Cost/Doz", "Profit/Bird", "Mortality %"])
        for r in data:
            writer.writerow([
                r["flock_number"], r["status"], r["bird_count"], r["avg_production_pct"],
                r["total_eggs"], r["total_dozens"], r["total_expenses"], r["total_revenue"],
                r["net_profit"], r["cost_per_dozen"], r["profit_per_bird"], r["mortality_pct"],
            ])

    elif report_type == "grower-scorecard":
        data = await get_grower_scorecard(db)
        writer.writerow(["Grower", "Location", "Barns", "Birds", "Active Flocks", "Avg Prod %",
                         "Total Eggs", "Deaths", "Culls", "Mortality %", "Expenses", "Revenue", "Net Profit"])
        for r in data:
            writer.writerow([
                r["grower_name"], r["location"], r["num_barns"], r["total_birds"], r["active_flocks"],
                r["avg_production_pct"], r["total_eggs"], r["total_deaths"], r["total_culls"],
                r["mortality_pct"], r["total_expenses"], r["total_revenue"], r["net_profit"],
            ])

    elif report_type == "farm-pnl":
        period = kwargs.get("period", "monthly")
        year = kwargs.get("year")
        data = await get_farm_pnl(db, period, year)
        writer.writerow(["Period", "Revenue", "Expenses", "Net Income"])
        for r in data["periods"]:
            writer.writerow([r["period"], r["revenue"], r["expenses"], r["net_income"]])
        writer.writerow(["TOTAL", data["total_revenue"], data["total_expenses"], data["total_net_income"]])

    elif report_type == "cost-per-dozen":
        data = await get_cost_per_dozen_trend(db)
        writer.writerow(["Period", "Total Expenses", "Total Eggs", "Total Dozens",
                         "Cost/Dozen", "Revenue/Dozen", "Margin/Dozen"])
        for r in data:
            writer.writerow([
                r["period"], r["total_expenses"], r["total_eggs"], r["total_dozens"],
                r["cost_per_dozen"], r["revenue_per_dozen"], r["margin_per_dozen"],
            ])

    elif report_type == "income-statement":
        date_from = kwargs.get("date_from", "2020-01-01")
        date_to = kwargs.get("date_to", "2099-12-31")
        data = await get_income_statement(db, date_from, date_to)
        writer.writerow(["Income Statement", f"{date_from} to {date_to}"])
        writer.writerow([])
        writer.writerow(["REVENUE"])
        for r in data["revenue"]:
            writer.writerow([r["account_number"], r["account_name"], r["amount"]])
        writer.writerow(["", "Total Revenue", data["total_revenue"]])
        writer.writerow([])
        writer.writerow(["EXPENSES"])
        for r in data["expenses"]:
            writer.writerow([r["account_number"], r["account_name"], r["amount"]])
        writer.writerow(["", "Total Expenses", data["total_expenses"]])
        writer.writerow([])
        writer.writerow(["", "NET INCOME", data["net_income"]])

    return output.getvalue()


# ── General Ledger ──

async def get_general_ledger(db: AsyncSession, date_from: str, date_to: str):
    """Return all posted journal lines grouped by account with running balance per account."""
    accounts_result = await db.execute(
        select(Account).where(Account.is_active == True).order_by(Account.account_number)
    )
    accounts = accounts_result.scalars().all()

    ledger = []
    for account in accounts:
        lines_query = (
            select(
                JournalLine.debit,
                JournalLine.credit,
                JournalEntry.entry_date,
                JournalEntry.entry_number,
                JournalEntry.description,
            )
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalLine.account_id == account.id,
                JournalEntry.is_posted == True,
                JournalEntry.entry_date >= date_from,
                JournalEntry.entry_date <= date_to,
            )
            .order_by(JournalEntry.entry_date, JournalEntry.entry_number)
        )
        lines_result = await db.execute(lines_query)
        lines = lines_result.all()

        if not lines:
            continue

        running_balance = Decimal("0")
        # Revenue/Liability/Equity: credit-normal.  Asset/Expense: debit-normal.
        credit_normal = account.account_type in (
            AccountType.REVENUE, AccountType.LIABILITY, AccountType.EQUITY,
        )
        transactions = []
        for line in lines:
            debit = line.debit or Decimal("0")
            credit = line.credit or Decimal("0")
            if credit_normal:
                running_balance += credit - debit
            else:
                running_balance += debit - credit
            transactions.append({
                "date": line.entry_date,
                "entry_number": line.entry_number,
                "description": line.description,
                "debit": float(debit),
                "credit": float(credit),
                "running_balance": round(float(running_balance), 2),
            })

        ledger.append({
            "account_number": account.account_number,
            "account_name": account.name,
            "account_type": account.account_type.value if hasattr(account.account_type, 'value') else account.account_type,
            "transactions": transactions,
        })

    return ledger


# ── Audit Trail ──

async def get_audit_trail(
    db: AsyncSession,
    date_from: str = None,
    date_to: str = None,
    entity_type: str = None,
):
    """Return complete audit trail from AuditLog, sorted newest first."""
    query = select(AuditLog).order_by(AuditLog.created_at.desc())

    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at <= date_to)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)

    result = await db.execute(query)
    rows = result.scalars().all()

    return [
        {
            "id": row.id,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "description": row.description,
            "details": row.details,
            "user": row.user,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


# ── AR Aging Detail ──

async def get_ar_aging_detail(db: AsyncSession):
    """Return every open invoice with aging detail and customer totals."""
    today = date.today()
    query = (
        select(CustomerInvoice)
        .where(CustomerInvoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]))
        .order_by(CustomerInvoice.due_date)
    )
    result = await db.execute(query)
    invoices = result.scalars().all()

    detail = []
    customer_map: dict[str, dict] = {}

    for inv in invoices:
        balance = float(inv.amount) - float(inv.amount_paid)
        due = date.fromisoformat(inv.due_date) if isinstance(inv.due_date, str) else inv.due_date
        days_overdue = (today - due).days
        if days_overdue < 0:
            days_overdue = 0

        detail.append({
            "invoice_number": inv.invoice_number,
            "buyer": inv.buyer,
            "buyer_id": inv.buyer_id,
            "invoice_date": inv.invoice_date,
            "due_date": inv.due_date,
            "amount": float(inv.amount),
            "amount_paid": float(inv.amount_paid),
            "balance": round(balance, 2),
            "days_overdue": days_overdue,
            "terms": inv.terms,
            "po_number": inv.po_number,
        })

        key = inv.buyer_id or inv.buyer
        if key not in customer_map:
            customer_map[key] = {"buyer": inv.buyer, "buyer_id": inv.buyer_id, "total_balance": 0.0}
        customer_map[key]["total_balance"] += balance

    # Sort by days_overdue descending
    detail.sort(key=lambda x: x["days_overdue"], reverse=True)

    customer_totals = [
        {"buyer": v["buyer"], "buyer_id": v["buyer_id"], "total_balance": round(v["total_balance"], 2)}
        for v in sorted(customer_map.values(), key=lambda x: x["total_balance"], reverse=True)
    ]

    return {"invoices": detail, "customer_totals": customer_totals}


# ── AP Aging Detail ──

async def get_ap_aging_detail(db: AsyncSession):
    """Return every open bill with aging detail and vendor totals."""
    today = date.today()
    query = (
        select(Bill)
        .where(Bill.status.in_([BillStatus.RECEIVED, BillStatus.PARTIAL, BillStatus.OVERDUE]))
        .order_by(Bill.due_date)
    )
    result = await db.execute(query)
    bills = result.scalars().all()

    detail = []
    vendor_map: dict[str, dict] = {}

    for bill in bills:
        balance = float(bill.amount) - float(bill.amount_paid)
        due = date.fromisoformat(bill.due_date) if isinstance(bill.due_date, str) else bill.due_date
        days_overdue = (today - due).days
        if days_overdue < 0:
            days_overdue = 0

        detail.append({
            "bill_number": bill.bill_number,
            "vendor_name": bill.vendor_name,
            "vendor_id": bill.vendor_id,
            "bill_date": bill.bill_date,
            "due_date": bill.due_date,
            "amount": float(bill.amount),
            "amount_paid": float(bill.amount_paid),
            "balance": round(balance, 2),
            "days_overdue": days_overdue,
            "terms": bill.terms,
            "flock_id": bill.flock_id,
        })

        key = bill.vendor_id or bill.vendor_name
        if key not in vendor_map:
            vendor_map[key] = {"vendor_name": bill.vendor_name, "vendor_id": bill.vendor_id, "total_balance": 0.0}
        vendor_map[key]["total_balance"] += balance

    # Sort by days_overdue descending
    detail.sort(key=lambda x: x["days_overdue"], reverse=True)

    vendor_totals = [
        {"vendor_name": v["vendor_name"], "vendor_id": v["vendor_id"], "total_balance": round(v["total_balance"], 2)}
        for v in sorted(vendor_map.values(), key=lambda x: x["total_balance"], reverse=True)
    ]

    return {"bills": detail, "vendor_totals": vendor_totals}


# ── Customer Balances ──

async def get_customer_balances(db: AsyncSession):
    """Group all open invoices by buyer and return summary balances."""
    query = (
        select(CustomerInvoice)
        .where(CustomerInvoice.status.in_([
            InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE,
        ]))
    )
    result = await db.execute(query)
    invoices = result.scalars().all()

    groups: dict[str, dict] = {}
    for inv in invoices:
        key = inv.buyer_id or inv.buyer
        if key not in groups:
            groups[key] = {
                "buyer": inv.buyer,
                "buyer_id": inv.buyer_id,
                "total_amount": 0.0,
                "total_paid": 0.0,
                "invoice_count": 0,
                "oldest_invoice_date": inv.invoice_date,
            }
        g = groups[key]
        g["total_amount"] += float(inv.amount)
        g["total_paid"] += float(inv.amount_paid)
        g["invoice_count"] += 1
        if inv.invoice_date < g["oldest_invoice_date"]:
            g["oldest_invoice_date"] = inv.invoice_date

    return [
        {
            "buyer": g["buyer"],
            "buyer_id": g["buyer_id"],
            "total_amount": round(g["total_amount"], 2),
            "total_paid": round(g["total_paid"], 2),
            "balance": round(g["total_amount"] - g["total_paid"], 2),
            "invoice_count": g["invoice_count"],
            "oldest_invoice_date": g["oldest_invoice_date"],
        }
        for g in sorted(groups.values(), key=lambda x: x["total_amount"] - x["total_paid"], reverse=True)
    ]


# ── Vendor Balances ──

async def get_vendor_balances(db: AsyncSession):
    """Group all open bills by vendor and return summary balances."""
    query = (
        select(Bill)
        .where(Bill.status.in_([
            BillStatus.RECEIVED, BillStatus.PARTIAL, BillStatus.OVERDUE,
        ]))
    )
    result = await db.execute(query)
    bills = result.scalars().all()

    groups: dict[str, dict] = {}
    for bill in bills:
        key = bill.vendor_id or bill.vendor_name
        if key not in groups:
            groups[key] = {
                "vendor_name": bill.vendor_name,
                "vendor_id": bill.vendor_id,
                "total_amount": 0.0,
                "total_paid": 0.0,
                "bill_count": 0,
                "oldest_bill_date": bill.bill_date,
            }
        g = groups[key]
        g["total_amount"] += float(bill.amount)
        g["total_paid"] += float(bill.amount_paid)
        g["bill_count"] += 1
        if bill.bill_date < g["oldest_bill_date"]:
            g["oldest_bill_date"] = bill.bill_date

    return [
        {
            "vendor_name": g["vendor_name"],
            "vendor_id": g["vendor_id"],
            "total_amount": round(g["total_amount"], 2),
            "total_paid": round(g["total_paid"], 2),
            "balance": round(g["total_amount"] - g["total_paid"], 2),
            "bill_count": g["bill_count"],
            "oldest_bill_date": g["oldest_bill_date"],
        }
        for g in sorted(groups.values(), key=lambda x: x["total_amount"] - x["total_paid"], reverse=True)
    ]


# ── Flock P&L ──

async def get_flock_pnl(db: AsyncSession, flock_id: str):
    """Generate a full P&L for a single flock."""
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # ── Revenue accounts: journal lines on REVENUE accounts for this flock's entries ──
    rev_query = (
        select(
            Account.account_number,
            Account.name,
            func.coalesce(func.sum(JournalLine.credit), 0).label("total_credit"),
            func.coalesce(func.sum(JournalLine.debit), 0).label("total_debit"),
        )
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(
            JournalEntry.flock_id == flock_id,
            JournalEntry.is_posted == True,
            Account.account_type == AccountType.REVENUE,
        )
        .group_by(Account.id, Account.account_number, Account.name)
        .order_by(Account.account_number)
    )
    rev_result = await db.execute(rev_query)
    rev_rows = rev_result.all()

    revenue_accounts = []
    total_revenue = Decimal("0")
    for row in rev_rows:
        amount = row.total_credit - row.total_debit
        total_revenue += amount
        revenue_accounts.append({
            "account_number": row.account_number,
            "account_name": row.name,
            "amount": round(float(amount), 2),
        })

    # Also include revenue from InvoiceLineItem tied to this flock
    inv_rev_query = (
        select(func.coalesce(func.sum(InvoiceLineItem.amount), 0))
        .join(CustomerInvoice, InvoiceLineItem.invoice_id == CustomerInvoice.id)
        .where(
            InvoiceLineItem.flock_id == flock_id,
            CustomerInvoice.status != InvoiceStatus.CANCELLED,
        )
    )
    inv_rev_result = await db.execute(inv_rev_query)
    invoice_revenue = Decimal(str(inv_rev_result.scalar() or 0))

    # Only add invoice revenue if it exceeds what the journal already captured
    if invoice_revenue > total_revenue:
        diff = invoice_revenue - total_revenue
        revenue_accounts.append({
            "account_number": "",
            "account_name": "Invoice Revenue (unposted)",
            "amount": round(float(diff), 2),
        })
        total_revenue = invoice_revenue

    # ── Expense accounts ──
    exp_query = (
        select(
            Account.account_number,
            Account.name,
            func.coalesce(func.sum(JournalLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalLine.credit), 0).label("total_credit"),
        )
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(
            JournalEntry.flock_id == flock_id,
            JournalEntry.is_posted == True,
            Account.account_type == AccountType.EXPENSE,
        )
        .group_by(Account.id, Account.account_number, Account.name)
        .order_by(Account.account_number)
    )
    exp_result = await db.execute(exp_query)
    exp_rows = exp_result.all()

    expense_accounts = []
    total_expenses = Decimal("0")
    for row in exp_rows:
        amount = row.total_debit - row.total_credit
        total_expenses += amount
        expense_accounts.append({
            "account_number": row.account_number,
            "account_name": row.name,
            "amount": round(float(amount), 2),
        })

    net_income = total_revenue - total_expenses

    # ── Per-bird / per-dozen metrics ──
    birds = flock.initial_bird_count or 0

    prod_result = await db.execute(
        select(func.coalesce(func.sum(ProductionRecord.egg_count), 0))
        .where(ProductionRecord.flock_id == flock_id)
    )
    total_eggs = int(prod_result.scalar() or 0)
    total_dozens = total_eggs / 12 if total_eggs > 0 else 0

    metrics = {
        "per_bird_revenue": round(float(total_revenue) / birds, 2) if birds > 0 else 0,
        "per_bird_expense": round(float(total_expenses) / birds, 2) if birds > 0 else 0,
        "per_bird_net_income": round(float(net_income) / birds, 2) if birds > 0 else 0,
        "per_dozen_revenue": round(float(total_revenue) / total_dozens, 2) if total_dozens > 0 else 0,
        "per_dozen_expense": round(float(total_expenses) / total_dozens, 2) if total_dozens > 0 else 0,
        "per_dozen_net_income": round(float(net_income) / total_dozens, 2) if total_dozens > 0 else 0,
        "total_eggs": total_eggs,
        "total_dozens": round(total_dozens, 1),
        "initial_bird_count": birds,
    }

    return {
        "flock_id": flock_id,
        "flock_number": flock.flock_number,
        "flock_type": flock.flock_type.value if hasattr(flock.flock_type, 'value') else flock.flock_type,
        "status": flock.status.value if hasattr(flock.status, 'value') else flock.status,
        "revenue_accounts": revenue_accounts,
        "expense_accounts": expense_accounts,
        "total_revenue": round(float(total_revenue), 2),
        "total_expenses": round(float(total_expenses), 2),
        "net_income": round(float(net_income), 2),
        "metrics": metrics,
    }


# ── Flock Cost Dashboard ──

async def get_flock_cost_dashboard(db: AsyncSession):
    """For all ACTIVE flocks, return a lightweight cost dashboard."""
    flocks_result = await db.execute(
        select(Flock).where(Flock.status == FlockStatus.ACTIVE).order_by(Flock.flock_number)
    )
    flocks = flocks_result.scalars().all()
    today = date.today()

    dashboard = []
    for flock in flocks:
        # Weeks active
        if flock.arrival_date:
            arrival = date.fromisoformat(flock.arrival_date) if isinstance(flock.arrival_date, str) else flock.arrival_date
            weeks_active = max((today - arrival).days / 7, 0)
        else:
            weeks_active = 0

        # Expected lifecycle in weeks
        if flock.flock_type == FlockType.LAYER:
            expected_lifecycle_weeks = 80
        else:
            expected_lifecycle_weeks = 18  # pullets

        # Total expenses
        exp_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(
                JournalEntry.flock_id == flock.id,
                JournalEntry.is_posted == True,
                Account.account_type == AccountType.EXPENSE,
            )
        )
        total_expenses = float(exp_result.scalar() or 0)

        # Total revenue
        rev_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.credit), 0))
            .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
            .join(Account, JournalLine.account_id == Account.id)
            .where(
                JournalEntry.flock_id == flock.id,
                JournalEntry.is_posted == True,
                Account.account_type == AccountType.REVENUE,
            )
        )
        total_revenue = float(rev_result.scalar() or 0)

        net_profit = total_revenue - total_expenses
        birds = flock.current_bird_count or flock.initial_bird_count or 0
        cost_per_bird = round(total_expenses / birds, 2) if birds > 0 else 0
        cost_per_week = round(total_expenses / weeks_active, 2) if weeks_active > 0 else 0

        # Projected total cost based on burn rate and expected lifecycle
        projected_total_cost = round(cost_per_week * expected_lifecycle_weeks, 2) if cost_per_week > 0 else 0

        # Grower + barn from current placement
        placement_result = await db.execute(
            select(FlockPlacement)
            .where(FlockPlacement.flock_id == flock.id, FlockPlacement.is_current == True)
            .limit(1)
        )
        placement = placement_result.scalars().first()
        grower_name = ""
        barn_name = ""
        if placement:
            barn = await db.get(Barn, placement.barn_id)
            if barn:
                barn_name = barn.name
                grower = await db.get(Grower, barn.grower_id)
                if grower:
                    grower_name = grower.name

        dashboard.append({
            "flock_id": flock.id,
            "flock_number": flock.flock_number,
            "flock_type": flock.flock_type.value if hasattr(flock.flock_type, 'value') else flock.flock_type,
            "grower_name": grower_name,
            "barn_name": barn_name,
            "bird_count": birds,
            "weeks_active": round(weeks_active, 1),
            "total_expenses": round(total_expenses, 2),
            "total_revenue": round(total_revenue, 2),
            "net_profit": round(net_profit, 2),
            "cost_per_bird": cost_per_bird,
            "cost_per_week": cost_per_week,
            "projected_total_cost": projected_total_cost,
            "expected_lifecycle_weeks": expected_lifecycle_weeks,
        })

    return dashboard


# ── Customer Statements ──

async def get_customer_statement(db: AsyncSession, customer_name: str, date_from: str, date_to: str):
    """Generate a statement for a single customer (egg buyer) showing all activity in date range."""
    today = date.today()

    # ── Invoices in date range ──
    inv_query = (
        select(CustomerInvoice)
        .where(
            CustomerInvoice.buyer == customer_name,
            CustomerInvoice.invoice_date >= date_from,
            CustomerInvoice.invoice_date <= date_to,
            CustomerInvoice.status != InvoiceStatus.CANCELLED,
        )
        .order_by(CustomerInvoice.invoice_date)
    )
    inv_result = await db.execute(inv_query)
    invoices = inv_result.scalars().all()

    # ── Customer Payments in date range ──
    pay_query = (
        select(CustomerPayment)
        .where(
            CustomerPayment.customer_name == customer_name,
            CustomerPayment.payment_date >= date_from,
            CustomerPayment.payment_date <= date_to,
        )
        .order_by(CustomerPayment.payment_date)
    )
    pay_result = await db.execute(pay_query)
    payments = pay_result.scalars().all()

    # ── Credit Memos in date range ──
    cm_query = (
        select(CreditMemo)
        .where(
            CreditMemo.buyer == customer_name,
            CreditMemo.memo_date >= date_from,
            CreditMemo.memo_date <= date_to,
            CreditMemo.status != CreditMemoStatus.VOIDED,
        )
        .order_by(CreditMemo.memo_date)
    )
    cm_result = await db.execute(cm_query)
    credit_memos = cm_result.scalars().all()

    # ── Customer Deposits in date range ──
    dep_query = (
        select(CustomerDepositModel)
        .where(
            CustomerDepositModel.customer_name == customer_name,
            CustomerDepositModel.deposit_date >= date_from,
            CustomerDepositModel.deposit_date <= date_to,
        )
        .order_by(CustomerDepositModel.deposit_date)
    )
    dep_result = await db.execute(dep_query)
    deposits = dep_result.scalars().all()

    # ── Beginning balance: all unpaid invoice amounts before date_from ──
    prior_inv_query = (
        select(func.coalesce(func.sum(CustomerInvoice.amount), 0))
        .where(
            CustomerInvoice.buyer == customer_name,
            CustomerInvoice.invoice_date < date_from,
            CustomerInvoice.status != InvoiceStatus.CANCELLED,
        )
    )
    prior_inv_result = await db.execute(prior_inv_query)
    prior_invoiced = float(prior_inv_result.scalar() or 0)

    prior_pay_query = (
        select(func.coalesce(func.sum(CustomerPayment.amount), 0))
        .where(
            CustomerPayment.customer_name == customer_name,
            CustomerPayment.payment_date < date_from,
        )
    )
    prior_pay_result = await db.execute(prior_pay_query)
    prior_paid = float(prior_pay_result.scalar() or 0)

    prior_cm_query = (
        select(func.coalesce(func.sum(CreditMemo.amount), 0))
        .where(
            CreditMemo.buyer == customer_name,
            CreditMemo.memo_date < date_from,
            CreditMemo.status != CreditMemoStatus.VOIDED,
        )
    )
    prior_cm_result = await db.execute(prior_cm_query)
    prior_credits = float(prior_cm_result.scalar() or 0)

    prior_dep_query = (
        select(func.coalesce(func.sum(CustomerDepositModel.amount), 0))
        .where(
            CustomerDepositModel.customer_name == customer_name,
            CustomerDepositModel.deposit_date < date_from,
        )
    )
    prior_dep_result = await db.execute(prior_dep_query)
    prior_deposits = float(prior_dep_result.scalar() or 0)

    beginning_balance = round(prior_invoiced - prior_paid - prior_credits - prior_deposits, 2)

    # ── Build transaction list ──
    transactions = []

    for inv in invoices:
        transactions.append({
            "date": inv.invoice_date,
            "type": "Invoice",
            "number": inv.invoice_number,
            "description": inv.description or f"Invoice {inv.invoice_number}",
            "charges": round(float(inv.amount), 2),
            "payments": 0,
            "sort_key": (inv.invoice_date, 0, inv.invoice_number),
        })

    for pay in payments:
        transactions.append({
            "date": pay.payment_date,
            "type": "Payment",
            "number": pay.reference or "",
            "description": pay.memo or f"Payment received",
            "charges": 0,
            "payments": round(float(pay.amount), 2),
            "sort_key": (pay.payment_date, 1, pay.reference or ""),
        })

    for cm in credit_memos:
        transactions.append({
            "date": cm.memo_date,
            "type": "Credit",
            "number": cm.memo_number,
            "description": cm.reason or f"Credit memo {cm.memo_number}",
            "charges": 0,
            "payments": round(float(cm.amount), 2),
            "sort_key": (cm.memo_date, 2, cm.memo_number),
        })

    for dep in deposits:
        transactions.append({
            "date": dep.deposit_date,
            "type": "Deposit",
            "number": dep.deposit_number,
            "description": dep.memo or f"Customer deposit",
            "charges": 0,
            "payments": round(float(dep.amount), 2),
            "sort_key": (dep.deposit_date, 3, dep.deposit_number),
        })

    # Sort by date, then type order, then number
    transactions.sort(key=lambda t: t["sort_key"])

    # Calculate running balance
    running = beginning_balance
    for txn in transactions:
        running = round(running + txn["charges"] - txn["payments"], 2)
        txn["balance"] = running
        del txn["sort_key"]

    ending_balance = running

    # ── Aging buckets based on all open invoices for this customer ──
    aging = {"current": 0, "over_30": 0, "over_60": 0, "over_90": 0}
    open_inv_query = (
        select(CustomerInvoice)
        .where(
            CustomerInvoice.buyer == customer_name,
            CustomerInvoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]),
        )
    )
    open_inv_result = await db.execute(open_inv_query)
    open_invoices = open_inv_result.scalars().all()

    for inv in open_invoices:
        balance = float(inv.amount) - float(inv.amount_paid)
        if balance <= 0:
            continue
        due = date.fromisoformat(inv.due_date) if isinstance(inv.due_date, str) else inv.due_date
        days_overdue = (today - due).days
        if days_overdue <= 0:
            aging["current"] += balance
        elif days_overdue <= 30:
            aging["over_30"] += balance
        elif days_overdue <= 60:
            aging["over_60"] += balance
        else:
            aging["over_90"] += balance

    aging = {k: round(v, 2) for k, v in aging.items()}

    return {
        "customer_name": customer_name,
        "statement_date": today.isoformat(),
        "date_from": date_from,
        "date_to": date_to,
        "beginning_balance": beginning_balance,
        "transactions": transactions,
        "ending_balance": ending_balance,
        "aging": aging,
    }


async def get_batch_customer_statements(db: AsyncSession, date_from: str, date_to: str):
    """Generate statements for all customers with any activity or open balance."""
    # Find all unique customer names from invoices, payments, credit memos
    inv_buyers_query = select(CustomerInvoice.buyer).distinct()
    inv_result = await db.execute(inv_buyers_query)
    inv_buyers = {r[0] for r in inv_result.all()}

    pay_buyers_query = select(CustomerPayment.customer_name).distinct()
    pay_result = await db.execute(pay_buyers_query)
    pay_buyers = {r[0] for r in pay_result.all()}

    all_customers = sorted(inv_buyers | pay_buyers)

    statements = []
    total_balance = 0.0

    for customer_name in all_customers:
        stmt = await get_customer_statement(db, customer_name, date_from, date_to)
        # Only include if there's a non-zero ending balance or transactions in period
        if stmt["ending_balance"] != 0 or len(stmt["transactions"]) > 0:
            statements.append(stmt)
            total_balance += stmt["ending_balance"]

    return {
        "statements": statements,
        "summary": {
            "total_customers": len(statements),
            "total_balance": round(total_balance, 2),
        },
    }


async def get_customer_statement_print_view(db: AsyncSession, customer_name: str, date_from: str, date_to: str):
    """Return print-ready statement data (same data, flagged for print layout)."""
    stmt = await get_customer_statement(db, customer_name, date_from, date_to)
    stmt["print_view"] = True

    # Look up buyer details for the print header
    buyer_query = select(Buyer).where(Buyer.name == customer_name)
    buyer_result = await db.execute(buyer_query)
    buyer = buyer_result.scalars().first()

    stmt["buyer_details"] = {
        "name": buyer.name if buyer else customer_name,
        "company": buyer.company if buyer else None,
        "contact_name": buyer.contact_name if buyer else None,
        "address": buyer.bill_to_address or (buyer.address if buyer else None),
        "email": buyer.email if buyer else None,
        "phone": buyer.phone if buyer else None,
    }

    return stmt


async def email_batch_statements(db: AsyncSession, date_from: str, date_to: str):
    """Email statements to all customers who have an email on file."""
    from app.services import email_service

    batch = await get_batch_customer_statements(db, date_from, date_to)
    sent = 0
    failed = 0
    skipped = 0
    errors = []

    for stmt in batch["statements"]:
        # Look up buyer email
        buyer_query = select(Buyer).where(Buyer.name == stmt["customer_name"])
        buyer_result = await db.execute(buyer_query)
        buyer = buyer_result.scalars().first()

        if not buyer or not buyer.email:
            skipped += 1
            continue

        # Build email body
        subject = f"Level Valley Farms — Statement for {stmt['customer_name']} ({stmt['date_from']} to {stmt['date_to']})"
        rows_html = ""
        for txn in stmt["transactions"]:
            charges = f"${txn['charges']:,.2f}" if txn['charges'] else ""
            payments = f"${txn['payments']:,.2f}" if txn['payments'] else ""
            rows_html += f"""
            <tr>
                <td style="padding:6px;border-bottom:1px solid #ddd">{txn['date']}</td>
                <td style="padding:6px;border-bottom:1px solid #ddd">{txn['type']}</td>
                <td style="padding:6px;border-bottom:1px solid #ddd">{txn['number']}</td>
                <td style="padding:6px;border-bottom:1px solid #ddd">{txn['description']}</td>
                <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">{charges}</td>
                <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">{payments}</td>
                <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">${txn['balance']:,.2f}</td>
            </tr>"""

        body_html = f"""
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">
            <h2 style="color:#333">Level Valley Farms</h2>
            <h3>Statement of Account</h3>
            <p><strong>{stmt['customer_name']}</strong></p>
            <p>Period: {stmt['date_from']} to {stmt['date_to']}</p>
            <p>Beginning Balance: <strong>${stmt['beginning_balance']:,.2f}</strong></p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <thead>
                    <tr style="background:#f5f5f5">
                        <th style="padding:8px;text-align:left">Date</th>
                        <th style="padding:8px;text-align:left">Type</th>
                        <th style="padding:8px;text-align:left">Number</th>
                        <th style="padding:8px;text-align:left">Description</th>
                        <th style="padding:8px;text-align:right">Charges</th>
                        <th style="padding:8px;text-align:right">Payments</th>
                        <th style="padding:8px;text-align:right">Balance</th>
                    </tr>
                </thead>
                <tbody>{rows_html}</tbody>
            </table>
            <p style="font-size:18px"><strong>Balance Due: ${stmt['ending_balance']:,.2f}</strong></p>
            <hr>
            <p style="font-size:12px;color:#666">
                Aging: Current ${stmt['aging']['current']:,.2f} |
                1-30 Days ${stmt['aging']['over_30']:,.2f} |
                31-60 Days ${stmt['aging']['over_60']:,.2f} |
                Over 60 Days ${stmt['aging']['over_90']:,.2f}
            </p>
        </div>
        """

        try:
            await email_service.send_email(db, buyer.email, subject, body_html)
            sent += 1
        except Exception as e:
            failed += 1
            errors.append({"customer": stmt["customer_name"], "error": str(e)})

    return {
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "errors": errors,
        "total_customers": len(batch["statements"]),
    }


# ── Vendor Statements ──

async def get_vendor_statement(db: AsyncSession, vendor_name: str, date_from: str, date_to: str):
    """Generate a statement for a single vendor showing all AP activity in date range."""
    today = date.today()

    # ── Bills in date range ──
    bill_query = (
        select(Bill)
        .where(
            Bill.vendor_name == vendor_name,
            Bill.bill_date >= date_from,
            Bill.bill_date <= date_to,
            Bill.status != BillStatus.CANCELLED,
        )
        .order_by(Bill.bill_date)
    )
    bill_result = await db.execute(bill_query)
    bills = bill_result.scalars().all()

    # ── Bill Payments in date range ──
    # Get all bills for this vendor first, then payments on those bills
    all_vendor_bills_query = select(Bill.id).where(Bill.vendor_name == vendor_name)
    all_vendor_bills_result = await db.execute(all_vendor_bills_query)
    vendor_bill_ids = [r[0] for r in all_vendor_bills_result.all()]

    bill_payments = []
    if vendor_bill_ids:
        bp_query = (
            select(BillPayment)
            .where(
                BillPayment.bill_id.in_(vendor_bill_ids),
                BillPayment.payment_date >= date_from,
                BillPayment.payment_date <= date_to,
            )
            .order_by(BillPayment.payment_date)
        )
        bp_result = await db.execute(bp_query)
        bill_payments = bp_result.scalars().all()

    # ── Vendor Credits in date range ──
    vc_query = (
        select(VendorCredit)
        .where(
            VendorCredit.vendor_name == vendor_name,
            VendorCredit.credit_date >= date_from,
            VendorCredit.credit_date <= date_to,
            VendorCredit.status != VendorCreditStatus.VOIDED,
        )
        .order_by(VendorCredit.credit_date)
    )
    vc_result = await db.execute(vc_query)
    vendor_credits = vc_result.scalars().all()

    # ── Beginning balance ──
    prior_bills_query = (
        select(func.coalesce(func.sum(Bill.amount), 0))
        .where(
            Bill.vendor_name == vendor_name,
            Bill.bill_date < date_from,
            Bill.status != BillStatus.CANCELLED,
        )
    )
    prior_bills_result = await db.execute(prior_bills_query)
    prior_billed = float(prior_bills_result.scalar() or 0)

    prior_paid = 0.0
    if vendor_bill_ids:
        prior_bp_query = (
            select(func.coalesce(func.sum(BillPayment.amount), 0))
            .where(
                BillPayment.bill_id.in_(vendor_bill_ids),
                BillPayment.payment_date < date_from,
            )
        )
        prior_bp_result = await db.execute(prior_bp_query)
        prior_paid = float(prior_bp_result.scalar() or 0)

    prior_vc_query = (
        select(func.coalesce(func.sum(VendorCredit.amount), 0))
        .where(
            VendorCredit.vendor_name == vendor_name,
            VendorCredit.credit_date < date_from,
            VendorCredit.status != VendorCreditStatus.VOIDED,
        )
    )
    prior_vc_result = await db.execute(prior_vc_query)
    prior_credits = float(prior_vc_result.scalar() or 0)

    beginning_balance = round(prior_billed - prior_paid - prior_credits, 2)

    # ── Build transaction list ──
    transactions = []

    for bill in bills:
        transactions.append({
            "date": bill.bill_date,
            "type": "Bill",
            "number": bill.bill_number,
            "description": bill.description or f"Bill {bill.bill_number}",
            "charges": round(float(bill.amount), 2),
            "payments": 0,
            "sort_key": (bill.bill_date, 0, bill.bill_number),
        })

    for bp in bill_payments:
        # Look up the bill for reference
        bill = await db.get(Bill, bp.bill_id)
        bill_ref = bill.bill_number if bill else ""
        transactions.append({
            "date": bp.payment_date,
            "type": "Payment",
            "number": bp.reference or "",
            "description": bp.notes or f"Payment on bill {bill_ref}",
            "charges": 0,
            "payments": round(float(bp.amount), 2),
            "sort_key": (bp.payment_date, 1, bp.reference or ""),
        })

    for vc in vendor_credits:
        transactions.append({
            "date": vc.credit_date,
            "type": "Credit",
            "number": vc.credit_number,
            "description": vc.description or f"Vendor credit {vc.credit_number}",
            "charges": 0,
            "payments": round(float(vc.amount), 2),
            "sort_key": (vc.credit_date, 2, vc.credit_number),
        })

    transactions.sort(key=lambda t: t["sort_key"])

    # Running balance
    running = beginning_balance
    for txn in transactions:
        running = round(running + txn["charges"] - txn["payments"], 2)
        txn["balance"] = running
        del txn["sort_key"]

    ending_balance = running

    # ── Aging buckets ──
    aging = {"current": 0, "over_30": 0, "over_60": 0, "over_90": 0}
    open_bills_query = (
        select(Bill)
        .where(
            Bill.vendor_name == vendor_name,
            Bill.status.in_([BillStatus.RECEIVED, BillStatus.PARTIAL, BillStatus.OVERDUE]),
        )
    )
    open_bills_result = await db.execute(open_bills_query)
    open_bills = open_bills_result.scalars().all()

    for bill in open_bills:
        balance = float(bill.amount) - float(bill.amount_paid)
        if balance <= 0:
            continue
        due = date.fromisoformat(bill.due_date) if isinstance(bill.due_date, str) else bill.due_date
        days_overdue = (today - due).days
        if days_overdue <= 0:
            aging["current"] += balance
        elif days_overdue <= 30:
            aging["over_30"] += balance
        elif days_overdue <= 60:
            aging["over_60"] += balance
        else:
            aging["over_90"] += balance

    aging = {k: round(v, 2) for k, v in aging.items()}

    return {
        "vendor_name": vendor_name,
        "statement_date": today.isoformat(),
        "date_from": date_from,
        "date_to": date_to,
        "beginning_balance": beginning_balance,
        "transactions": transactions,
        "ending_balance": ending_balance,
        "aging": aging,
    }
