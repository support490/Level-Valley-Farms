from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from decimal import Decimal
from typing import Optional

from app.models.equipment import Equipment, EquipmentType
from app.models.farm import Barn, Grower
from app.schemas.equipment import EquipmentCreate, EquipmentUpdate


# ── Auto-number generators ──

async def _next_equipment_number(db: AsyncSession, eq_type: EquipmentType) -> str:
    prefix = "TR" if eq_type == EquipmentType.TRUCK else "TL"
    result = await db.execute(
        select(func.count(Equipment.id)).where(Equipment.equipment_type == eq_type)
    )
    count = result.scalar() or 0
    return f"{prefix}-{count + 1:04d}"


# ── CRUD ──

async def create_equipment(db: AsyncSession, data: EquipmentCreate):
    eq_type = EquipmentType(data.equipment_type)
    equipment_number = await _next_equipment_number(db, eq_type)

    equipment = Equipment(
        equipment_number=equipment_number,
        name=data.name,
        equipment_type=eq_type,
        capacity_skids=data.capacity_skids,
        weight_limit_lbs=Decimal(str(data.weight_limit_lbs)) if data.weight_limit_lbs is not None else None,
        license_plate=data.license_plate,
        notes=data.notes,
    )
    db.add(equipment)
    await db.commit()
    await db.refresh(equipment)
    return await _equipment_to_dict(db, equipment)


async def get_equipment_list(db: AsyncSession, equipment_type: str = None, active_only: bool = False):
    query = select(Equipment).order_by(Equipment.equipment_type, Equipment.name)
    if equipment_type:
        query = query.where(Equipment.equipment_type == equipment_type)
    if active_only:
        query = query.where(Equipment.is_active == True)
    result = await db.execute(query)
    return [await _equipment_to_dict(db, e) for e in result.scalars().all()]


async def get_equipment(db: AsyncSession, equipment_id: str):
    equipment = await db.get(Equipment, equipment_id)
    if not equipment:
        return None
    return await _equipment_to_dict(db, equipment)


async def update_equipment(db: AsyncSession, equipment_id: str, data: EquipmentUpdate):
    equipment = await db.get(Equipment, equipment_id)
    if not equipment:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "weight_limit_lbs" and value is not None:
            value = Decimal(str(value))
        setattr(equipment, key, value)
    await db.commit()
    await db.refresh(equipment)
    return await _equipment_to_dict(db, equipment)


# ── Hook / Unhook / Park ──

async def hook_trailer(db: AsyncSession, truck_id: str, trailer_id: str):
    """Hook a trailer to a truck. Validates types, no double-hook, clears barn."""
    truck = await db.get(Equipment, truck_id)
    if not truck:
        raise ValueError("Truck not found")
    if truck.equipment_type != EquipmentType.TRUCK:
        raise ValueError("Can only hook trailers to trucks")

    trailer = await db.get(Equipment, trailer_id)
    if not trailer:
        raise ValueError("Trailer not found")
    if trailer.equipment_type != EquipmentType.TRAILER:
        raise ValueError("Can only hook trailers, not trucks")

    # Check if truck already has a trailer
    existing = await db.execute(
        select(Equipment).where(
            Equipment.hooked_to_id == truck_id,
            Equipment.id != trailer_id,
        )
    )
    if existing.scalars().first():
        raise ValueError("This truck already has a trailer hooked")

    # Check if trailer is already hooked to another truck
    if trailer.hooked_to_id and trailer.hooked_to_id != truck_id:
        raise ValueError("This trailer is already hooked to another truck")

    trailer.hooked_to_id = truck_id
    trailer.current_barn_id = None  # No longer parked at barn
    await db.commit()
    await db.refresh(truck)
    return await _equipment_to_dict(db, truck)


async def unhook_trailer(db: AsyncSession, truck_id: str, barn_id: str = None):
    """Unhook the trailer from a truck. Optionally park at a barn."""
    truck = await db.get(Equipment, truck_id)
    if not truck:
        raise ValueError("Truck not found")

    # Find the hooked trailer
    result = await db.execute(
        select(Equipment).where(Equipment.hooked_to_id == truck_id)
    )
    trailer = result.scalars().first()
    if not trailer:
        raise ValueError("No trailer hooked to this truck")

    # Validate barn if provided
    if barn_id:
        barn = await db.get(Barn, barn_id)
        if not barn:
            raise ValueError("Barn not found")

    trailer.hooked_to_id = None
    trailer.current_barn_id = barn_id  # None = warehouse
    await db.commit()
    await db.refresh(truck)
    return await _equipment_to_dict(db, truck)


