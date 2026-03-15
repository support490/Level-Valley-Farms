from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List

from app.models.flock import Flock, FlockStatus, FlockType, ProductionRecord
from app.models.flock import MortalityRecord
from app.schemas.production import ProductionCreate, BulkProductionCreate


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


async def record_bulk_production(db: AsyncSession, data: BulkProductionCreate):
    """Record production for multiple flocks at once (bi-weekly entry)."""
    results = []
    errors = []

    for entry in data.entries:
        flock = await db.get(Flock, entry.flock_id)
        if not flock:
            errors.append(f"Flock {entry.flock_id} not found")
            continue
        if flock.status in (FlockStatus.SOLD, FlockStatus.CULLED):
            errors.append(f"Flock {flock.flock_number} has status '{flock.status.value}'")
            continue
        if entry.bird_count <= 0:
            errors.append(f"Flock {flock.flock_number}: bird count must be > 0")
            continue

        production_pct = round((entry.egg_count / entry.bird_count * 100), 2)
        record = ProductionRecord(
            flock_id=entry.flock_id,
            record_date=data.record_date,
            bird_count=entry.bird_count,
            egg_count=entry.egg_count,
            production_pct=production_pct,
            cracked=entry.cracked,
            floor_eggs=entry.floor_eggs,
            notes=entry.notes,
        )
        db.add(record)
        results.append({
            "flock_number": flock.flock_number,
            "production_pct": production_pct,
            "egg_count": entry.egg_count,
        })

    await db.commit()
    return {"recorded": results, "errors": errors}


# ── Breed Standard Curves ──
# Production % by week of age for common breeds
BREED_CURVES = {
    "Lohmann Brown": {
        18: 5, 19: 20, 20: 50, 21: 75, 22: 88, 23: 92, 24: 94, 25: 95.5,
        26: 96, 27: 96, 28: 95.5, 29: 95, 30: 94.5, 31: 94, 32: 93.5,
        33: 93, 34: 92.5, 35: 92, 36: 91.5, 37: 91, 38: 90.5, 39: 90,
        40: 89.5, 42: 89, 44: 88, 46: 87, 48: 86, 50: 85, 52: 84,
        54: 83, 56: 82, 58: 81, 60: 80, 62: 79, 64: 78, 66: 77,
        68: 76, 70: 75, 72: 73, 74: 71, 76: 69, 78: 67, 80: 65,
    },
    "Hy-Line W-36": {
        18: 5, 19: 15, 20: 45, 21: 70, 22: 85, 23: 90, 24: 93, 25: 95,
        26: 95.5, 27: 96, 28: 96, 29: 95.5, 30: 95, 31: 94.5, 32: 94,
        33: 93.5, 34: 93, 35: 92.5, 36: 92, 37: 91.5, 38: 91, 39: 90.5,
        40: 90, 42: 89, 44: 88.5, 46: 88, 48: 87, 50: 86, 52: 85.5,
        54: 85, 56: 84, 58: 83, 60: 82, 62: 81, 64: 80, 66: 79,
        68: 78, 70: 77, 72: 76, 74: 75, 76: 74, 78: 73, 80: 72,
    },
    "Lohmann LSL-Classic": {
        18: 5, 19: 18, 20: 48, 21: 72, 22: 87, 23: 91, 24: 93.5, 25: 95,
        26: 95.5, 27: 96, 28: 96, 29: 95.5, 30: 95, 31: 94.5, 32: 94,
        33: 93.5, 34: 93, 35: 92.5, 36: 92, 37: 91.5, 38: 91, 39: 90,
        40: 89.5, 42: 89, 44: 88, 46: 87, 48: 86.5, 50: 86, 52: 85,
        54: 84, 56: 83, 58: 82, 60: 81, 62: 80, 64: 79, 66: 78,
        68: 77, 70: 76, 72: 74, 74: 72, 76: 70, 78: 68, 80: 66,
    },
}


def get_breed_curve(breed: str) -> dict:
    """Get the breed standard curve. Returns dict of week -> expected production %."""
    if not breed:
        return {}
    # Try exact match first, then partial match
    if breed in BREED_CURVES:
        return BREED_CURVES[breed]
    for key in BREED_CURVES:
        if key.lower() in breed.lower() or breed.lower() in key.lower():
            return BREED_CURVES[key]
    return {}


