from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.barn import BarnCreate, BarnUpdate, BarnResponse
from app.services import barn_service

router = APIRouter(prefix="/barns", tags=["barns"])


@router.get("", response_model=List[BarnResponse])
async def list_barns(
    grower_id: Optional[str] = Query(None),
    barn_type: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await barn_service.get_all_barns(db, grower_id, barn_type, include_inactive)


@router.get("/{barn_id}", response_model=BarnResponse)
async def get_barn(barn_id: str, db: AsyncSession = Depends(get_db)):
    barn = await barn_service.get_barn(db, barn_id)
    if not barn:
        raise HTTPException(status_code=404, detail="Barn not found")
    from app.models.farm import Grower
    grower = await db.get(Grower, barn.grower_id)
    return {
        **{c.key: getattr(barn, c.key) for c in barn.__table__.columns},
        "grower_name": grower.name if grower else "",
    }


@router.post("", response_model=BarnResponse, status_code=201)
async def create_barn(data: BarnCreate, db: AsyncSession = Depends(get_db)):
    barn = await barn_service.create_barn(db, data)
    from app.models.farm import Grower
    grower = await db.get(Grower, barn.grower_id)
    return {
        **{c.key: getattr(barn, c.key) for c in barn.__table__.columns},
        "grower_name": grower.name if grower else "",
    }


@router.put("/{barn_id}", response_model=BarnResponse)
async def update_barn(barn_id: str, data: BarnUpdate, db: AsyncSession = Depends(get_db)):
    barn = await barn_service.update_barn(db, barn_id, data)
    if not barn:
        raise HTTPException(status_code=404, detail="Barn not found")
    from app.models.farm import Grower
    grower = await db.get(Grower, barn.grower_id)
    return {
        **{c.key: getattr(barn, c.key) for c in barn.__table__.columns},
        "grower_name": grower.name if grower else "",
    }


@router.delete("/{barn_id}")
async def delete_barn(barn_id: str, db: AsyncSession = Depends(get_db)):
    success = await barn_service.delete_barn(db, barn_id)
    if not success:
        raise HTTPException(status_code=404, detail="Barn not found")
    return {"message": "Barn deactivated"}
