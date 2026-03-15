from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from typing import Optional, List

from app.models.logistics import PickupJob, PickupItem, PickupStatus, Shipment, ShipmentLine, ShipmentStatus
from app.models.farm import Barn, Grower
from app.models.flock import Flock
from app.models.inventory import EggInventory, EggGrade
from app.models.contracts import EggContract
from app.schemas.logistics import PickupJobCreate, PickupItemComplete, ShipmentCreate, ShipmentStatusUpdate


# ── Auto-number generators ──

async def _next_pickup_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(PickupJob.id)))
    count = result.scalar() or 0
    return f"PU-{count + 1:06d}"


async def _next_shipment_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(Shipment.id)))
    count = result.scalar() or 0
    return f"SH-{count + 1:06d}"


async def _get_grade_label(db: AsyncSession, grade_value: str) -> str:
    result = await db.execute(
        select(EggGrade.label).where(EggGrade.value == grade_value)
    )
    label = result.scalar_one_or_none()
    return label or grade_value.replace("_", " ").title()


# ── Pickup Jobs ──

async def create_pickup_job(db: AsyncSession, data: PickupJobCreate):
    pickup_number = await _next_pickup_number(db)

    job = PickupJob(
        pickup_number=pickup_number,
        scheduled_date=data.scheduled_date,
        driver_name=data.driver_name,
        notes=data.notes,
    )
    db.add(job)
    await db.flush()

    for item_data in data.items:
        # Validate barn and flock exist
        barn = await db.get(Barn, item_data.barn_id)
        if not barn:
            raise ValueError(f"Barn not found: {item_data.barn_id}")
        flock = await db.get(Flock, item_data.flock_id)
        if not flock:
            raise ValueError(f"Flock not found: {item_data.flock_id}")

        item = PickupItem(
            pickup_job_id=job.id,
            barn_id=item_data.barn_id,
            flock_id=item_data.flock_id,
            skids_estimated=item_data.skids_estimated,
            notes=item_data.notes,
        )
        db.add(item)

    await db.commit()
    await db.refresh(job)
    return await _pickup_to_dict(db, job)


async def get_pickup_jobs(db: AsyncSession, status: str = None):
    query = select(PickupJob).order_by(PickupJob.scheduled_date.desc())
    if status:
        query = query.where(PickupJob.status == status)
    result = await db.execute(query)
    jobs = result.scalars().all()
    return [await _pickup_to_dict(db, j) for j in jobs]


async def get_pickup_job(db: AsyncSession, job_id: str):
    job = await db.get(PickupJob, job_id)
    if not job:
        return None
    return await _pickup_to_dict(db, job)


async def complete_pickup(db: AsyncSession, job_id: str, items: List[PickupItemComplete]):
    """Mark a pickup as completed. For each item, set actual skids and grade,
    then auto-receive those skids into the egg warehouse inventory."""
    job = await db.get(PickupJob, job_id)
    if not job:
        raise ValueError("Pickup job not found")
    if job.status != PickupStatus.PENDING:
        raise ValueError(f"Pickup is already {job.status.value}")

    try:
        for item_data in items:
            item = await db.get(PickupItem, item_data.item_id)
            if not item or item.pickup_job_id != job_id:
                raise ValueError(f"Pickup item not found: {item_data.item_id}")

            item.skids_actual = item_data.skids_actual
            item.grade = item_data.grade

            # Auto-receive into egg warehouse inventory
            if item_data.skids_actual > 0:
                # Get current on-hand for this flock+grade
                current_on_hand = await _get_warehouse_on_hand(db, item.flock_id, item_data.grade)
                new_on_hand = current_on_hand + item_data.skids_actual

                inv_record = EggInventory(
                    flock_id=item.flock_id,
                    record_date=job.scheduled_date,
                    grade=item_data.grade,
                    skids_in=item_data.skids_actual,
                    skids_out=0,
                    skids_on_hand=new_on_hand,
                    dozens_per_skid=900,
                    notes=f"Auto-received from pickup {job.pickup_number}",
                )
                db.add(inv_record)

        job.status = PickupStatus.COMPLETED
        job.completed_date = job.scheduled_date
        await db.commit()
        return await _pickup_to_dict(db, job)
    except Exception:
        await db.rollback()
        raise


