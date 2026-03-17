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


# ── Buyers ──

class BuyerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class BuyerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class BuyerResponse(BaseModel):
    id: str
    name: str
    contact_name: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    notes: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Contracts ──

class EggContractCreate(BaseModel):
    contract_number: str = Field(..., min_length=1, max_length=50)
    buyer: str = Field(..., min_length=1, max_length=200)
    buyer_id: Optional[str] = None
    description: Optional[str] = None
    num_flocks: int = Field(1, ge=1, le=50)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    price_per_dozen: Optional[float] = Field(None, gt=0)
    grade: Optional[str] = None
    volume_committed_dozens: Optional[int] = Field(None, ge=0)
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
    buyer_id: Optional[str] = None
    description: Optional[str] = None
    num_flocks: Optional[int] = Field(None, ge=1, le=50)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    price_per_dozen: Optional[float] = None
    grade: Optional[str] = None
    volume_committed_dozens: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class EggContractResponse(BaseModel):
    id: str
    contract_number: str
    buyer: str
    buyer_id: Optional[str] = None
    description: Optional[str]
    num_flocks: int
    start_date: Optional[str]
    end_date: Optional[str]
    price_per_dozen: Optional[float]
    grade: Optional[str]
    volume_committed_dozens: Optional[int] = None
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    assigned_flocks: List[dict] = []

    model_config = {"from_attributes": True}


class ContractAssignmentCreate(BaseModel):
    contract_id: str = Field(..., min_length=1)
    flock_id: str = Field(..., min_length=1)


# ── Contract Intelligence ──

class ContractDashboardItem(BaseModel):
    id: str
    contract_number: str
    buyer: str
    grade: Optional[str]
    price_per_dozen: Optional[float]
    start_date: Optional[str]
    end_date: Optional[str]
    is_active: bool
    volume_committed_dozens: Optional[int]
    volume_shipped_dozens: int = 0
    fulfillment_pct: float = 0
    total_revenue: float = 0
    num_shipments: int = 0
    assigned_flocks: int = 0
    num_flocks: int = 1
    days_remaining: Optional[int] = None


class ContractPnL(BaseModel):
    contract_id: str
    contract_number: str
    buyer: str
    total_revenue: float = 0
    total_shipped_dozens: int = 0
    num_shipments: int = 0
    price_per_dozen: Optional[float]
    shipments: List[dict] = []


class PriceHistoryEntry(BaseModel):
    date: str
    buyer: str
    price_per_dozen: float
    grade: str = ""
    grade_label: str = ""
    source: str = ""
    reference: str = ""


class ContractAlert(BaseModel):
    contract_id: str
    contract_number: str
    buyer: str
    alert_type: str
    severity: str
    message: str
    end_date: Optional[str]
    days_remaining: Optional[int]
