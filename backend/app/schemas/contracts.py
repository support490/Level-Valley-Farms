from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date


def _validate_date_str(v: str, field_name: str) -> str:
    if not v:
        raise ValueError(f"{field_name} is required")
    try:
        date.fromisoformat(v)
    except (ValueError, TypeError):
        raise ValueError(f"{field_name} must be a valid date in YYYY-MM-DD format")
    return v


class EggContractCreate(BaseModel):
    contract_number: str = Field(..., min_length=1, max_length=50)
    buyer: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    num_flocks: int = Field(1, ge=1, le=50)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    price_per_dozen: Optional[float] = Field(None, gt=0)
    grade: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("contract_number", mode="before")
    @classmethod
    def strip_contract_number(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Contract number cannot be empty")
        return v

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, v):
        if v is not None and v != "":
            return _validate_date_str(v, "start_date")
        return v

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, v):
        if v is not None and v != "":
            return _validate_date_str(v, "end_date")
        return v

    @field_validator("price_per_dozen", mode="before")
    @classmethod
    def round_price(cls, v):
        if v is None:
            return v
        try:
            val = float(v)
        except (TypeError, ValueError):
            raise ValueError("price_per_dozen must be a valid number")
        return round(val, 2)


class EggContractUpdate(BaseModel):
    buyer: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    num_flocks: Optional[int] = Field(None, ge=1, le=50)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    price_per_dozen: Optional[float] = None
    grade: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class EggContractResponse(BaseModel):
    id: str
    contract_number: str
    buyer: str
    description: Optional[str]
    num_flocks: int
    start_date: Optional[str]
    end_date: Optional[str]
    price_per_dozen: Optional[float]
    grade: Optional[str]
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    assigned_flocks: List[dict] = []

    model_config = {"from_attributes": True}


class ContractAssignmentCreate(BaseModel):
    contract_id: str = Field(..., min_length=1)
    flock_id: str = Field(..., min_length=1)
