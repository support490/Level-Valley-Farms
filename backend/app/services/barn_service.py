from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.farm import Barn, Grower
from app.schemas.barn import BarnCreate, BarnUpdate


async def get_all_barns(db: AsyncSession, grower_id: str = None, barn_type: str = None, include_inactive: bool = False):
    query = select(Barn).join(Grower)
    if not include_inactive:
        query = query.where(Barn.is_active == True)
    if grower_id:
        query = query.where(Barn.grower_id == grower_id)
    if barn_type:
        query = query.where(Barn.barn_type == barn_type)
    query = query.order_by(Grower.name, Barn.name)
    result = await db.execute(query)
    barns = result.scalars().all()

    response = []
    for b in barns:
        grower = await db.get(Grower, b.grower_id)
        response.append({
            **{c.key: getattr(b, c.key) for c in b.__table__.columns},
            "grower_name": grower.name if grower else "",
        })
    return response


async def get_barn(db: AsyncSession, barn_id: str):
    result = await db.execute(select(Barn).where(Barn.id == barn_id))
    return result.scalar_one_or_none()


async def create_barn(db: AsyncSession, data: BarnCreate):
    barn = Barn(**data.model_dump())
    db.add(barn)
    await db.commit()
    await db.refresh(barn)
    return barn


async def update_barn(db: AsyncSession, barn_id: str, data: BarnUpdate):
    barn = await get_barn(db, barn_id)
    if not barn:
        return None
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(barn, key, val)
    await db.commit()
    await db.refresh(barn)
    return barn


async def delete_barn(db: AsyncSession, barn_id: str):
    barn = await get_barn(db, barn_id)
    if not barn:
        return False
    barn.is_active = False
    await db.commit()
    return True
