from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date


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
    flock_number: str = Field(..., min_length=1, max_length=50)
    breed: Optional[str] = Field(None, max_length=100)
    hatch_date: Optional[str] = None
    arrival_date: str
    initial_bird_count: int = Field(..., gt=0, le=10000000)
    barn_id: str = Field(..., min_length=1)
    notes: Optional[str] = None

    @field_validator("flock_number", mode="before")
    @classmethod
    def strip_flock_number(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Flock number cannot be empty")
        return v

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

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in ("active", "transferred", "sold", "culled"):
            raise ValueError("status must be one of: active, transferred, sold, culled")
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
    breed: Optional[str]
    hatch_date: Optional[str]
    arrival_date: str
    initial_bird_count: int
    current_bird_count: int
    status: str
    sold_date: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    current_barn: Optional[str] = None
    current_barn_id: Optional[str] = None
    current_grower: Optional[str] = None

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
