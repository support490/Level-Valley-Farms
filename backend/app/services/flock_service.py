from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from decimal import Decimal
from datetime import date

from app.models.farm import Barn, Grower, FlockPlacement, BarnType
from app.models.flock import (
    Flock, FlockStatus, FlockType, BirdColor, SourceType,
    MortalityRecord, ProductionRecord, FlockSource, VALID_STATUS_TRANSITIONS,
)
from app.models.accounting import JournalEntry, JournalLine, ExpenseCategory
from app.schemas.flock import (
    FlockCreate, FlockUpdate, TransferRequest, MortalityCreate,
    SplitRequest, PulletSaleRequest, OutsidePurchaseRequest, CloseoutRequest,
)


def _generate_flock_number(bird_color: str, flock_type: str, grower_initials: str, hatch_date: str) -> str:
    """Generate flock number in format: [Color][Type][GrowerInitials][MMDDYY]
    e.g. BPjd032625 = Brown Pullet, grower John Doe, hatched 03/26/25
    """
    color_code = "B" if bird_color == "brown" else "W"
    type_code = "P" if flock_type == "pullet" else "L"
    initials = grower_initials.lower()[:2] if grower_initials else "xx"

    # Parse YYYY-MM-DD to MMDDYY
    if hatch_date and len(hatch_date) >= 10:
        parts = hatch_date.split("-")
        date_code = f"{parts[1]}{parts[2]}{parts[0][2:]}"
    else:
        date_code = "000000"

    return f"{color_code}{type_code}{initials}{date_code}"


def _get_grower_initials(grower: Grower) -> str:
    """Extract first and last initials from grower contact name, fallback to grower name."""
    name = grower.contact_name or grower.name
    parts = name.strip().split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).lower()
    elif len(parts) == 1:
        return (parts[0][0] + parts[0][0]).lower()
    return "xx"


async def _ensure_unique_flock_number(db: AsyncSession, base_number: str) -> str:
    """Add suffix if flock number already exists."""
    existing = await get_flock_by_number(db, base_number)
    if not existing:
        return base_number

    suffix = 1
    while True:
        candidate = f"{base_number}-{suffix}"
        existing = await get_flock_by_number(db, candidate)
        if not existing:
            return candidate
        suffix += 1


