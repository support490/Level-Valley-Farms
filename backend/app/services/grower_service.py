from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.farm import Grower, Barn, BarnType, FlockPlacement
from app.models.flock import Flock, FlockStatus
from app.schemas.grower import GrowerCreate, GrowerUpdate


async def get_all_growers(db: AsyncSession, include_inactive: bool = False):
    query = select(Grower).options(selectinload(Grower.barns))
    if not include_inactive:
        query = query.where(Grower.is_active == True)
    query = query.order_by(Grower.name)
    result = await db.execute(query)
    growers = result.scalars().all()

    response = []
    for g in growers:
        barns = [b for b in g.barns if b.is_active]
        barns_detail = []
        for b in barns:
            # Get current flock in this barn
            flock_result = await db.execute(
                select(Flock)
                .join(FlockPlacement, FlockPlacement.flock_id == Flock.id)
                .where(
                    FlockPlacement.barn_id == b.id,
                    FlockPlacement.is_current == True,
                    Flock.status.in_([FlockStatus.ACTIVE, FlockStatus.CLOSING, FlockStatus.TRANSFERRED]),
                )
            )
            current_flock = flock_result.scalars().first()

            barns_detail.append({
                "id": b.id,
                "name": b.name,
                "barn_type": b.barn_type.value if hasattr(b.barn_type, 'value') else b.barn_type,
                "bird_capacity": b.bird_capacity,
                "current_bird_count": b.current_bird_count,
                "is_active": b.is_active,
                "notes": b.notes,
                "current_flock_id": current_flock.id if current_flock else None,
                "current_flock_number": current_flock.flock_number if current_flock else None,
                "current_flock_status": current_flock.status.value if current_flock else None,
            })

        response.append({
            **{c.key: getattr(g, c.key) for c in g.__table__.columns},
            "barn_count": len(barns),
            "total_bird_capacity": sum(b.bird_capacity for b in barns),
            "total_current_birds": sum(b.current_bird_count for b in barns),
            "barns": barns_detail,
        })
    return response


async def get_grower(db: AsyncSession, grower_id: str):
    result = await db.execute(
        select(Grower).where(Grower.id == grower_id)
    )
    return result.scalar_one_or_none()


async def create_grower(db: AsyncSession, data: GrowerCreate):
    barns_data = data.barns if hasattr(data, 'barns') and data.barns else []
    grower_dict = data.model_dump(exclude={'barns'})
    grower = Grower(**grower_dict)
    db.add(grower)
    await db.flush()

    for barn_data in barns_data:
        barn = Barn(
            name=barn_data.name,
            barn_type=BarnType(barn_data.barn_type),
            bird_capacity=barn_data.bird_capacity,
            grower_id=grower.id,
            notes=barn_data.notes,
        )
        db.add(barn)

    await db.commit()
    await db.refresh(grower)
    return grower


async def update_grower(db: AsyncSession, grower_id: str, data: GrowerUpdate):
    grower = await get_grower(db, grower_id)
    if not grower:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(grower, key, val)
    await db.commit()
    await db.refresh(grower)
    return grower


async def delete_grower(db: AsyncSession, grower_id: str):
    grower = await get_grower(db, grower_id)
    if not grower:
        return False
    grower.is_active = False
    await db.commit()
    return True
