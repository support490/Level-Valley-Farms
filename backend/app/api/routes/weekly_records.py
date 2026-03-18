from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.database import get_db
from app.schemas.weekly_record import WeeklyRecordCreate, WeeklyRecordUpdate
from app.services import weekly_record_service

router = APIRouter(prefix="/production", tags=["weekly-records"])


@router.post("/weekly-record")
async def create_weekly_record(
    data: WeeklyRecordCreate,
    db: AsyncSession = Depends(get_db),
):
    try:
        record = await weekly_record_service.create_weekly_record(db, data)
        return await weekly_record_service.get_weekly_record(db, record.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/weekly-records")
async def list_weekly_records(
    flock_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await weekly_record_service.get_weekly_records(db, flock_id, date_from, date_to)


@router.get("/weekly-records/{record_id}")
async def get_weekly_record(
    record_id: str,
    db: AsyncSession = Depends(get_db),
):
    record = await weekly_record_service.get_weekly_record(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Weekly record not found")
    return record


@router.put("/weekly-records/{record_id}")
async def update_weekly_record(
    record_id: str,
    data: WeeklyRecordUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        record = await weekly_record_service.update_weekly_record(db, record_id, data)
        if not record:
            raise HTTPException(status_code=404, detail="Weekly record not found")
        return await weekly_record_service.get_weekly_record(db, record.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/weekly-records/{record_id}")
async def delete_weekly_record(
    record_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        deleted = await weekly_record_service.delete_weekly_record(db, record_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Weekly record not found")
        return {"message": "Weekly record deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