async def _flock_to_response(db: AsyncSession, flock: Flock) -> dict:
    """Convert a Flock model to a response dict with enriched fields."""
    placement = await _get_current_placement(db, flock.id)
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

    parent_flock_number = None
    if flock.parent_flock_id:
        parent = await db.get(Flock, flock.parent_flock_id)
        parent_flock_number = parent.flock_number if parent else None

    # Get flock sources for layer flocks
    sources = None
    if flock.flock_type == FlockType.LAYER:
        result = await db.execute(
            select(FlockSource).where(FlockSource.layer_flock_id == flock.id)
        )
        source_records = result.scalars().all()
        if source_records:
            sources = []
            for s in source_records:
                pullet = await db.get(Flock, s.pullet_flock_id)
                sources.append({
                    "id": s.id,
                    "pullet_flock_id": s.pullet_flock_id,
                    "pullet_flock_number": pullet.flock_number if pullet else "",
                    "bird_count": s.bird_count,
                    "cost_per_bird": s.cost_per_bird,
                    "transfer_date": s.transfer_date,
                })

    # Derived operational data
    flock_age_weeks = None
    months_laying = None
    hatch = flock.hatch_date
    if hatch:
        try:
            hatch_dt = date.fromisoformat(hatch)
            flock_age_weeks = (date.today() - hatch_dt).days // 7
            if flock.flock_type == FlockType.LAYER:
                months_laying = max(0, (flock_age_weeks - 18) * 7 // 30)
        except (ValueError, TypeError):
            pass

    # Latest production % from most recent ProductionRecord
    current_production_pct = None
    prod_result = await db.execute(
        select(ProductionRecord.production_pct)
        .where(ProductionRecord.flock_id == flock.id)
        .order_by(ProductionRecord.record_date.desc())
        .limit(1)
    )
    latest_prod = prod_result.scalar_one_or_none()
    if latest_prod is not None:
        current_production_pct = round(latest_prod, 1)

    # Total mortality
    mort_result = await db.execute(
        select(
            func.coalesce(func.sum(MortalityRecord.deaths), 0),
            func.coalesce(func.sum(MortalityRecord.culls), 0),
        ).where(MortalityRecord.flock_id == flock.id)
    )
    mort_row = mort_result.one()
    total_mortality = int(mort_row[0]) + int(mort_row[1])
    mortality_pct = round(total_mortality / flock.initial_bird_count * 100, 1) if flock.initial_bird_count > 0 else 0.0

    return {
        **{c.key: getattr(flock, c.key) for c in flock.__table__.columns},
        "status": flock.status.value if hasattr(flock.status, 'value') else flock.status,
        "flock_type": flock.flock_type.value if hasattr(flock.flock_type, 'value') else flock.flock_type,
        "bird_color": flock.bird_color.value if hasattr(flock.bird_color, 'value') else flock.bird_color,
        "source_type": flock.source_type.value if hasattr(flock.source_type, 'value') else flock.source_type,
        "current_barn": barn_name,
        "current_barn_id": barn_id,
        "current_grower": grower_name,
        "parent_flock_number": parent_flock_number,
        "flock_sources": sources,
        "flock_age_weeks": flock_age_weeks,
        "months_laying": months_laying,
        "current_production_pct": current_production_pct,
        "total_mortality": total_mortality,
        "mortality_pct": mortality_pct,
    }


async def get_all_flocks(db: AsyncSession, status: str = None, flock_type: str = None):
    query = select(Flock).order_by(Flock.flock_number)
    if status:
        query = query.where(Flock.status == status)
    if flock_type:
        query = query.where(Flock.flock_type == flock_type)
    result = await db.execute(query)
    flocks = result.scalars().all()

    response = []
    for f in flocks:
        response.append(await _flock_to_response(db, f))
    return response


async def get_flock(db: AsyncSession, flock_id: str):
    result = await db.execute(select(Flock).where(Flock.id == flock_id))
    return result.scalar_one_or_none()


async def get_flock_by_number(db: AsyncSession, flock_number: str):
    result = await db.execute(select(Flock).where(Flock.flock_number == flock_number))
    return result.scalar_one_or_none()


async def create_flock(db: AsyncSession, data: FlockCreate):
    barn = await db.get(Barn, data.barn_id)
    if not barn:
        raise ValueError("Barn not found")
    if not barn.is_active:
        raise ValueError("Cannot place flock in an inactive barn")

    # Validate barn type matches flock type
    if data.flock_type == "pullet" and barn.barn_type != BarnType.PULLET:
        raise ValueError("Pullet flocks must be placed in pullet barns")
    if data.flock_type == "layer" and barn.barn_type != BarnType.LAYER:
        raise ValueError("Layer flocks must be placed in layer barns")

    available = barn.bird_capacity - barn.current_bird_count
    if data.initial_bird_count > available:
        raise ValueError(f"Barn only has capacity for {available} more birds")

    # Get grower for flock number generation
    grower = await db.get(Grower, barn.grower_id)

    # Auto-generate flock number if not provided
    flock_number = data.flock_number
    if not flock_number:
        if not grower:
            raise ValueError("Cannot generate flock number: grower not found")
        initials = _get_grower_initials(grower)
        base_number = _generate_flock_number(
            data.bird_color, data.flock_type, initials, data.hatch_date or data.arrival_date
        )
        flock_number = await _ensure_unique_flock_number(db, base_number)
    else:
        existing = await get_flock_by_number(db, flock_number)
        if existing:
            raise ValueError(f"Flock number {flock_number} already exists")

    try:
        flock = Flock(
            flock_number=flock_number,
            flock_type=FlockType(data.flock_type),
            bird_color=BirdColor(data.bird_color),
            source_type=SourceType(data.source_type),
            breed=data.breed,
            hatch_date=data.hatch_date,
            arrival_date=data.arrival_date,
            initial_bird_count=data.initial_bird_count,
            current_bird_count=data.initial_bird_count,
            cost_per_bird=data.cost_per_bird or Decimal("0.0000"),
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
    """Transfer birds within the same flock type (pullet-to-pullet or layer-to-layer)."""
    flock = await get_flock(db, flock_id)
    if not flock:
        raise ValueError("Flock not found")

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

    # Transfers must stay within same barn type
    if source_barn.barn_type != dest_barn.barn_type:
        raise ValueError("Cannot transfer between different barn types. Use split for pullet-to-layer moves.")

    if data.bird_count > source_barn.current_bird_count:
        raise ValueError(f"Source barn only has {source_barn.current_bird_count} birds")

    available = dest_barn.bird_capacity - dest_barn.current_bird_count
    if data.bird_count > available:
        raise ValueError(f"Destination barn only has capacity for {available} more birds")

    try:
        current = await _get_current_placement_for_barn(db, flock_id, data.source_barn_id)
        if current:
            if data.bird_count > current.bird_count:
                raise ValueError(f"Placement only has {current.bird_count} birds, cannot transfer {data.bird_count}")

            current.is_current = False
            current.removed_date = data.transfer_date
            original_bird_count = current.bird_count

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

        new_placement = FlockPlacement(
            flock_id=flock_id,
            barn_id=data.destination_barn_id,
            bird_count=data.bird_count,
            placed_date=data.transfer_date,
            is_current=True,
        )
        db.add(new_placement)

        source_barn.current_bird_count -= data.bird_count
        dest_barn.current_bird_count += data.bird_count

        await db.commit()
        return {"message": f"Transferred {data.bird_count} birds from {source_barn.name} to {dest_barn.name}"}
    except Exception:
        await db.rollback()
        raise


async def _calculate_pullet_cost_per_bird(db: AsyncSession, flock: Flock) -> Decimal:
    """Calculate cost per bird for a pullet flock based on all expenses / surviving birds."""
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.flock_id == flock.id, JournalEntry.is_posted == True)
    )
    entries = result.scalars().all()

    total_expenses = Decimal("0.00")
    for entry in entries:
        lines_result = await db.execute(
            select(JournalLine).where(JournalLine.journal_entry_id == entry.id)
        )
        lines = lines_result.scalars().all()
        for line in lines:
            # Expense accounts are debited
            total_expenses += line.debit

    # Also include the flock's own cost_per_bird * initial birds (chick purchase cost)
    if flock.cost_per_bird and flock.cost_per_bird > 0:
        total_expenses += flock.cost_per_bird * flock.initial_bird_count

    if flock.current_bird_count <= 0:
        return Decimal("0.0000")

    return (total_expenses / flock.current_bird_count).quantize(Decimal("0.0001"))


