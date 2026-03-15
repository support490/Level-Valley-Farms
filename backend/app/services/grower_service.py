from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.farm import Grower, Barn
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
        response.append({
            **{c.key: getattr(g, c.key) for c in g.__table__.columns},
            "barn_count": len(barns),
            "total_bird_capacity": sum(b.bird_capacity for b in barns),
            "total_current_birds": sum(b.current_bird_count for b in barns),
        })
    return response


async def get_grower(db: AsyncSession, grower_id: str):
    result = await db.execute(
        select(Grower).where(Grower.id == grower_id)
    )
    return result.scalar_one_or_none()


async def create_grower(db: AsyncSession, data: GrowerCreate):
    grower = Grower(**data.model_dump())
    db.add(grower)
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
