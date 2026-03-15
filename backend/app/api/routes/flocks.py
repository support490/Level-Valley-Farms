from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.flock import (
    FlockCreate, FlockUpdate, FlockResponse,
    TransferRequest, MortalityCreate, MortalityResponse, PlacementResponse,
)
from app.services import flock_service

router = APIRouter(prefix="/flocks", tags=["flocks"])


@router.get("", response_model=List[FlockResponse])
async def list_flocks(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await flock_service.get_all_flocks(db, status)


@router.get("/{flock_id}", response_model=FlockResponse)
async def get_flock(flock_id: str, db: AsyncSession = Depends(get_db)):
    flocks = await flock_service.get_all_flocks(db)
    for f in flocks:
        if f["id"] == flock_id:
            return f
    raise HTTPException(status_code=404, detail="Flock not found")


@router.post("", response_model=FlockResponse, status_code=201)
async def create_flock(data: FlockCreate, db: AsyncSession = Depends(get_db)):
    try:
        flock = await flock_service.create_flock(db, data)
        flocks = await flock_service.get_all_flocks(db)
        for f in flocks:
            if f["id"] == flock.id:
                return f
        return flock
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{flock_id}", response_model=FlockResponse)
async def update_flock(flock_id: str, data: FlockUpdate, db: AsyncSession = Depends(get_db)):
    flock = await flock_service.update_flock(db, flock_id, data)
    if not flock:
        raise HTTPException(status_code=404, detail="Flock not found")
    flocks = await flock_service.get_all_flocks(db)
    for f in flocks:
        if f["id"] == flock.id:
            return f
    return flock


@router.post("/{flock_id}/transfer")
async def transfer_flock(flock_id: str, data: TransferRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await flock_service.transfer_flock(db, flock_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{flock_id}/placements", response_model=List[PlacementResponse])
async def get_placements(flock_id: str, db: AsyncSession = Depends(get_db)):
    return await flock_service.get_flock_placements(db, flock_id)


@router.post("/mortality", response_model=MortalityResponse, status_code=201)
async def record_mortality(data: MortalityCreate, db: AsyncSession = Depends(get_db)):
    try:
        record = await flock_service.record_mortality(db, data)
        flock = await flock_service.get_flock(db, record.flock_id)
        return {
            **{c.key: getattr(record, c.key) for c in record.__table__.columns},
            "flock_number": flock.flock_number if flock else "",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/mortality/records", response_model=List[MortalityResponse])
async def list_mortality(
    flock_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await flock_service.get_mortality_records(db, flock_id)