async def cancel_pickup(db: AsyncSession, job_id: str):
    job = await db.get(PickupJob, job_id)
    if not job:
        return False
    if job.status != PickupStatus.PENDING:
        raise ValueError(f"Cannot cancel a {job.status.value} pickup")
    job.status = PickupStatus.CANCELLED
    await db.commit()
    return True


# ── Shipments ──

async def create_shipment(db: AsyncSession, data: ShipmentCreate):
    shipment_number = await _next_shipment_number(db)

    # Validate contract if provided
    contract = None
    if data.contract_id:
        contract = await db.get(EggContract, data.contract_id)
        if not contract:
            raise ValueError("Contract not found")

    shipment = Shipment(
        shipment_number=shipment_number,
        bol_number=data.bol_number,
        contract_id=data.contract_id,
        ship_date=data.ship_date,
        buyer=data.buyer,
        carrier=data.carrier,
        destination=data.destination,
        notes=data.notes,
    )
    db.add(shipment)
    await db.flush()

    for line_data in data.lines:
        # Validate inventory availability
        if line_data.flock_id:
            on_hand = await _get_warehouse_on_hand(db, line_data.flock_id, line_data.grade)
            if line_data.skids > on_hand:
                grade_label = await _get_grade_label(db, line_data.grade)
                raise ValueError(f"Only {on_hand} skids of {grade_label} available for this flock")

        price = Decimal(str(line_data.price_per_dozen)) if line_data.price_per_dozen else None
        # Use contract price if available and no line price specified
        if not price and contract and contract.price_per_dozen:
            price = contract.price_per_dozen

        line = ShipmentLine(
            shipment_id=shipment.id,
            flock_id=line_data.flock_id,
            grade=line_data.grade,
            skids=line_data.skids,
            dozens_per_skid=line_data.dozens_per_skid,
            price_per_dozen=price,
            notes=line_data.notes,
        )
        db.add(line)

        # Deduct from warehouse inventory
        if line_data.flock_id:
            current_on_hand = await _get_warehouse_on_hand(db, line_data.flock_id, line_data.grade)
            new_on_hand = current_on_hand - line_data.skids

            inv_record = EggInventory(
                flock_id=line_data.flock_id,
                record_date=data.ship_date,
                grade=line_data.grade,
                skids_in=0,
                skids_out=line_data.skids,
                skids_on_hand=new_on_hand,
                dozens_per_skid=line_data.dozens_per_skid,
                notes=f"Shipped on {shipment_number} BOL#{data.bol_number}",
            )
            db.add(inv_record)

    await db.commit()
    await db.refresh(shipment)
    return await _shipment_to_dict(db, shipment)


async def get_shipments(db: AsyncSession, status: str = None, contract_id: str = None):
    query = select(Shipment).order_by(Shipment.ship_date.desc())
    if status:
        query = query.where(Shipment.status == status)
    if contract_id:
        query = query.where(Shipment.contract_id == contract_id)
    result = await db.execute(query)
    shipments = result.scalars().all()
    return [await _shipment_to_dict(db, s) for s in shipments]


async def get_shipment(db: AsyncSession, shipment_id: str):
    shipment = await db.get(Shipment, shipment_id)
    if not shipment:
        return None
    return await _shipment_to_dict(db, shipment)


async def update_shipment_status(db: AsyncSession, shipment_id: str, data: ShipmentStatusUpdate):
    shipment = await db.get(Shipment, shipment_id)
    if not shipment:
        return None
    shipment.status = ShipmentStatus(data.status)
    await db.commit()
    await db.refresh(shipment)
    return await _shipment_to_dict(db, shipment)


# ── Helpers ──

