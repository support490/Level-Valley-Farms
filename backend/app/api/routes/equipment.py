from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.equipment import (
    EquipmentCreate, EquipmentUpdate, EquipmentResponse,
    HookTrailerRequest, ParkTrailerRequest,
)
from app.services import equipment_service

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.get("", response_model=List[EquipmentResponse])
async def list_equipment(
    equipment_type: Optional[str] = Query(None),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await equipment_service.get_equipment_list(db, equipment_type, active_only)


@router.post("", response_model=EquipmentResponse, status_code=201)
async def create_equipment(data: EquipmentCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await equipment_service.create_equipment(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/trucks-with-trailers")
async def trucks_with_trailers(db: AsyncSession = Depends(get_db)):
    return await equipment_service.get_trucks_with_trailers(db)


@router.get("/{equipment_id}", response_model=EquipmentResponse)
async def get_equipment(equipment_id: str, db: AsyncSession = Depends(get_db)):
    result = await equipment_service.get_equipment(db, equipment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return result


@router.put("/{equipment_id}", response_model=EquipmentResponse)
async def update_equipment(equipment_id: str, data: EquipmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await equipment_service.update_equipment(db, equipment_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return result


@router.post("/{truck_id}/hook", response_model=EquipmentResponse)
async def hook_trailer(truck_id: str, data: HookTrailerRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await equipment_service.hook_trailer(db, truck_id, data.trailer_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{truck_id}/unhook", response_model=EquipmentResponse)
async def unhook_trailer(truck_id: str, data: ParkTrailerRequest = None, db: AsyncSession = Depends(get_db)):
    try:
        barn_id = data.barn_id if data else None
        return await equipment_service.unhook_trailer(db, truck_id, barn_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{trailer_id}/park", response_model=EquipmentResponse)
async def park_trailer(trailer_id: str, data: ParkTrailerRequest = None, db: AsyncSession = Depends(get_db)):
    try:
        barn_id = data.barn_id if data else None
        return await equipment_service.park_trailer(db, trailer_id, barn_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
