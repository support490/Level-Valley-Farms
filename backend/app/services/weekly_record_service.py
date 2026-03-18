from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date

from app.models.farm import Barn
from app.models.flock import Flock
from app.models.weekly_record import (
    WeeklyRecord, WeeklyRecordStatus,
    WeeklyProductionLog, WeeklyFeedLog,
    FlyLog, RodentLog, FootBathLog, AmmoniaLog,
    GeneratorLog, EggsShippedLog, AlarmCheckLog,
    PitLog, CoolerTempLog,
)
from app.schemas.weekly_record import WeeklyRecordCreate, WeeklyRecordUpdate


def _compute_summaries(record: WeeklyRecord):
    """Compute all derived summary fields from sub-log data."""
    start = date.fromisoformat(record.start_date)
    end = date.fromisoformat(record.end_date)
    num_days = (end - start).days + 1

    # Production log summaries
    total_culls = sum(p.cull_count for p in record.production_logs)
    total_mortality = sum(p.mortality_count for p in record.production_logs)
    total_egg_production = sum(p.egg_production for p in record.production_logs)
    total_water = sum(p.water_gallons or 0 for p in record.production_logs)

    case_weights = [p.case_weight for p in record.production_logs if p.case_weight]
    temp_highs = [p.temp_high for p in record.production_logs if p.temp_high is not None]
    temp_lows = [p.temp_low for p in record.production_logs if p.temp_low is not None]

    record.total_culls = total_culls
    record.total_mortality = total_mortality
    record.total_egg_production = total_egg_production
    record.total_water_gallons = round(total_water, 2) if total_water else None

    record.ending_bird_count = record.starting_bird_count - total_culls - total_mortality

    if record.starting_bird_count > 0 and num_days > 0:
        record.percent_production = round(
            total_egg_production / (record.starting_bird_count * num_days) * 100, 2
        )
        if total_water > 0:
            record.gallons_per_100_birds = round(
                total_water / (record.starting_bird_count / 100) / num_days, 2
            )

    record.avg_case_weight = round(sum(case_weights) / len(case_weights), 2) if case_weights else None
    record.avg_temp_high = round(sum(temp_highs) / len(temp_highs), 1) if temp_highs else None
    record.avg_temp_low = round(sum(temp_lows) / len(temp_lows), 1) if temp_lows else None

    # Feed log summaries
    feed_days = [f.lbs_feed_day for f in record.feed_logs if f.lbs_feed_day is not None]
    feed_per100 = [f.lbs_per_100 for f in record.feed_logs if f.lbs_per_100 is not None]
    feed_delivered = sum(f.feed_delivered or 0 for f in record.feed_logs)
    feed_inventories = [f.feed_inventory for f in record.feed_logs if f.feed_inventory is not None]

    record.avg_lbs_feed_day = round(sum(feed_days) / len(feed_days), 2) if feed_days else None
    record.avg_lbs_per_100 = round(sum(feed_per100) / len(feed_per100), 2) if feed_per100 else None
    record.total_feed_delivered = round(feed_delivered, 2) if feed_delivered else None
    record.end_feed_inventory = feed_inventories[-1] if feed_inventories else None

    # Barn egg inventory — last day's egg_inventory value
    egg_inventories = [p.egg_inventory for p in record.production_logs if p.egg_inventory is not None]
    record.barn_egg_inventory = egg_inventories[-1] if egg_inventories else None


def _sync_sub_logs(record: WeeklyRecord, data, log_attr: str, model_class, entries):
    """Replace all sub-log entries for a given type."""
    getattr(record, log_attr).clear()
    for entry in entries:
        obj = model_class(
            weekly_record_id=record.id,
            **entry.model_dump(),
        )
        getattr(record, log_attr).append(obj)