async def split_flock(db: AsyncSession, flock_id: str, data: SplitRequest):
    """Split birds from a pullet flock into a layer barn. Creates or merges into a layer flock."""
    pullet_flock = await get_flock(db, flock_id)
    if not pullet_flock:
        raise ValueError("Pullet flock not found")

    if pullet_flock.flock_type != FlockType.PULLET:
        raise ValueError("Can only split pullet flocks. Use transfer for layer-to-layer moves.")

    if pullet_flock.status in (FlockStatus.SOLD, FlockStatus.CULLED, FlockStatus.CLOSING):
        raise ValueError(f"Cannot split a flock with status '{pullet_flock.status.value}'")

    if data.bird_count > pullet_flock.current_bird_count:
        raise ValueError(f"Flock only has {pullet_flock.current_bird_count} birds, cannot split {data.bird_count}")

    dest_barn = await db.get(Barn, data.destination_barn_id)
    if not dest_barn:
        raise ValueError("Destination barn not found")
    if not dest_barn.is_active:
        raise ValueError("Destination barn is inactive")
    if dest_barn.barn_type != BarnType.LAYER:
        raise ValueError("Destination must be a layer barn for pullet-to-layer splits")

    available = dest_barn.bird_capacity - dest_barn.current_bird_count
    if data.bird_count > available:
        raise ValueError(f"Destination barn only has capacity for {available} more birds")

    # Calculate cost per bird from pullet expenses
    pullet_cpb = await _calculate_pullet_cost_per_bird(db, pullet_flock)

    # Get grower for auto-generating layer flock number
    dest_grower = await db.get(Grower, dest_barn.grower_id)

    try:
        # Check if there's already an active layer flock in the destination barn
        existing_layer = await _get_active_flock_in_barn(db, data.destination_barn_id)

        if existing_layer:
            # Merge into existing layer flock - weighted average cost
            old_total_cost = existing_layer.cost_per_bird * existing_layer.current_bird_count
            new_total_cost = pullet_cpb * data.bird_count
            combined_birds = existing_layer.current_bird_count + data.bird_count
            existing_layer.cost_per_bird = ((old_total_cost + new_total_cost) / combined_birds).quantize(Decimal("0.0001"))
            existing_layer.current_bird_count = combined_birds
            existing_layer.initial_bird_count += data.bird_count

            # Update placement bird count
            current_placement = await _get_current_placement(db, existing_layer.id)
            if current_placement:
                current_placement.bird_count = combined_birds

            # Record the source
            source = FlockSource(
                layer_flock_id=existing_layer.id,
                pullet_flock_id=pullet_flock.id,
                bird_count=data.bird_count,
                cost_per_bird=pullet_cpb,
                transfer_date=data.transfer_date,
                notes=data.notes,
            )
            db.add(source)

            layer_flock = existing_layer
        else:
            # Create new layer flock
            if data.layer_flock_number:
                flock_number = data.layer_flock_number
                existing = await get_flock_by_number(db, flock_number)
                if existing:
                    raise ValueError(f"Flock number {flock_number} already exists")
            else:
                initials = _get_grower_initials(dest_grower) if dest_grower else "xx"
                base_number = _generate_flock_number(
                    pullet_flock.bird_color.value, "layer", initials,
                    pullet_flock.hatch_date or pullet_flock.arrival_date
                )
                flock_number = await _ensure_unique_flock_number(db, base_number)

            layer_flock = Flock(
                flock_number=flock_number,
                flock_type=FlockType.LAYER,
                bird_color=pullet_flock.bird_color,
                source_type=SourceType.SPLIT,
                breed=pullet_flock.breed,
                hatch_date=pullet_flock.hatch_date,
                arrival_date=data.transfer_date,
                initial_bird_count=data.bird_count,
                current_bird_count=data.bird_count,
                cost_per_bird=pullet_cpb,
                parent_flock_id=pullet_flock.id,
                notes=data.notes,
            )
            db.add(layer_flock)
            await db.flush()

            placement = FlockPlacement(
                flock_id=layer_flock.id,
                barn_id=data.destination_barn_id,
                bird_count=data.bird_count,
                placed_date=data.transfer_date,
                is_current=True,
            )
            db.add(placement)

            # Record the source
            source = FlockSource(
                layer_flock_id=layer_flock.id,
                pullet_flock_id=pullet_flock.id,
                bird_count=data.bird_count,
                cost_per_bird=pullet_cpb,
                transfer_date=data.transfer_date,
                notes=data.notes,
            )
            db.add(source)

        # Reduce pullet flock bird count
        pullet_flock.current_bird_count -= data.bird_count

        # Close the pullet placement partially or fully
        pullet_placement = await _get_current_placement(db, pullet_flock.id)
        if pullet_placement:
            original_count = pullet_placement.bird_count
            remaining = original_count - data.bird_count

            if remaining <= 0:
                pullet_placement.is_current = False
                pullet_placement.removed_date = data.transfer_date
            else:
                pullet_placement.bird_count = remaining

        # Update barn bird counts
        source_barn = await db.get(Barn, pullet_placement.barn_id) if pullet_placement else None
        if source_barn:
            source_barn.current_bird_count -= data.bird_count
        dest_barn.current_bird_count += data.bird_count

        # If pullet flock is now empty, mark as sold/transferred
        if pullet_flock.current_bird_count <= 0:
            pullet_flock.status = FlockStatus.SOLD
            pullet_flock.sold_date = data.transfer_date

        await db.commit()
        await db.refresh(layer_flock)

        return {
            "message": f"Split {data.bird_count} birds from {pullet_flock.flock_number} to {layer_flock.flock_number}",
            "layer_flock_id": layer_flock.id,
            "layer_flock_number": layer_flock.flock_number,
            "cost_per_bird": str(layer_flock.cost_per_bird),
            "pullet_remaining": pullet_flock.current_bird_count,
        }
    except Exception:
        await db.rollback()
        raise


