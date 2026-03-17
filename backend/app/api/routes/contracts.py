from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.contracts import (
    EggContractCreate, EggContractUpdate, EggContractResponse, ContractAssignmentCreate,
    BuyerCreate, BuyerUpdate, BuyerResponse,
    ContractDashboardItem, ContractPnL, PriceHistoryEntry, ContractAlert,
)
from app.services import contract_service

router = APIRouter(prefix="/contracts", tags=["contracts"])


# ── Buyers ──

@router.get("/buyers", response_model=List[BuyerResponse])
async def list_buyers(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await contract_service.get_all_buyers(db, active_only)


@router.get("/buyers/{buyer_id}", response_model=BuyerResponse)
async def get_buyer(buyer_id: str, db: AsyncSession = Depends(get_db)):
    buyer = await contract_service.get_buyer(db, buyer_id)
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")
    return buyer


@router.post("/buyers", response_model=BuyerResponse, status_code=201)
async def create_buyer(data: BuyerCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await contract_service.create_buyer(db, data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/buyers/{buyer_id}", response_model=BuyerResponse)
async def update_buyer(buyer_id: str, data: BuyerUpdate, db: AsyncSession = Depends(get_db)):
    result = await contract_service.update_buyer(db, buyer_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Buyer not found")
    return result


# ── Contract Intelligence ──

@router.get("/dashboard", response_model=List[ContractDashboardItem])
async def contract_dashboard(db: AsyncSession = Depends(get_db)):
    return await contract_service.get_contract_dashboard(db)


@router.get("/alerts", response_model=List[ContractAlert])
async def contract_alerts(db: AsyncSession = Depends(get_db)):
    return await contract_service.get_contract_alerts(db)


@router.get("/price-history", response_model=List[PriceHistoryEntry])
async def price_history(
    buyer: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await contract_service.get_price_history(db, buyer)


@router.get("/spot-sales")
async def spot_sales(db: AsyncSession = Depends(get_db)):
    return await contract_service.get_spot_sales(db)


@router.get("/{contract_id}/pnl", response_model=ContractPnL)
async def contract_pnl(contract_id: str, db: AsyncSession = Depends(get_db)):
    result = await contract_service.get_contract_pnl(db, contract_id)
    if not result:
        raise HTTPException(status_code=404, detail="Contract not found")
    return result


# ── Contract CRUD ──

@router.get("", response_model=List[EggContractResponse])
async def list_contracts(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await contract_service.get_all_contracts(db, active_only)


@router.get("/{contract_id}", response_model=EggContractResponse)
async def get_contract(contract_id: str, db: AsyncSession = Depends(get_db)):
    contract = await contract_service.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


@router.post("", response_model=EggContractResponse, status_code=201)
async def create_contract(data: EggContractCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await contract_service.create_contract(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{contract_id}", response_model=EggContractResponse)
async def update_contract(
    contract_id: str,
    data: EggContractUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await contract_service.update_contract(db, contract_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Contract not found")
    return result


@router.delete("/{contract_id}")
async def delete_contract(contract_id: str, db: AsyncSession = Depends(get_db)):
    if not await contract_service.delete_contract(db, contract_id):
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"message": "Contract deactivated"}


@router.post("/assign", response_model=EggContractResponse)
async def assign_flock(data: ContractAssignmentCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await contract_service.assign_flock(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{contract_id}/flocks/{flock_id}")
async def unassign_flock(
    contract_id: str,
    flock_id: str,
    db: AsyncSession = Depends(get_db),
):
    if not await contract_service.unassign_flock(db, contract_id, flock_id):
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Flock unassigned from contract"}


@router.get("/flock/{flock_id}", response_model=List[EggContractResponse])
async def get_flock_contracts(flock_id: str, db: AsyncSession = Depends(get_db)):
    return await contract_service.get_contracts_for_flock(db, flock_id)
