from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal

from app.db.database import get_db
from app.schemas.grower import GrowerCreate, GrowerUpdate, GrowerResponse, GrowerListResponse
from app.services import grower_service
from app.models.accounting import GrowerPaymentFormula
from app.models.base import generate_uuid

router = APIRouter(prefix="/growers", tags=["growers"])


class PaymentFormulaCreate(BaseModel):
    base_rate_per_bird: float = 0
    mortality_deduction_rate: float = 0
    production_bonus_rate: float = 0
    production_target_pct: float = 80
    feed_conversion_bonus: float = 0
    notes: Optional[str] = None


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


# ── Grower Payment Formula CRUD ──

@router.get("/{grower_id}/payment-formula")
async def get_payment_formula(grower_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GrowerPaymentFormula).where(
            GrowerPaymentFormula.grower_id == grower_id,
            GrowerPaymentFormula.is_active == True,
        )
    )
    formula = result.scalar_one_or_none()
    if not formula:
        return None
    return {
        "id": formula.id,
        "grower_id": formula.grower_id,
        "base_rate_per_bird": float(formula.base_rate_per_bird),
        "mortality_deduction_rate": float(formula.mortality_deduction_rate),
        "production_bonus_rate": float(formula.production_bonus_rate),
        "production_target_pct": float(formula.production_target_pct),
        "feed_conversion_bonus": float(formula.feed_conversion_bonus),
        "notes": formula.notes,
        "is_active": formula.is_active,
    }


@router.put("/{grower_id}/payment-formula")
async def upsert_payment_formula(
    grower_id: str, data: PaymentFormulaCreate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(GrowerPaymentFormula).where(
            GrowerPaymentFormula.grower_id == grower_id,
            GrowerPaymentFormula.is_active == True,
        )
    )
    formula = result.scalar_one_or_none()

    if formula:
        formula.base_rate_per_bird = Decimal(str(data.base_rate_per_bird))
        formula.mortality_deduction_rate = Decimal(str(data.mortality_deduction_rate))
        formula.production_bonus_rate = Decimal(str(data.production_bonus_rate))
        formula.production_target_pct = Decimal(str(data.production_target_pct))
        formula.feed_conversion_bonus = Decimal(str(data.feed_conversion_bonus))
        formula.notes = data.notes
    else:
        formula = GrowerPaymentFormula(
            id=generate_uuid(),
            grower_id=grower_id,
            base_rate_per_bird=Decimal(str(data.base_rate_per_bird)),
            mortality_deduction_rate=Decimal(str(data.mortality_deduction_rate)),
            production_bonus_rate=Decimal(str(data.production_bonus_rate)),
            production_target_pct=Decimal(str(data.production_target_pct)),
            feed_conversion_bonus=Decimal(str(data.feed_conversion_bonus)),
            notes=data.notes,
            is_active=True,
        )
        db.add(formula)

    await db.commit()
    await db.refresh(formula)
    return {
        "id": formula.id,
        "grower_id": formula.grower_id,
        "base_rate_per_bird": float(formula.base_rate_per_bird),
        "mortality_deduction_rate": float(formula.mortality_deduction_rate),
        "production_bonus_rate": float(formula.production_bonus_rate),
        "production_target_pct": float(formula.production_target_pct),
        "feed_conversion_bonus": float(formula.feed_conversion_bonus),
        "notes": formula.notes,
    }