async def park_trailer(db: AsyncSession, trailer_id: str, barn_id: str = None):
    """Move an unhooked trailer to a barn or back to warehouse."""
    trailer = await db.get(Equipment, trailer_id)
    if not trailer:
        raise ValueError("Trailer not found")
    if trailer.equipment_type != EquipmentType.TRAILER:
        raise ValueError("Can only park trailers")
    if trailer.hooked_to_id:
        raise ValueError("Unhook the trailer first before parking")

    if barn_id:
        barn = await db.get(Barn, barn_id)
        if not barn:
            raise ValueError("Barn not found")

    trailer.current_barn_id = barn_id
    await db.commit()
    await db.refresh(trailer)
    return await _equipment_to_dict(db, trailer)


async def get_trucks_with_trailers(db: AsyncSession):
    """Get active trucks with their hooked trailer info for dropdown."""
    trucks_result = await db.execute(
        select(Equipment).where(
            Equipment.equipment_type == EquipmentType.TRUCK,
            Equipment.is_active == True,
        ).order_by(Equipment.name)
    )
    trucks = trucks_result.scalars().all()

    result = []
    for truck in trucks:
        # Find hooked trailer
        trailer_result = await db.execute(
            select(Equipment).where(Equipment.hooked_to_id == truck.id)
        )
        trailer = trailer_result.scalars().first()

        result.append({
            "id": truck.id,
            "equipment_number": truck.equipment_number,
            "name": truck.name,
            "license_plate": truck.license_plate,
            "trailer": {
                "id": trailer.id,
                "equipment_number": trailer.equipment_number,
                "name": trailer.name,
                "capacity_skids": trailer.capacity_skids,
                "weight_limit_lbs": float(trailer.weight_limit_lbs) if trailer.weight_limit_lbs else None,
            } if trailer else None,
        })

    return result


# ── Helpers ──

async def _equipment_to_dict(db: AsyncSession, equipment: Equipment) -> dict:
    # Get barn name if parked
    barn_name = ""
    if equipment.current_barn_id:
        barn = await db.get(Barn, equipment.current_barn_id)
        if barn:
            grower = await db.get(Grower, barn.grower_id)
            barn_name = f"{barn.name} ({grower.name})" if grower else barn.name

    # Get hooked-to truck name (for trailers)
    hooked_to_name = ""
    if equipment.hooked_to_id:
        hooked_to = await db.get(Equipment, equipment.hooked_to_id)
        hooked_to_name = hooked_to.name if hooked_to else ""

    # Get hooked trailer (for trucks)
    hooked_trailer_id = None
    hooked_trailer_name = ""
    hooked_trailer_capacity = 0
    hooked_trailer_weight_limit = None
    if equipment.equipment_type == EquipmentType.TRUCK:
        result = await db.execute(
            select(Equipment).where(Equipment.hooked_to_id == equipment.id)
        )
        trailer = result.scalars().first()
        if trailer:
            hooked_trailer_id = trailer.id
            hooked_trailer_name = trailer.name
            hooked_trailer_capacity = trailer.capacity_skids
            hooked_trailer_weight_limit = float(trailer.weight_limit_lbs) if trailer.weight_limit_lbs else None

    return {
        "id": equipment.id,
        "equipment_number": equipment.equipment_number,
        "name": equipment.name,
        "equipment_type": equipment.equipment_type.value,
        "capacity_skids": equipment.capacity_skids,
        "weight_limit_lbs": float(equipment.weight_limit_lbs) if equipment.weight_limit_lbs else None,
        "license_plate": equipment.license_plate,
        "hooked_to_id": equipment.hooked_to_id,
        "hooked_to_name": hooked_to_name,
        "hooked_trailer_id": hooked_trailer_id,
        "hooked_trailer_name": hooked_trailer_name,
        "hooked_trailer_capacity": hooked_trailer_capacity,
        "hooked_trailer_weight_limit": hooked_trailer_weight_limit,
        "current_barn_id": equipment.current_barn_id,
        "current_barn_name": barn_name,
        "is_active": equipment.is_active,
        "notes": equipment.notes,
        "created_at": equipment.created_at,
    }