async def sell_pullets(db: AsyncSession, flock_id: str, data: PulletSaleRequest):
    """Sell birds from a pullet flock."""
    flock = await get_flock(db, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    if flock.flock_type != FlockType.PULLET:
        raise ValueError("Can only sell pullets from a pullet flock")

    if flock.status in (FlockStatus.SOLD, FlockStatus.CULLED):
        raise ValueError(f"Cannot sell from a flock with status '{flock.status.value}'")

    if data.bird_count > flock.current_bird_count:
        raise ValueError(f"Flock only has {flock.current_bird_count} birds")

    try:
        flock.current_bird_count -= data.bird_count
        flock.sale_price_per_bird = data.price_per_bird

        # Update placement
        placement = await _get_current_placement(db, flock.id)
        if placement:
            if flock.current_bird_count <= 0:
                placement.is_current = False
                placement.removed_date = data.sale_date
            else:
                placement.bird_count = flock.current_bird_count

            # Update barn count
            barn = await db.get(Barn, placement.barn_id)
            if barn:
                barn.current_bird_count -= data.bird_count

        # If flock is now empty, mark as sold
        if flock.current_bird_count <= 0:
            flock.status = FlockStatus.SOLD
            flock.sold_date = data.sale_date

        # Create revenue journal entry
        from app.services.accounting_service import _next_entry_number
        entry_number = await _next_entry_number(db)

        total_amount = data.price_per_bird * data.bird_count

        # Find accounts
        from app.models.accounting import Account, AccountType
        ar_result = await db.execute(select(Account).where(Account.account_number == "1200"))
        ar_account = ar_result.scalar_one_or_none()
        bird_sales_result = await db.execute(select(Account).where(Account.account_number == "4200"))
        bird_sales_account = bird_sales_result.scalar_one_or_none()

        if ar_account and bird_sales_account:
            entry = JournalEntry(
                entry_number=entry_number,
                entry_date=data.sale_date,
                description=f"Pullet sale: {data.bird_count} birds from {flock.flock_number} to {data.buyer}",
                flock_id=flock.id,
                reference=f"Buyer: {data.buyer}",
                is_posted=True,
                notes=data.notes,
            )
            db.add(entry)
            await db.flush()

            db.add(JournalLine(
                journal_entry_id=entry.id,
                account_id=ar_account.id,
                debit=total_amount,
                credit=Decimal("0.00"),
                description=f"AR - Pullet sale to {data.buyer}",
            ))
            db.add(JournalLine(
                journal_entry_id=entry.id,
                account_id=bird_sales_account.id,
                debit=Decimal("0.00"),
                credit=total_amount,
                description=f"Bird Sales - {data.bird_count} pullets @ ${data.price_per_bird}/bird",
            ))

            # Update account balances
            ar_account.balance += total_amount
            bird_sales_account.balance += total_amount

        await db.commit()
        return {
            "message": f"Sold {data.bird_count} pullets from {flock.flock_number} at ${data.price_per_bird}/bird",
            "total_amount": str(total_amount),
            "remaining_birds": flock.current_bird_count,
        }
    except Exception:
        await db.rollback()
        raise


async def purchase_outside_pullets(db: AsyncSession, data: OutsidePurchaseRequest):
    """Purchase pullets from outside source directly into a layer barn."""
    barn = await db.get(Barn, data.barn_id)
    if not barn:
        raise ValueError("Barn not found")
    if not barn.is_active:
        raise ValueError("Barn is inactive")
    if barn.barn_type != BarnType.LAYER:
        raise ValueError("Outside purchases go directly into layer barns")

    available = barn.bird_capacity - barn.current_bird_count
    if data.bird_count > available:
        raise ValueError(f"Barn only has capacity for {available} more birds")

    grower = await db.get(Grower, barn.grower_id)

    try:
        # Check if there's an existing active layer flock in this barn
        existing_layer = await _get_active_flock_in_barn(db, data.barn_id)

        if existing_layer:
            # Merge into existing flock with weighted average cost
            old_total = existing_layer.cost_per_bird * existing_layer.current_bird_count
            new_total = data.cost_per_bird * data.bird_count
            combined = existing_layer.current_bird_count + data.bird_count
            existing_layer.cost_per_bird = ((old_total + new_total) / combined).quantize(Decimal("0.0001"))
            existing_layer.current_bird_count = combined
            existing_layer.initial_bird_count += data.bird_count

            current_placement = await _get_current_placement(db, existing_layer.id)
            if current_placement:
                current_placement.bird_count = combined

            barn.current_bird_count += data.bird_count
            layer_flock = existing_layer
        else:
            # Create new layer flock
            if data.flock_number:
                flock_number = data.flock_number
                existing = await get_flock_by_number(db, flock_number)
                if existing:
                    raise ValueError(f"Flock number {flock_number} already exists")
            else:
                initials = _get_grower_initials(grower) if grower else "xx"
                base_number = _generate_flock_number(
                    data.bird_color, "layer", initials, data.hatch_date or data.arrival_date
                )
                flock_number = await _ensure_unique_flock_number(db, base_number)

            layer_flock = Flock(
                flock_number=flock_number,
                flock_type=FlockType.LAYER,
                bird_color=BirdColor(data.bird_color),
                source_type=SourceType.PURCHASED,
                breed=data.breed,
                hatch_date=data.hatch_date,
                arrival_date=data.arrival_date,
                initial_bird_count=data.bird_count,
                current_bird_count=data.bird_count,
                cost_per_bird=data.cost_per_bird,
                notes=data.notes,
            )
            db.add(layer_flock)
            await db.flush()

            placement = FlockPlacement(
                flock_id=layer_flock.id,
                barn_id=data.barn_id,
                bird_count=data.bird_count,
                placed_date=data.arrival_date,
                is_current=True,
            )
            db.add(placement)

            barn.current_bird_count += data.bird_count

        await db.commit()
        await db.refresh(layer_flock)
        return layer_flock
    except Exception:
        await db.rollback()
        raise


async def initiate_closeout(db: AsyncSession, flock_id: str, data: CloseoutRequest):
    """Initiate flock closeout - record remaining inventory and begin tracking to zero."""
    flock = await get_flock(db, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    if flock.status not in (FlockStatus.ACTIVE, FlockStatus.TRANSFERRED):
        raise ValueError(f"Cannot close out a flock with status '{flock.status.value}'")

    try:
        flock.status = FlockStatus.CLOSING
        flock.closeout_date = data.closeout_date
        flock.closeout_skids_remaining = data.skids_remaining
        flock.closeout_cases_remaining = data.cases_remaining

        await db.commit()
        await db.refresh(flock)
        return {
            "message": f"Flock {flock.flock_number} closeout initiated",
            "skids_remaining": data.skids_remaining,
            "cases_remaining": data.cases_remaining,
        }
    except Exception:
        await db.rollback()
        raise


async def update_closeout_inventory(db: AsyncSession, flock_id: str, skids: int, cases: int):
    """Update remaining closeout inventory (for edits/corrections)."""
    flock = await get_flock(db, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    if flock.status != FlockStatus.CLOSING:
        raise ValueError("Flock is not in closing status")

    flock.closeout_skids_remaining = skids
    flock.closeout_cases_remaining = cases

    # Check if fully closed out
    is_closed = skids <= 0 and cases <= 0
    if is_closed:
        flock.status = FlockStatus.SOLD
        flock.sold_date = flock.closeout_date

    await db.commit()
    await db.refresh(flock)
    return {
        "flock_number": flock.flock_number,
        "skids_remaining": flock.closeout_skids_remaining,
        "cases_remaining": flock.closeout_cases_remaining,
        "is_fully_closed": is_closed,
    }


async def get_closeout_status(db: AsyncSession, flock_id: str):
    """Get closeout status for a flock."""
    flock = await get_flock(db, flock_id)
    if not flock:
        raise ValueError("Flock not found")

    return {
        "flock_number": flock.flock_number,
        "status": flock.status.value,
        "closeout_date": flock.closeout_date,
        "skids_remaining": flock.closeout_skids_remaining or 0,
        "cases_remaining": flock.closeout_cases_remaining or 0,
        "is_fully_closed": flock.status in (FlockStatus.SOLD, FlockStatus.CULLED),
    }


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

    if flock.status in (FlockStatus.SOLD, FlockStatus.CULLED):
        raise ValueError(f"Cannot record mortality for a flock with status '{flock.status.value}'")

    total_loss = data.deaths + data.culls
    if total_loss > flock.current_bird_count:
        raise ValueError(f"Cannot record {total_loss} losses — flock only has {flock.current_bird_count} birds")

    try:
        record = MortalityRecord(**data.model_dump())
        db.add(record)

        flock.current_bird_count -= total_loss

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


async def _get_active_flock_in_barn(db: AsyncSession, barn_id: str):
    """Find the currently active layer flock in a barn (if any)."""
    result = await db.execute(
        select(Flock)
        .join(FlockPlacement, FlockPlacement.flock_id == Flock.id)
        .where(
            FlockPlacement.barn_id == barn_id,
            FlockPlacement.is_current == True,
            Flock.flock_type == FlockType.LAYER,
            Flock.status.in_([FlockStatus.ACTIVE, FlockStatus.TRANSFERRED]),
        )
    )
    return result.scalars().first()
