from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from typing import Optional

from app.models.inventory import EggInventory, EggSale, EggGrade
from app.models.flock import Flock, FlockStatus, ProductionRecord
from app.models.farm import Barn, FlockPlacement, Grower, BarnType
from app.models.accounting import Account, JournalEntry, JournalLine, AccountType
from app.models.contracts import EggContract, ContractFlockAssignment
from app.models.logistics import PickupJob, PickupItem, PickupStatus
from app.schemas.inventory import EggInventoryCreate, EggSaleCreate, EggGradeCreate
from datetime import date as date_type, datetime
from app.services.accounting_service import _next_entry_number


# ── Egg Grades ──

DEFAULT_GRADES = [
    ("grade_a_large", "Grade A Large", 0),
    ("grade_a_medium", "Grade A Medium", 1),
    ("grade_a_small", "Grade A Small", 2),
    ("grade_b", "Grade B", 3),
    ("cracked", "Cracked", 4),
    ("reject", "Reject", 5),
]


async def seed_egg_grades(db: AsyncSession):
    """Seed default egg grades if none exist."""
    result = await db.execute(select(func.count(EggGrade.id)))
    if result.scalar() > 0:
        return False
    for value, label, order in DEFAULT_GRADES:
        db.add(EggGrade(value=value, label=label, sort_order=order))
    await db.commit()
    return True


