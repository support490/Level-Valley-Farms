from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.farm import Barn, Grower, FlockPlacement
from app.models.flock import Flock, FlockStatus, MortalityRecord, VALID_STATUS_TRANSITIONS
from app.schemas.flock import FlockCreate, FlockUpdate, TransferRequest, MortalityCreate


async def get_all_flocks(db: AsyncSession, status: str = None):
    query = select(Flock).order_by(Flock.flock_number)
    if status:
        query = query.where(Flock.status == status)
    result = await db.execute(query)
    flocks = result.scalars().all()

    response = []
    for f in flocks:
        placement = await _get_current_placement(db, f.id)
        barn_name = None
        barn_id = None
        grower_name = None
        if placement:
            barn = await db.get(Barn, placement.barn_id)
            if barn:
                barn_name = barn.name
                barn_id = barn.id
                grower = await db.get(Grower, barn.grower_id)
                grower_name = grower.name if grower else None

        response.append({
            **{c.key: getattr(f, c.key) for c in f.__table__.columns},
            "status": f.status.value if hasattr(f.status, 'value') else f.status,
            "current_barn": barn_name,
            "current_barn_id": barn_id,
            "current_grower": grower_name,
        })
    return response


async def get_flock(db: AsyncSession, flock_id: str):
    result = await db.execute(select(Flock).where(Flock.id == flock_id))
    return result.scalar_one_or_none()


async def get_flock_by_number(db: AsyncSession, flock_number: str):
    result = await db.execute(select(Flock).where(Flock.flock_number == flock_number))
    return result.scalar_one_or_none()


async def create_flock(db: AsyncSession, data: FlockCreate):
    existing = await get_flock_by_number(db, data.flock_number)
    if existing:
        raise ValueError(f"Flock number {data.flock_number} already exists")

    barn = await db.get(Barn, data.barn_id)
    if not barn:
        raise ValueError("Barn not found")
    if not barn.is_active:
        raise ValueError("Cannot place flock in an inactive barn")

    available = barn.bird_capacity - barn.current_bird_count
    if data.initial_bird_count > available:
        raise ValueError(f"Barn only has capacity for {available} more birds")

    try:
        flock = Flock(
            flock_number=data.flock_number,
            breed=data.breed,
            hatch_date=data.hatch_date,
            arrival_date=data.arrival_date,
            initial_bird_count=data.initial_bird_count,
            current_bird_count=data.initial_bird_count,
            notes=data.notes,
        )
        db.add(flock)
        await db.flush()

        placement = FlockPlacement(
            flock_id=flock.id,
            barn_id=data.barn_id,
            bird_count=data.initial_bird_count,
            placed_date=data.arrival_date,
            is_current=True,
        )
        db.add(placement)

        barn.current_bird_count += data.initial_bird_count
        await db.commit()
        await db.refresh(flock)
        return flock
    except Exception:
        await db.rollback()
        raise


async def update_flock(db: AsyncSession, flock_id: str, data: FlockUpdate):
    flock = await get_flock(db, flock_id)
    if not flock:
        return None

    for key, val in data.model_dump(exclude_unset=True).items():
        if key == "status" and val:
            new_status = FlockStatus(val)
            current_status = flock.status

            # Validate state transition
            allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
            if new_status not in allowed:
                raise ValueError(
                    f"Cannot transition from '{current_status.value}' to '{new_status.value}'. "
                    f"Allowed transitions: {', '.join(s.value for s in allowed) if allowed else 'none (terminal state)'}"
                )
            setattr(flock, key, new_status)
        else:
            setattr(flock, key, val)

    await db.commit()
    await db.refresh(flock)
    return flock