def get_available_breeds() -> list:
    return list(BREED_CURVES.keys())


async def get_production_alerts(db: AsyncSession):
    """Detect production anomalies across all active layer flocks."""
    alerts = []

    result = await db.execute(
        select(Flock).where(
            Flock.status.in_([FlockStatus.ACTIVE, FlockStatus.CLOSING]),
            Flock.flock_type == FlockType.LAYER,
        )
    )
    flocks = result.scalars().all()

    for flock in flocks:
        records_result = await db.execute(
            select(ProductionRecord)
            .where(ProductionRecord.flock_id == flock.id)
            .order_by(ProductionRecord.record_date.desc())
            .limit(10)
        )
        records = records_result.scalars().all()
        if len(records) < 2:
            continue

        current = records[0]
        previous = records[1]

        # Week-over-week production drop > 5%
        drop = previous.production_pct - current.production_pct
        if drop > 5:
            alerts.append({
                "flock_id": flock.id,
                "flock_number": flock.flock_number,
                "alert_type": "production_drop",
                "severity": "danger" if drop > 10 else "warning",
                "message": f"Production dropped {drop:.1f}% ({previous.production_pct:.1f}% → {current.production_pct:.1f}%)",
                "current_value": current.production_pct,
                "previous_value": previous.production_pct,
                "threshold": 5.0,
            })

        # Low production (below 60%)
        if current.production_pct < 60:
            alerts.append({
                "flock_id": flock.id,
                "flock_number": flock.flock_number,
                "alert_type": "low_production",
                "severity": "danger",
                "message": f"Production at {current.production_pct:.1f}% (below 60% threshold)",
                "current_value": current.production_pct,
                "threshold": 60.0,
            })

        # Check against breed curve if available
        breed_curve = get_breed_curve(flock.breed)
        if breed_curve and flock.hatch_date:
            from datetime import date as date_type
            try:
                hatch = date_type.fromisoformat(flock.hatch_date)
                record_date = date_type.fromisoformat(current.record_date)
                age_weeks = (record_date - hatch).days // 7

                # Find nearest breed curve point
                curve_weeks = sorted(breed_curve.keys())
                expected = None
                for w in curve_weeks:
                    if w >= age_weeks:
                        expected = breed_curve[w]
                        break
                if expected is None and curve_weeks:
                    expected = breed_curve[curve_weeks[-1]]

                if expected and current.production_pct < expected * 0.85:  # 15% below expected
                    alerts.append({
                        "flock_id": flock.id,
                        "flock_number": flock.flock_number,
                        "alert_type": "below_breed_standard",
                        "severity": "warning",
                        "message": f"At {current.production_pct:.1f}% vs {expected:.1f}% expected for {flock.breed} at {age_weeks} weeks",
                        "current_value": current.production_pct,
                        "previous_value": expected,
                        "threshold": expected * 0.85,
                    })
            except (ValueError, TypeError):
                pass

    # Mortality spikes (recent mortality > 0.5% of flock in one record)
    for flock in flocks:
        mort_result = await db.execute(
            select(MortalityRecord)
            .where(MortalityRecord.flock_id == flock.id)
            .order_by(MortalityRecord.record_date.desc())
            .limit(1)
        )
        latest_mort = mort_result.scalars().first()
        if latest_mort and flock.initial_bird_count > 0:
            total_loss = latest_mort.deaths + latest_mort.culls
            loss_pct = (total_loss / flock.initial_bird_count) * 100
            if loss_pct > 0.5:
                alerts.append({
                    "flock_id": flock.id,
                    "flock_number": flock.flock_number,
                    "alert_type": "mortality_spike",
                    "severity": "danger" if loss_pct > 1.0 else "warning",
                    "message": f"Mortality spike: {total_loss} birds ({loss_pct:.2f}%) on {latest_mort.record_date}",
                    "current_value": loss_pct,
                    "threshold": 0.5,
                })

    return alerts


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
