from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.db.database import get_db
from app.models.farm import Grower, Barn, FlockPlacement
from app.models.flock import Flock, FlockStatus, MortalityRecord, ProductionRecord
from app.models.accounting import JournalEntry, JournalLine, Account, AccountType
from app.models.inventory import EggInventory, EggSale

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    # Active flocks
    flock_result = await db.execute(
        select(func.count(Flock.id)).where(Flock.status == FlockStatus.ACTIVE)
    )
    active_flocks = flock_result.scalar() or 0

    # Total birds
    bird_result = await db.execute(
        select(func.coalesce(func.sum(Flock.current_bird_count), 0))
        .where(Flock.status == FlockStatus.ACTIVE)
    )
    total_birds = int(bird_result.scalar() or 0)

    # Average production % (last 7 days)
    prod_result = await db.execute(
        select(func.avg(ProductionRecord.production_pct))
        .order_by(ProductionRecord.record_date.desc())
        .limit(50)
    )
    avg_production = round(float(prod_result.scalar() or 0), 1)

    # Egg inventory (total cases on hand)
    # Get the latest record per flock+grade combo
    inv_result = await db.execute(
        select(
            EggInventory.flock_id,
            EggInventory.grade,
            func.max(EggInventory.created_at).label("latest"),
        )
        .group_by(EggInventory.flock_id, EggInventory.grade)
    )
    groups = inv_result.all()
    total_skids = 0
    for flock_id, grade, latest in groups:
        latest_record = await db.execute(
            select(EggInventory.skids_on_hand)
            .where(
                EggInventory.flock_id == flock_id,
                EggInventory.grade == grade,
                EggInventory.created_at == latest,
            )
        )
        on_hand = latest_record.scalar() or 0
        total_skids += on_hand

    # Active growers
    grower_result = await db.execute(
        select(func.count(Grower.id)).where(Grower.is_active == True)
    )
    active_growers = grower_result.scalar() or 0

    # Active barns
    barn_result = await db.execute(
        select(func.count(Barn.id)).where(Barn.is_active == True)
    )
    active_barns = barn_result.scalar() or 0

    # Total barn capacity
    cap_result = await db.execute(
        select(func.coalesce(func.sum(Barn.bird_capacity), 0)).where(Barn.is_active == True)
    )
    total_capacity = int(cap_result.scalar() or 0)

    # Revenue this month (posted egg sales)
    sales_result = await db.execute(
        select(func.coalesce(func.sum(EggSale.total_amount), 0))
    )
    total_revenue = float(sales_result.scalar() or 0)

    # Expenses this month (posted)
    expense_result = await db.execute(
        select(func.coalesce(func.sum(JournalLine.debit), 0))
        .join(JournalEntry, JournalLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(
            JournalEntry.is_posted == True,
            Account.account_type == AccountType.EXPENSE,
        )
    )
    total_expenses = float(expense_result.scalar() or 0)

    # Total mortality
    mort_result = await db.execute(
        select(
            func.coalesce(func.sum(MortalityRecord.deaths), 0),
            func.coalesce(func.sum(MortalityRecord.culls), 0),
        )
    )
    mort_row = mort_result.one()
    total_deaths = int(mort_row[0])
    total_culls = int(mort_row[1])

    return {
        "active_flocks": active_flocks,
        "total_birds": total_birds,
        "avg_production_pct": avg_production,
        "total_egg_skids": total_skids,
        "active_growers": active_growers,
        "active_barns": active_barns,
        "total_capacity": total_capacity,
        "total_revenue": round(total_revenue, 2),
        "total_expenses": round(total_expenses, 2),
        "net_income": round(total_revenue - total_expenses, 2),
        "total_deaths": total_deaths,
        "total_culls": total_culls,
    }


@router.get("/recent-activity")
async def recent_activity(db: AsyncSession = Depends(get_db)):
    """Recent journal entries, production records, mortality."""
    activities = []

    # Recent journal entries
    je_result = await db.execute(
        select(JournalEntry)
        .order_by(JournalEntry.created_at.desc())
        .limit(5)
    )
    for je in je_result.scalars().all():
        flock = await db.get(Flock, je.flock_id) if je.flock_id else None
        # Get total
        line_result = await db.execute(
            select(func.coalesce(func.sum(JournalLine.debit), 0))
            .where(JournalLine.journal_entry_id == je.id)
        )
        total = float(line_result.scalar() or 0)
        activities.append({
            "type": "journal",
            "date": je.entry_date,
            "description": je.description,
            "detail": f"${total:,.2f}",
            "flock_number": flock.flock_number if flock else None,
            "status": "posted" if je.is_posted else "draft",
        })

    # Recent mortality
    mort_result = await db.execute(
        select(MortalityRecord)
        .order_by(MortalityRecord.created_at.desc())
        .limit(3)
    )
    for m in mort_result.scalars().all():
        flock = await db.get(Flock, m.flock_id)
        activities.append({
            "type": "mortality",
            "date": m.record_date,
            "description": f"{m.deaths} deaths, {m.culls} culls",
            "detail": m.cause or "",
            "flock_number": flock.flock_number if flock else None,
            "status": "recorded",
        })

    # Sort by date desc
    activities.sort(key=lambda x: x["date"], reverse=True)
    return activities[:10]


@router.get("/alerts")
async def dashboard_alerts(db: AsyncSession = Depends(get_db)):
    """Check for anomalies and generate alerts."""
    alerts = []

    # Barns at high capacity
    barn_result = await db.execute(
        select(Barn).where(Barn.is_active == True)
    )
    for barn in barn_result.scalars().all():
        if barn.bird_capacity > 0:
            util = barn.current_bird_count / barn.bird_capacity * 100
            if util > 95:
                grower = await db.get(Grower, barn.grower_id)
                alerts.append({
                    "type": "warning",
                    "title": "High Capacity",
                    "message": f"{barn.name} ({grower.name if grower else ''}) at {util:.0f}% capacity",
                })

    # Low production flocks (latest record < 60%)
    active_flocks = await db.execute(
        select(Flock).where(Flock.status == FlockStatus.ACTIVE)
    )
    for flock in active_flocks.scalars().all():
        latest_prod = await db.execute(
            select(ProductionRecord)
            .where(ProductionRecord.flock_id == flock.id)
            .order_by(ProductionRecord.record_date.desc())
            .limit(1)
        )
        record = latest_prod.scalars().first()
        if record and record.production_pct < 60:
            alerts.append({
                "type": "danger",
                "title": "Low Production",
                "message": f"Flock {flock.flock_number} at {record.production_pct:.1f}%",
            })

    # Unposted journal entries
    unposted_result = await db.execute(
        select(func.count(JournalEntry.id)).where(JournalEntry.is_posted == False)
    )
    unposted = unposted_result.scalar() or 0
    if unposted > 0:
        alerts.append({
            "type": "info",
            "title": "Unposted Entries",
            "message": f"{unposted} journal {'entries' if unposted > 1 else 'entry'} awaiting posting",
        })

    return alerts


@router.get("/search")
async def global_search(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    """Search across growers, barns, flocks, and journal entries."""
    results = []
    term = f"%{q}%"

    # Growers
    grower_result = await db.execute(
        select(Grower).where(
            Grower.is_active == True,
            (Grower.name.ilike(term) | Grower.location.ilike(term))
        ).limit(5)
    )
    for g in grower_result.scalars().all():
        results.append({"type": "grower", "id": g.id, "title": g.name, "subtitle": g.location, "url": "/growers"})

    # Barns
    barn_result = await db.execute(
        select(Barn).where(Barn.is_active == True, Barn.name.ilike(term)).limit(5)
    )
    for b in barn_result.scalars().all():
        grower = await db.get(Grower, b.grower_id)
        results.append({"type": "barn", "id": b.id, "title": b.name, "subtitle": f"{grower.name if grower else ''} — {b.barn_type}", "url": "/barns"})

    # Flocks
    flock_result = await db.execute(
        select(Flock).where(
            Flock.flock_number.ilike(term) | Flock.breed.ilike(term)
        ).limit(5)
    )
    for f in flock_result.scalars().all():
        results.append({"type": "flock", "id": f.id, "title": f.flock_number, "subtitle": f"{f.breed or ''} — {f.current_bird_count} birds", "url": "/flocks"})

    # Journal entries
    je_result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.description.ilike(term) |
            JournalEntry.entry_number.ilike(term) |
            JournalEntry.reference.ilike(term)
        ).limit(5)
    )
    for je in je_result.scalars().all():
        results.append({"type": "transaction", "id": je.id, "title": je.entry_number, "subtitle": je.description, "url": "/accounting"})

    return results
