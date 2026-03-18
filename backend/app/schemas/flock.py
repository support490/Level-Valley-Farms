from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


def _validate_date_str(v: str, field_name: str) -> str:
    """Validate that a string is a valid YYYY-MM-DD date."""
    if not v:
        raise ValueError(f"{field_name} is required")
    try:
        date.fromisoformat(v)
    except (ValueError, TypeError):
        raise ValueError(f"{field_name} must be a valid date in YYYY-MM-DD format")
    return v


class FlockCreate(BaseModel):
    flock_number: Optional[str] = Field(None, max_length=50)
    flock_type: str = Field("layer", pattern="^(pullet|layer)$")
    bird_color: str = Field("brown", pattern="^(brown|white)$")
    source_type: str = Field("hatched", pattern="^(hatched|purchased|split)$")
    breed: Optional[str] = Field(None, max_length=100)
    hatch_date: Optional[str] = None
    arrival_date: str
    initial_bird_count: int = Field(..., gt=0, le=10000000)
    barn_id: str = Field(..., min_length=1)
    grower_id: Optional[str] = Field(None, min_length=1)
    cost_per_bird: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None

    @field_validator("arrival_date")
    @classmethod
    def validate_arrival_date(cls, v):
        return _validate_date_str(v, "arrival_date")

    @field_validator("hatch_date")
    @classmethod
    def validate_hatch_date(cls, v):
        if v is not None and v != "":
            return _validate_date_str(v, "hatch_date")
        return v


class FlockUpdate(BaseModel):
    breed: Optional[str] = Field(None, max_length=100)
    hatch_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    sold_date: Optional[str] = None
    sale_price_per_bird: Optional[Decimal] = None
    cost_per_bird: Optional[Decimal] = None
    bird_weight: Optional[float] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in ("active", "transferred", "sold", "culled", "closing"):
            raise ValueError("status must be one of: active, transferred, sold, culled, closing")
        return v

    @field_validator("sold_date")
    @classmethod
    def validate_sold_date(cls, v):
        if v is not None and v != "":
            return _validate_date_str(v, "sold_date")
        return v


class FlockResponse(BaseModel):
    id: str
    flock_number: str
    flock_type: str
    bird_color: str
    source_type: str
    breed: Optional[str]
    hatch_date: Optional[str]
    arrival_date: str
    initial_bird_count: int
    current_bird_count: int
    status: str
    cost_per_bird: Decimal = Decimal("0.0000")
    bird_weight: Optional[float] = None
    parent_flock_id: Optional[str] = None
    parent_flock_number: Optional[str] = None
    sold_date: Optional[str]
    sale_price_per_bird: Optional[Decimal] = None
    closeout_date: Optional[str] = None
    closeout_skids_remaining: Optional[int] = None
    closeout_cases_remaining: Optional[int] = None
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    current_barn: Optional[str] = None
    current_barn_id: Optional[str] = None
    current_grower: Optional[str] = None
    flock_sources: Optional[List["FlockSourceResponse"]] = None
    flock_age_weeks: Optional[int] = None
    months_laying: Optional[int] = None
    current_production_pct: Optional[float] = None
    total_mortality: Optional[int] = None
    mortality_pct: Optional[float] = None

    model_config = {"from_attributes": True}


class FlockSourceResponse(BaseModel):
    id: str
    pullet_flock_id: str
    pullet_flock_number: str = ""
    bird_count: int
    cost_per_bird: Decimal
    transfer_date: str

    model_config = {"from_attributes": True}


class PlacementResponse(BaseModel):
    id: str
    flock_id: str
    barn_id: str
    barn_name: str = ""
    grower_name: str = ""
    barn_type: str = ""
    bird_count: int
    placed_date: str
    removed_date: Optional[str]
    is_current: bool

    model_config = {"from_attributes": True}


class TransferRequest(BaseModel):
    source_barn_id: str = Field(..., min_length=1)
    destination_barn_id: str = Field(..., min_length=1)
    bird_count: int = Field(..., gt=0)
    transfer_date: str
    notes: Optional[str] = None

    @field_validator("transfer_date")
    @classmethod
    def validate_transfer_date(cls, v):
        return _validate_date_str(v, "transfer_date")

    @field_validator("destination_barn_id")
    @classmethod
    def validate_different_barns(cls, v, info):
        if info.data.get("source_barn_id") and v == info.data["source_barn_id"]:
            raise ValueError("Source and destination barn cannot be the same")
        return v


class SplitRequest(BaseModel):
    """Split birds from a pullet flock to a layer barn."""
    destination_barn_id: str = Field(..., min_length=1)
    bird_count: int = Field(..., gt=0)
    transfer_date: str
    layer_flock_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None

    @field_validator("transfer_date")
    @classmethod
    def validate_transfer_date(cls, v):
        return _validate_date_str(v, "transfer_date")


class PulletSaleRequest(BaseModel):
    """Sell pullets from a pullet flock."""
    bird_count: int = Field(..., gt=0)
    price_per_bird: Decimal = Field(..., gt=0)
    sale_date: str
    buyer: str = Field(..., min_length=1)
    notes: Optional[str] = None

    @field_validator("sale_date")
    @classmethod
    def validate_sale_date(cls, v):
        return _validate_date_str(v, "sale_date")


class OutsidePurchaseRequest(BaseModel):
    """Purchase pullets from an outside source directly into a layer barn."""
    bird_color: str = Field("brown", pattern="^(brown|white)$")
    breed: Optional[str] = Field(None, max_length=100)
    hatch_date: Optional[str] = None
    arrival_date: str
    bird_count: int = Field(..., gt=0, le=10000000)
    cost_per_bird: Decimal = Field(..., gt=0)
    barn_id: str = Field(..., min_length=1)
    flock_number: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None

    @field_validator("arrival_date")
    @classmethod
    def validate_arrival_date(cls, v):
        return _validate_date_str(v, "arrival_date")

    @field_validator("hatch_date")
    @classmethod
    def validate_hatch_date(cls, v):
        if v is not None and v != "":
            return _validate_date_str(v, "hatch_date")
        return v


class CloseoutRequest(BaseModel):
    """Initiate flock closeout with remaining inventory."""
    skids_remaining: int = Field(0, ge=0)
    cases_remaining: int = Field(0, ge=0)
    closeout_date: str
    notes: Optional[str] = None

    @field_validator("closeout_date")
    @classmethod
    def validate_closeout_date(cls, v):
        return _validate_date_str(v, "closeout_date")


class MortalityCreate(BaseModel):
    flock_id: str = Field(..., min_length=1)
    record_date: str
    deaths: int = Field(0, ge=0)
    culls: int = Field(0, ge=0)
    cause: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None

    @field_validator("record_date")
    @classmethod
    def validate_record_date(cls, v):
        return _validate_date_str(v, "record_date")

    @field_validator("culls")
    @classmethod
    def validate_total_loss(cls, v, info):
        deaths = info.data.get("deaths", 0)
        if deaths + v == 0:
            raise ValueError("Must record at least one death or cull")
        return v


class MortalityResponse(BaseModel):
    id: str
    flock_id: str
    flock_number: str = ""
    record_date: str
    deaths: int
    culls: int
    cause: Optional[str]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