async def create_weekly_record(db: AsyncSession, data: WeeklyRecordCreate) -> WeeklyRecord:
    flock = await db.get(Flock, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    try:
        record = WeeklyRecord(
            flock_id=data.flock_id,
            barn_id=data.barn_id,
            grower_name=data.grower_name,
            start_date=data.start_date,
            end_date=data.end_date,
            starting_bird_count=data.starting_bird_count,
            ending_bird_count=data.starting_bird_count,
            bird_weight=data.bird_weight,
            status=WeeklyRecordStatus(data.status),
            comments=data.comments,
        )
        db.add(record)
        await db.flush()

        # Add all sub-logs
        _sync_sub_logs(record, data, "production_logs", WeeklyProductionLog, data.production_logs)
        _sync_sub_logs(record, data, "feed_logs", WeeklyFeedLog, data.feed_logs)
        _sync_sub_logs(record, data, "fly_logs", FlyLog, data.fly_logs)
        _sync_sub_logs(record, data, "rodent_logs", RodentLog, data.rodent_logs)
        _sync_sub_logs(record, data, "foot_bath_logs", FootBathLog, data.foot_bath_logs)
        _sync_sub_logs(record, data, "ammonia_logs", AmmoniaLog, data.ammonia_logs)
        _sync_sub_logs(record, data, "generator_logs", GeneratorLog, data.generator_logs)
        _sync_sub_logs(record, data, "eggs_shipped_logs", EggsShippedLog, data.eggs_shipped_logs)
        _sync_sub_logs(record, data, "alarm_check_logs", AlarmCheckLog, data.alarm_check_logs)
        _sync_sub_logs(record, data, "pit_logs", PitLog, data.pit_logs)
        _sync_sub_logs(record, data, "cooler_temp_logs", CoolerTempLog, data.cooler_temp_logs)

        _compute_summaries(record)

        await db.commit()
        await db.refresh(record)
        return record
    except Exception:
        await db.rollback()
        raise


async def get_weekly_records(db: AsyncSession, flock_id: str = None, date_from: str = None, date_to: str = None):
    query = select(WeeklyRecord).order_by(WeeklyRecord.start_date.desc())
    if flock_id:
        query = query.where(WeeklyRecord.flock_id == flock_id)
    if date_from:
        query = query.where(WeeklyRecord.start_date >= date_from)
    if date_to:
        query = query.where(WeeklyRecord.end_date <= date_to)

    result = await db.execute(query)
    records = result.scalars().all()

    response = []
    for r in records:
        flock = await db.get(Flock, r.flock_id)
        barn = await db.get(Barn, r.barn_id)
        response.append({
            **{c.key: getattr(r, c.key) for c in r.__table__.columns},
            "status": r.status.value if hasattr(r.status, 'value') else r.status,
            "flock_number": flock.flock_number if flock else None,
            "barn_name": barn.name if barn else None,
        })
    return response


async def get_weekly_record(db: AsyncSession, record_id: str):
    result = await db.execute(
        select(WeeklyRecord).where(WeeklyRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        return None

    # Eagerly load sub-logs
    await db.refresh(record, [
        "production_logs", "feed_logs", "fly_logs", "rodent_logs",
        "foot_bath_logs", "ammonia_logs", "generator_logs", "eggs_shipped_logs",
        "alarm_check_logs", "pit_logs", "cooler_temp_logs",
    ])

    flock = await db.get(Flock, record.flock_id)
    barn = await db.get(Barn, record.barn_id)

    return {
        **{c.key: getattr(record, c.key) for c in record.__table__.columns},
        "status": record.status.value if hasattr(record.status, 'value') else record.status,
        "flock_number": flock.flock_number if flock else None,
        "barn_name": barn.name if barn else None,
        "production_logs": [
            {c.key: getattr(p, c.key) for c in p.__table__.columns if c.key != "weekly_record_id"}
            for p in record.production_logs
        ],
        "feed_logs": [
            {c.key: getattr(f, c.key) for c in f.__table__.columns if c.key != "weekly_record_id"}
            for f in record.feed_logs
        ],
        "fly_logs": [
            {c.key: getattr(f, c.key) for c in f.__table__.columns if c.key != "weekly_record_id"}
            for f in record.fly_logs
        ],
        "rodent_logs": [
            {c.key: getattr(r, c.key) for c in r.__table__.columns if c.key != "weekly_record_id"}
            for r in record.rodent_logs
        ],
        "foot_bath_logs": [
            {c.key: getattr(f, c.key) for c in f.__table__.columns if c.key != "weekly_record_id"}
            for f in record.foot_bath_logs
        ],
        "ammonia_logs": [
            {c.key: getattr(a, c.key) for c in a.__table__.columns if c.key != "weekly_record_id"}
            for a in record.ammonia_logs
        ],
        "generator_logs": [
            {c.key: getattr(g, c.key) for c in g.__table__.columns if c.key != "weekly_record_id"}
            for g in record.generator_logs
        ],
        "eggs_shipped_logs": [
            {c.key: getattr(e, c.key) for c in e.__table__.columns if c.key != "weekly_record_id"}
            for e in record.eggs_shipped_logs
        ],
        "alarm_check_logs": [
            {c.key: getattr(a, c.key) for c in a.__table__.columns if c.key != "weekly_record_id"}
            for a in record.alarm_check_logs
        ],
        "pit_logs": [
            {c.key: getattr(p, c.key) for c in p.__table__.columns if c.key != "weekly_record_id"}
            for p in record.pit_logs
        ],
        "cooler_temp_logs": [
            {col.key: getattr(ct, col.key) for col in ct.__table__.columns if col.key != "weekly_record_id"}
            for ct in record.cooler_temp_logs
        ],
    }


async def update_weekly_record(db: AsyncSession, record_id: str, data: WeeklyRecordUpdate):
    result = await db.execute(
        select(WeeklyRecord).where(WeeklyRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        return None

    if record.status == WeeklyRecordStatus.SUBMITTED and (data.status is None or data.status != "draft"):
        raise ValueError("Cannot edit a submitted record. Change status back to draft first.")

    try:
        # Update header fields
        for field in ["grower_name", "start_date", "end_date", "starting_bird_count", "bird_weight", "comments"]:
            val = getattr(data, field, None)
            if val is not None:
                setattr(record, field, val)

        if data.status is not None:
            record.status = WeeklyRecordStatus(data.status)

        # Update sub-logs if provided
        await db.refresh(record, [
            "production_logs", "feed_logs", "fly_logs", "rodent_logs",
            "foot_bath_logs", "ammonia_logs", "generator_logs", "eggs_shipped_logs",
            "alarm_check_logs", "pit_logs", "cooler_temp_logs",
        ])

        if data.production_logs is not None:
            _sync_sub_logs(record, data, "production_logs", WeeklyProductionLog, data.production_logs)
        if data.feed_logs is not None:
            _sync_sub_logs(record, data, "feed_logs", WeeklyFeedLog, data.feed_logs)
        if data.fly_logs is not None:
            _sync_sub_logs(record, data, "fly_logs", FlyLog, data.fly_logs)
        if data.rodent_logs is not None:
            _sync_sub_logs(record, data, "rodent_logs", RodentLog, data.rodent_logs)
        if data.foot_bath_logs is not None:
            _sync_sub_logs(record, data, "foot_bath_logs", FootBathLog, data.foot_bath_logs)
        if data.ammonia_logs is not None:
            _sync_sub_logs(record, data, "ammonia_logs", AmmoniaLog, data.ammonia_logs)
        if data.generator_logs is not None:
            _sync_sub_logs(record, data, "generator_logs", GeneratorLog, data.generator_logs)
        if data.eggs_shipped_logs is not None:
            _sync_sub_logs(record, data, "eggs_shipped_logs", EggsShippedLog, data.eggs_shipped_logs)
        if data.alarm_check_logs is not None:
            _sync_sub_logs(record, data, "alarm_check_logs", AlarmCheckLog, data.alarm_check_logs)
        if data.pit_logs is not None:
            _sync_sub_logs(record, data, "pit_logs", PitLog, data.pit_logs)
        if data.cooler_temp_logs is not None:
            _sync_sub_logs(record, data, "cooler_temp_logs", CoolerTempLog, data.cooler_temp_logs)

        _compute_summaries(record)

        await db.commit()
        await db.refresh(record)
        return record
    except Exception:
        await db.rollback()
        raise


async def delete_weekly_record(db: AsyncSession, record_id: str):
    result = await db.execute(
        select(WeeklyRecord).where(WeeklyRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        return False

    if record.status == WeeklyRecordStatus.SUBMITTED:
        raise ValueError("Cannot delete a submitted record")

    try:
        await db.delete(record)
        await db.commit()
        return True
    except Exception:
        await db.rollback()
        raise