async def _get_warehouse_on_hand(db: AsyncSession, flock_id: str, grade: str) -> int:
    """Get current skids on hand in warehouse for a flock+grade."""
    result = await db.execute(
        select(EggInventory.skids_on_hand)
        .where(EggInventory.flock_id == flock_id, EggInventory.grade == grade)
        .order_by(EggInventory.record_date.desc(), EggInventory.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row if row is not None else 0


async def _pickup_to_dict(db: AsyncSession, job: PickupJob) -> dict:
    items_result = await db.execute(
        select(PickupItem).where(PickupItem.pickup_job_id == job.id)
    )
    items = items_result.scalars().all()

    item_dicts = []
    total_estimated = 0
    total_actual = 0
    for item in items:
        barn = await db.get(Barn, item.barn_id)
        flock = await db.get(Flock, item.flock_id)
        grade_label = await _get_grade_label(db, item.grade) if item.grade else ""

        total_estimated += item.skids_estimated
        if item.skids_actual is not None:
            total_actual += item.skids_actual

        item_dicts.append({
            "id": item.id,
            "pickup_job_id": item.pickup_job_id,
            "barn_id": item.barn_id,
            "barn_name": barn.name if barn else "",
            "flock_id": item.flock_id,
            "flock_number": flock.flock_number if flock else "",
            "skids_estimated": item.skids_estimated,
            "skids_actual": item.skids_actual,
            "grade": item.grade,
            "grade_label": grade_label,
            "notes": item.notes,
        })

    return {
        "id": job.id,
        "pickup_number": job.pickup_number,
        "scheduled_date": job.scheduled_date,
        "driver_name": job.driver_name,
        "status": job.status.value if hasattr(job.status, 'value') else job.status,
        "completed_date": job.completed_date,
        "notes": job.notes,
        "items": item_dicts,
        "total_estimated_skids": total_estimated,
        "total_actual_skids": total_actual,
        "created_at": job.created_at,
    }


async def _shipment_to_dict(db: AsyncSession, shipment: Shipment) -> dict:
    lines_result = await db.execute(
        select(ShipmentLine).where(ShipmentLine.shipment_id == shipment.id)
    )
    lines = lines_result.scalars().all()

    line_dicts = []
    total_skids = 0
    total_dozens = 0
    total_amount = Decimal("0")

    for line in lines:
        flock = await db.get(Flock, line.flock_id) if line.flock_id else None
        grade_label = await _get_grade_label(db, line.grade)
        line_dozens = line.skids * line.dozens_per_skid
        line_total = Decimal(str(line.skids)) * Decimal(str(line.dozens_per_skid)) * line.price_per_dozen if line.price_per_dozen else Decimal("0")

        total_skids += line.skids
        total_dozens += line_dozens
        total_amount += line_total

        line_dicts.append({
            "id": line.id,
            "shipment_id": line.shipment_id,
            "flock_id": line.flock_id,
            "flock_number": flock.flock_number if flock else "",
            "grade": line.grade,
            "grade_label": grade_label,
            "skids": line.skids,
            "dozens_per_skid": line.dozens_per_skid,
            "total_dozens": line_dozens,
            "price_per_dozen": float(line.price_per_dozen) if line.price_per_dozen else None,
            "line_total": float(line_total),
            "notes": line.notes,
        })

    # Get contract number if applicable
    contract_number = ""
    if shipment.contract_id:
        contract = await db.get(EggContract, shipment.contract_id)
        contract_number = contract.contract_number if contract else ""

    return {
        "id": shipment.id,
        "shipment_number": shipment.shipment_number,
        "bol_number": shipment.bol_number,
        "contract_id": shipment.contract_id,
        "contract_number": contract_number,
        "ship_date": shipment.ship_date,
        "buyer": shipment.buyer,
        "carrier": shipment.carrier,
        "destination": shipment.destination,
        "status": shipment.status.value if hasattr(shipment.status, 'value') else shipment.status,
        "notes": shipment.notes,
        "lines": line_dicts,
        "total_skids": total_skids,
        "total_dozens": total_dozens,
        "total_amount": float(total_amount),
        "created_at": shipment.created_at,
    }
