from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db.database import get_db
from app.schemas.grower import GrowerCreate, GrowerUpdate, GrowerResponse, GrowerListResponse
from app.services import grower_service

router = APIRouter(prefix="/growers", tags=["growers"])


@router.get("", response_model=List[GrowerListResponse])
async def list_growers(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await grower_service.get_all_growers(db, include_inactive)


@router.get("/{grower_id}", response_model=GrowerResponse)
async def get_grower(grower_id: str, db: AsyncSession = Depends(get_db)):
    grower = await grower_service.get_grower(db, grower_id)
    if not grower:
        raise HTTPException(status_code=404, detail="Grower not found")
    return grower


@router.post("", response_model=GrowerResponse, status_code=201)
async def create_grower(data: GrowerCreate, db: AsyncSession = Depends(get_db)):
    return await grower_service.create_grower(db, data)


@router.put("/{grower_id}", response_model=GrowerResponse)
async def update_grower(grower_id: str, data: GrowerUpdate, db: AsyncSession = Depends(get_db)):
    grower = await grower_service.update_grower(db, grower_id, data)
    if not grower:
        raise HTTPException(status_code=404, detail="Grower not found")
    return grower


@router.delete("/{grower_id}")
async def delete_grower(grower_id: str, db: AsyncSession = Depends(get_db)):
    success = await grower_service.delete_grower(db, grower_id)
    if not success:
        raise HTTPException(status_code=404, detail="Grower not found")
    return {"message": "Grower deactivated"}