async def get_egg_grades(db: AsyncSession, include_inactive: bool = False):
    query = select(EggGrade).order_by(EggGrade.sort_order)
    if not include_inactive:
        query = query.where(EggGrade.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


async def create_egg_grade(db: AsyncSession, data: EggGradeCreate):
    existing = await db.execute(
        select(EggGrade).where(EggGrade.value == data.value)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Grade '{data.value}' already exists")

    # Auto-set sort_order if not specified
    if data.sort_order == 0:
        max_order = await db.execute(select(func.max(EggGrade.sort_order)))
        data.sort_order = (max_order.scalar() or 0) + 1

    grade = EggGrade(**data.model_dump())
    db.add(grade)
    await db.commit()
    await db.refresh(grade)
    return grade


async def delete_egg_grade(db: AsyncSession, grade_id: str):
    grade = await db.get(EggGrade, grade_id)
    if not grade:
        return False
    # Check if grade is in use
    in_use = await db.execute(
        select(func.count(EggInventory.id)).where(EggInventory.grade == grade.value)
    )
    if in_use.scalar() > 0:
        # Soft delete if in use
        grade.is_active = False
        await db.commit()
        return True

    await db.delete(grade)
    await db.commit()
    return True


async def _get_grade_label(db: AsyncSession, grade_value: str) -> str:
    result = await db.execute(
        select(EggGrade.label).where(EggGrade.value == grade_value)
    )
    label = result.scalar_one_or_none()
    return label or grade_value.replace("_", " ").title()


# ── Inventory ──

async def add_inventory(db: AsyncSession, data: EggInventoryCreate):
    flock = await db.get(Flock, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Calculate running skids on hand for this flock+grade
    current_on_hand = await _get_on_hand(db, data.flock_id, data.grade)
    new_on_hand = current_on_hand + data.skids_in - data.skids_out

    if new_on_hand < 0:
        raise ValueError(f"Cannot remove {data.skids_out} skids — only {current_on_hand + data.skids_in} available")

    record = EggInventory(
        flock_id=data.flock_id,
        record_date=data.record_date,
        grade=data.grade,
        skids_in=data.skids_in,
        skids_out=data.skids_out,
        skids_on_hand=new_on_hand,
        dozens_per_skid=data.dozens_per_skid,
        notes=data.notes,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return await _inventory_to_dict(db, record)


async def get_inventory_records(
    db: AsyncSession,
    flock_id: str = None,
    grade: str = None,
    date_from: str = None,
    date_to: str = None,
):
    query = select(EggInventory).order_by(EggInventory.record_date.desc())
    if flock_id:
        query = query.where(EggInventory.flock_id == flock_id)
    if grade:
        query = query.where(EggInventory.grade == grade)
    if date_from:
        query = query.where(EggInventory.record_date >= date_from)
    if date_to:
        query = query.where(EggInventory.record_date <= date_to)

    result = await db.execute(query)
    records = result.scalars().all()
    return [await _inventory_to_dict(db, r) for r in records]


async def get_inventory_summary(db: AsyncSession):
    """Current inventory on hand by grade across all flocks."""
    # Get all active grades
    grades_result = await db.execute(
        select(EggGrade).where(EggGrade.is_active == True).order_by(EggGrade.sort_order)
    )
    grades = grades_result.scalars().all()
    grade_values = [g.value for g in grades]
    grade_labels = {g.value: g.label for g in grades}

    # Also check for any grades in inventory not in the grade table
    inv_grades_result = await db.execute(
        select(EggInventory.grade).distinct()
    )
    for row in inv_grades_result.all():
        if row[0] not in grade_values:
            grade_values.append(row[0])

    summary = []
    for grade in grade_values:
        # Get the latest skids_on_hand for each flock
        flock_query = select(EggInventory.flock_id).where(
            EggInventory.grade == grade
        ).distinct()
        flock_result = await db.execute(flock_query)
        flock_ids = [r[0] for r in flock_result.all()]

        total_on_hand = 0
        dozens_per_skid = 900  # default
        for fid in flock_ids:
            on_hand = await _get_on_hand(db, fid, grade)
            total_on_hand += on_hand
            # Get the dozens_per_skid from the latest record
            dps_result = await db.execute(
                select(EggInventory.dozens_per_skid)
                .where(EggInventory.flock_id == fid, EggInventory.grade == grade)
                .order_by(EggInventory.record_date.desc(), EggInventory.created_at.desc())
                .limit(1)
            )
            dps = dps_result.scalar_one_or_none()
            if dps:
                dozens_per_skid = dps

        if total_on_hand > 0:
            summary.append({
                "grade": grade,
                "grade_label": grade_labels.get(grade, grade.replace("_", " ").title()),
                "total_skids_on_hand": total_on_hand,
                "total_dozens": total_on_hand * dozens_per_skid,
            })

    return summary


async def record_sale(db: AsyncSession, data: EggSaleCreate):
    flock = await db.get(Flock, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    dozens_per_skid_value = 900
    total_amount = Decimal(str(data.skids_sold)) * Decimal(str(dozens_per_skid_value)) * Decimal(str(data.price_per_dozen))
    total_amount = round(total_amount, 2)

    # Check inventory first before creating journal entry
    current_on_hand = await _get_on_hand(db, data.flock_id, data.grade)
    if data.skids_sold > current_on_hand:
        raise ValueError(f"Only {current_on_hand} skids of {data.grade} on hand for this flock")

    # Create journal entry for the sale (DR Accounts Receivable, CR Egg Sales)
    ar_account = await _find_account_by_number(db, "1020")
    sales_account = await _find_account_by_number(db, "4010")

    journal_entry_id = None
    if ar_account and sales_account:
        entry_number = await _next_entry_number(db)
        grade_label = await _get_grade_label(db, data.grade)
        je = JournalEntry(
            entry_number=entry_number,
            entry_date=data.sale_date,
            description=f"Egg sale to {data.buyer} — {data.skids_sold} skids ({data.skids_sold * dozens_per_skid_value} dozen) {grade_label}",
            flock_id=data.flock_id,
        )
        db.add(je)
        await db.flush()

        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=ar_account.id,
            debit=total_amount,
            credit=Decimal("0"),
        ))
        db.add(JournalLine(
            journal_entry_id=je.id,
            account_id=sales_account.id,
            debit=Decimal("0"),
            credit=total_amount,
        ))
        journal_entry_id = je.id

    # Reduce inventory
    inv_record = EggInventory(
        flock_id=data.flock_id,
        record_date=data.sale_date,
        grade=data.grade,
        skids_in=0,
        skids_out=data.skids_sold,
        skids_on_hand=current_on_hand - data.skids_sold,
        notes=f"Sale to {data.buyer}",
    )
    db.add(inv_record)

    sale = EggSale(
        flock_id=data.flock_id,
        sale_date=data.sale_date,
        buyer=data.buyer,
        grade=data.grade,
        skids_sold=data.skids_sold,
        price_per_dozen=Decimal(str(data.price_per_dozen)),
        total_amount=total_amount,
        journal_entry_id=journal_entry_id,
        notes=data.notes,
    )
    db.add(sale)
    await db.commit()
    await db.refresh(sale)
    return await _sale_to_dict(db, sale)


async def get_sales(
    db: AsyncSession,
    flock_id: str = None,
    date_from: str = None,
    date_to: str = None,
):
    query = select(EggSale).order_by(EggSale.sale_date.desc())
    if flock_id:
        query = query.where(EggSale.flock_id == flock_id)
    if date_from:
        query = query.where(EggSale.sale_date >= date_from)
    if date_to:
        query = query.where(EggSale.sale_date <= date_to)

    result = await db.execute(query)
    sales = result.scalars().all()
    return [await _sale_to_dict(db, s) for s in sales]


# ── Inventory by Flock ──

async def get_inventory_by_flock(db: AsyncSession):
    """Get current inventory grouped by flock with barn location."""
    # Get all flock IDs that have inventory
    flock_ids_result = await db.execute(
        select(EggInventory.flock_id).distinct()
    )
    flock_ids = [r[0] for r in flock_ids_result.all()]

    result = []
    for flock_id in flock_ids:
        flock = await db.get(Flock, flock_id)
        if not flock:
            continue

        # Get current barn
        placement_result = await db.execute(
            select(FlockPlacement)
            .where(FlockPlacement.flock_id == flock_id, FlockPlacement.is_current == True)
            .limit(1)
        )
        placement = placement_result.scalars().first()
        barn_name = ""
        grower_name = ""
        if placement:
            barn = await db.get(Barn, placement.barn_id)
            if barn:
                barn_name = barn.name
                grower = await db.get(Grower, barn.grower_id)
                grower_name = grower.name if grower else ""

        # Get inventory by grade for this flock
        grades_result = await db.execute(
            select(EggInventory.grade).where(EggInventory.flock_id == flock_id).distinct()
        )
        grades = []
        total_skids = 0
        for row in grades_result.all():
            grade_val = row[0]
            on_hand = await _get_on_hand(db, flock_id, grade_val)
            if on_hand > 0:
                grade_label = await _get_grade_label(db, grade_val)
                grades.append({
                    "grade": grade_val,
                    "grade_label": grade_label,
                    "skids_on_hand": on_hand,
                })
                total_skids += on_hand

        if total_skids > 0:
            result.append({
                "flock_id": flock_id,
                "flock_number": flock.flock_number,
                "flock_status": flock.status.value,
                "barn_name": barn_name,
                "grower_name": grower_name,
                "total_skids": total_skids,
                "grades": grades,
            })

    return result


async def get_inventory_aging(db: AsyncSession, max_age_days: int = 7):
    """Find inventory records older than max_age_days."""
    today = date_type.today()
    aging_items = []

    # Get all flock+grade combos with inventory on hand
    flock_ids_result = await db.execute(
        select(EggInventory.flock_id, EggInventory.grade).distinct()
    )
    for flock_id, grade in flock_ids_result.all():
        on_hand = await _get_on_hand(db, flock_id, grade)
        if on_hand <= 0:
            continue

        # Get oldest unreceived inventory date
        oldest_result = await db.execute(
            select(EggInventory.record_date)
            .where(
                EggInventory.flock_id == flock_id,
                EggInventory.grade == grade,
                EggInventory.skids_in > 0,
            )
            .order_by(EggInventory.record_date.asc())
            .limit(1)
        )
        oldest_date_str = oldest_result.scalar_one_or_none()
        if not oldest_date_str:
            continue

        try:
            oldest_date = date_type.fromisoformat(oldest_date_str)
            age_days = (today - oldest_date).days
        except (ValueError, TypeError):
            continue

        if age_days >= max_age_days:
            flock = await db.get(Flock, flock_id)
            grade_label = await _get_grade_label(db, grade)
            aging_items.append({
                "flock_id": flock_id,
                "flock_number": flock.flock_number if flock else "",
                "grade": grade,
                "grade_label": grade_label,
                "skids_on_hand": on_hand,
                "oldest_date": oldest_date_str,
                "age_days": age_days,
            })

    aging_items.sort(key=lambda x: x["age_days"], reverse=True)
    return aging_items


async def get_inventory_value(db: AsyncSession):
    """Calculate inventory value using current contract prices."""
    summary = await get_inventory_summary(db)

    # Get active contracts with prices by grade
    contracts_result = await db.execute(
        select(EggContract).where(EggContract.is_active == True)
    )
    contracts = contracts_result.scalars().all()

    # Build price map by grade (use highest contract price)
    grade_prices = {}
    for c in contracts:
        if c.price_per_dozen and c.grade:
            current = grade_prices.get(c.grade, Decimal("0"))
            if c.price_per_dozen > current:
                grade_prices[c.grade] = c.price_per_dozen

    total_value = Decimal("0")
    items = []
    for s in summary:
        price = grade_prices.get(s["grade"])
        value = Decimal(str(s["total_dozens"])) * price if price else None
        items.append({
            **s,
            "price_per_dozen": float(price) if price else None,
            "estimated_value": float(value) if value else None,
        })
        if value:
            total_value += value

    return {
        "items": items,
        "total_estimated_value": float(total_value),
    }


async def get_inventory_alerts(db: AsyncSession):
    """Generate low stock and aging alerts."""
    alerts = []

    # Low stock: any grade with < 5 skids total
    summary = await get_inventory_summary(db)
    for s in summary:
        if s["total_skids_on_hand"] < 5:
            alerts.append({
                "type": "low_stock",
                "severity": "warning",
                "grade": s["grade"],
                "grade_label": s["grade_label"],
                "message": f"{s['grade_label']}: only {s['total_skids_on_hand']} skids on hand",
                "value": s["total_skids_on_hand"],
            })

    # Aging: eggs sitting > 10 days
    aging = await get_inventory_aging(db, 10)
    for a in aging:
        alerts.append({
            "type": "aging",
            "severity": "danger" if a["age_days"] > 14 else "warning",
            "grade": a["grade"],
            "grade_label": a["grade_label"],
            "message": f"{a['flock_number']} {a['grade_label']}: {a['skids_on_hand']} skids sitting {a['age_days']} days",
            "value": a["age_days"],
        })

    return alerts


# ── Barn Inventory (computed) ──

EGGS_PER_SKID = 10800  # 900 dozen * 12


async def get_barn_inventory(db: AsyncSession):
    """Compute barn-level inventory from production records minus completed pickups.

    Barn inventory = net eggs from production / EGGS_PER_SKID - completed pickup skids.
    Only includes layer barns with current placements.
    """
    # Query 1: Production totals per barn+flock
    # Join flock_placements (current) → barns (layer) → growers → production_records
    placements_result = await db.execute(
        select(FlockPlacement).where(FlockPlacement.is_current == True)
    )
    placements = placements_result.scalars().all()

    barn_data = {}
    for placement in placements:
        barn = await db.get(Barn, placement.barn_id)
        if not barn or barn.barn_type != BarnType.LAYER:
            continue

        flock = await db.get(Flock, placement.flock_id)
        if not flock:
            continue

        grower = await db.get(Grower, barn.grower_id)

        # Sum production for this flock
        prod_result = await db.execute(
            select(
                func.coalesce(func.sum(ProductionRecord.egg_count), 0),
                func.coalesce(func.sum(ProductionRecord.cracked), 0),
                func.coalesce(func.sum(ProductionRecord.floor_eggs), 0),
            ).where(ProductionRecord.flock_id == flock.id)
        )
        row = prod_result.one()
        total_eggs = int(row[0])
        total_cracked = int(row[1])
        total_floor = int(row[2])
        net_eggs = total_eggs - total_cracked - total_floor

        # Query 2: Completed pickup skids for this barn+flock
        pickup_result = await db.execute(
            select(func.coalesce(func.sum(PickupItem.skids_actual), 0)).where(
                PickupItem.barn_id == barn.id,
                PickupItem.flock_id == flock.id,
                PickupItem.pickup_job_id.in_(
                    select(PickupJob.id).where(PickupJob.status == PickupStatus.COMPLETED)
                ),
            )
        )
        picked_skids = int(pickup_result.scalar())

        estimated_skids = round(net_eggs / EGGS_PER_SKID) if net_eggs > 0 else 0
        available_skids = max(0, estimated_skids - picked_skids)

        if available_skids <= 0:
            continue

        barn_key = barn.id
        if barn_key not in barn_data:
            barn_data[barn_key] = {
                "barn_id": barn.id,
                "barn_name": barn.name,
                "grower_id": grower.id if grower else None,
                "grower_name": grower.name if grower else "Unknown",
                "flocks": [],
                "total_estimated_skids": 0,
            }

        barn_data[barn_key]["flocks"].append({
            "flock_id": flock.id,
            "flock_number": flock.flock_number,
            "estimated_skids": available_skids,
        })
        barn_data[barn_key]["total_estimated_skids"] += available_skids

    return list(barn_data.values())


# ── Helpers ──

async def _get_on_hand(db: AsyncSession, flock_id: str, grade: str) -> int:
    """Get current skids on hand for a flock+grade from the latest record."""
    result = await db.execute(
        select(EggInventory.skids_on_hand)
        .where(EggInventory.flock_id == flock_id, EggInventory.grade == grade)
        .order_by(EggInventory.record_date.desc(), EggInventory.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row if row is not None else 0


async def _find_account_by_number(db: AsyncSession, account_number: str):
    result = await db.execute(
        select(Account).where(Account.account_number == account_number)
    )
    return result.scalar_one_or_none()


async def _inventory_to_dict(db: AsyncSession, record: EggInventory) -> dict:
    flock = await db.get(Flock, record.flock_id)
    grade_label = await _get_grade_label(db, record.grade)
    return {
        "id": record.id,
        "flock_id": record.flock_id,
        "flock_number": flock.flock_number if flock else "",
        "record_date": record.record_date,
        "grade": record.grade,
        "grade_label": grade_label,
        "skids_in": record.skids_in,
        "skids_out": record.skids_out,
        "skids_on_hand": record.skids_on_hand,
        "dozens_per_skid": record.dozens_per_skid,
        "dozens_on_hand": record.skids_on_hand * record.dozens_per_skid,
        "notes": record.notes,
        "created_at": record.created_at,
    }


async def _sale_to_dict(db: AsyncSession, sale: EggSale) -> dict:
    flock = await db.get(Flock, sale.flock_id)
    grade_label = await _get_grade_label(db, sale.grade)
    return {
        "id": sale.id,
        "flock_id": sale.flock_id,
        "flock_number": flock.flock_number if flock else "",
        "sale_date": sale.sale_date,
        "buyer": sale.buyer,
        "grade": sale.grade,
        "grade_label": grade_label,
        "skids_sold": sale.skids_sold,
        "price_per_dozen": float(sale.price_per_dozen),
        "total_amount": float(sale.total_amount),
        "journal_entry_id": sale.journal_entry_id,
        "notes": sale.notes,
        "created_at": sale.created_at,
    }