async def transfer_flock(db: AsyncSession, flock_id: str, data: TransferRequest):
    flock = await get_flock(db, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Only active or transferred flocks can be transferred
    if flock.status in (FlockStatus.SOLD, FlockStatus.CULLED):
        raise ValueError(f"Cannot transfer a flock with status '{flock.status.value}'")

    source_barn = await db.get(Barn, data.source_barn_id)
    dest_barn = await db.get(Barn, data.destination_barn_id)
    if not source_barn or not dest_barn:
        raise ValueError("Source or destination barn not found")
    if not source_barn.is_active:
        raise ValueError("Source barn is inactive")
    if not dest_barn.is_active:
        raise ValueError("Destination barn is inactive")

    if data.bird_count > source_barn.current_bird_count:
        raise ValueError(f"Source barn only has {source_barn.current_bird_count} birds")

    available = dest_barn.bird_capacity - dest_barn.current_bird_count
    if data.bird_count > available:
        raise ValueError(f"Destination barn only has capacity for {available} more birds")

    try:
        # Close current placement at source
        current = await _get_current_placement_for_barn(db, flock_id, data.source_barn_id)
        if current:
            if data.bird_count > current.bird_count:
                raise ValueError(f"Placement only has {current.bird_count} birds, cannot transfer {data.bird_count}")

            current.is_current = False
            current.removed_date = data.transfer_date
            original_bird_count = current.bird_count
            current.bird_count = data.bird_count  # the removed portion

            # If some birds remain, keep a current placement for them
            remaining = original_bird_count - data.bird_count
            if remaining > 0:
                remaining_placement = FlockPlacement(
                    flock_id=flock_id,
                    barn_id=data.source_barn_id,
                    bird_count=remaining,
                    placed_date=data.transfer_date,
                    is_current=True,
                )
                db.add(remaining_placement)

        # Create new placement at destination
        new_placement = FlockPlacement(
            flock_id=flock_id,
            barn_id=data.destination_barn_id,
            bird_count=data.bird_count,
            placed_date=data.transfer_date,
            is_current=True,
        )
        db.add(new_placement)

        # Update barn counts
        source_barn.current_bird_count -= data.bird_count
        dest_barn.current_bird_count += data.bird_count

        # Note: flock.current_bird_count stays the same (birds aren't lost, just moved)

        await db.commit()
        return {"message": f"Transferred {data.bird_count} birds from {source_barn.name} to {dest_barn.name}"}
    except Exception:
        await db.rollback()
        raise


async def get_flock_placements(db: AsyncSession, flock_id: str):
    result = await db.execute(
        select(FlockPlacement)
        .where(FlockPlacement.flock_id == flock_id)
        .order_by(FlockPlacement.placed_date.desc())
    )
    placements = result.scalars().all()

    response = []
    for p in placements:
        barn = await db.get(Barn, p.barn_id)
        grower = await db.get(Grower, barn.grower_id) if barn else None
        response.append({
            **{c.key: getattr(p, c.key) for c in p.__table__.columns},
            "barn_name": barn.name if barn else "",
            "grower_name": grower.name if grower else "",
            "barn_type": barn.barn_type.value if barn else "",
        })
    return response


async def record_mortality(db: AsyncSession, data: MortalityCreate):
    flock = await get_flock(db, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Only allow mortality on active flocks
    if flock.status in (FlockStatus.SOLD, FlockStatus.CULLED):
        raise ValueError(f"Cannot record mortality for a flock with status '{flock.status.value}'")

    total_loss = data.deaths + data.culls
    if total_loss > flock.current_bird_count:
        raise ValueError(f"Cannot record {total_loss} losses — flock only has {flock.current_bird_count} birds")

    try:
        record = MortalityRecord(**data.model_dump())
        db.add(record)

        flock.current_bird_count -= total_loss

        # Also update the barn count for current placement
        current_placement = await _get_current_placement(db, data.flock_id)
        if current_placement:
            barn = await db.get(Barn, current_placement.barn_id)
            if barn:
                barn.current_bird_count -= total_loss
            current_placement.bird_count -= total_loss

        await db.commit()
        await db.refresh(record)
        return record
    except Exception:
        await db.rollback()
        raise


async def get_mortality_records(db: AsyncSession, flock_id: str = None):
    query = select(MortalityRecord).order_by(MortalityRecord.record_date.desc())
    if flock_id:
        query = query.where(MortalityRecord.flock_id == flock_id)
    result = await db.execute(query)
    records = result.scalars().all()

    response = []
    for r in records:
        flock = await get_flock(db, r.flock_id)
        response.append({
            **{c.key: getattr(r, c.key) for c in r.__table__.columns},
            "flock_number": flock.flock_number if flock else "",
        })
    return response


async def _get_current_placement(db: AsyncSession, flock_id: str):
    result = await db.execute(
        select(FlockPlacement)
        .where(FlockPlacement.flock_id == flock_id, FlockPlacement.is_current == True)
        .order_by(FlockPlacement.placed_date.desc())
    )
    return result.scalars().first()


async def _get_current_placement_for_barn(db: AsyncSession, flock_id: str, barn_id: str):
    result = await db.execute(
        select(FlockPlacement)
        .where(
            FlockPlacement.flock_id == flock_id,
            FlockPlacement.barn_id == barn_id,
            FlockPlacement.is_current == True,
        )
    )
    return result.scalars().first()
