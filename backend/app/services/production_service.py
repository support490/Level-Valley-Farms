from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List

from app.models.flock import Flock, FlockStatus, ProductionRecord
from app.schemas.production import ProductionCreate


async def record_production(db: AsyncSession, data: ProductionCreate):
    flock = await db.get(Flock, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Only allow production on active flocks
    if flock.status in (FlockStatus.SOLD, FlockStatus.CULLED):
        raise ValueError(f"Cannot record production for a flock with status '{flock.status.value}'")

    if data.bird_count <= 0:
        raise ValueError("Bird count must be greater than zero")

    production_pct = round((data.egg_count / data.bird_count * 100), 2)

    record = ProductionRecord(
        flock_id=data.flock_id,
        record_date=data.record_date,
        bird_count=data.bird_count,
        egg_count=data.egg_count,
        production_pct=production_pct,
        cracked=data.cracked,
        floor_eggs=data.floor_eggs,
        notes=data.notes,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return await _record_to_dict(db, record)


async def get_production_records(
    db: AsyncSession,
    flock_id: str = None,
    date_from: str = None,
    date_to: str = None,
):
    query = select(ProductionRecord).order_by(ProductionRecord.record_date.desc())
    if flock_id:
        query = query.where(ProductionRecord.flock_id == flock_id)
    if date_from:
        query = query.where(ProductionRecord.record_date >= date_from)
    if date_to:
        query = query.where(ProductionRecord.record_date <= date_to)

    result = await db.execute(query)
    records = result.scalars().all()

    response = []
    for r in records:
        response.append(await _record_to_dict(db, r))
    return response


async def get_production_chart_data(
    db: AsyncSession,
    flock_ids: List[str],
    date_from: str = None,
    date_to: str = None,
):
    """Returns production data points grouped by flock for charting."""
    result = {}
    for flock_id in flock_ids:
        flock = await db.get(Flock, flock_id)
        if not flock:
            continue

        query = (
            select(ProductionRecord)
            .where(ProductionRecord.flock_id == flock_id)
            .order_by(ProductionRecord.record_date)
        )
        if date_from:
            query = query.where(ProductionRecord.record_date >= date_from)
        if date_to:
            query = query.where(ProductionRecord.record_date <= date_to)

        records = await db.execute(query)
        data_points = []
        for r in records.scalars().all():
            data_points.append({
                "record_date": r.record_date,
                "production_pct": r.production_pct,
                "egg_count": r.egg_count,
                "bird_count": r.bird_count,
            })

        result[flock.flock_number] = data_points

    return result


async def get_production_summary(db: AsyncSession, flock_id: str):
    flock = await db.get(Flock, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    records_result = await db.execute(
        select(ProductionRecord)
        .where(ProductionRecord.flock_id == flock_id)
        .order_by(ProductionRecord.record_date)
    )
    records = records_result.scalars().all()

    if not records:
        return {
            "flock_id": flock_id,
            "flock_number": flock.flock_number,
            "avg_production_pct": 0,
            "peak_production_pct": 0,
            "current_production_pct": 0,
            "total_eggs": 0,
            "total_days": 0,
            "total_cracked": 0,
            "total_floor_eggs": 0,
        }

    total_eggs = sum(r.egg_count for r in records)
    total_cracked = sum(r.cracked for r in records)
    total_floor = sum(r.floor_eggs for r in records)
    pcts = [r.production_pct for r in records]

    return {
        "flock_id": flock_id,
        "flock_number": flock.flock_number,
        "avg_production_pct": round(sum(pcts) / len(pcts), 2),
        "peak_production_pct": round(max(pcts), 2),
        "current_production_pct": round(pcts[-1], 2),
        "total_eggs": total_eggs,
        "total_days": len(records),
        "total_cracked": total_cracked,
        "total_floor_eggs": total_floor,
    }


async def _record_to_dict(db: AsyncSession, record: ProductionRecord) -> dict:
    flock = await db.get(Flock, record.flock_id)
    return {
        "id": record.id,
        "flock_id": record.flock_id,
        "flock_number": flock.flock_number if flock else "",
        "record_date": record.record_date,
        "bird_count": record.bird_count,
        "egg_count": record.egg_count,
        "production_pct": record.production_pct,
        "cracked": record.cracked,
        "floor_eggs": record.floor_eggs,
        "notes": record.notes,
        "created_at": record.created_at,
    }
