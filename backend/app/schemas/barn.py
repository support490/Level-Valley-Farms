from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


class BarnCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    barn_type: str  # "pullet" or "layer"
    bird_capacity: int = Field(..., gt=0, le=1000000)
    grower_id: str = Field(..., min_length=1)
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator("barn_type")
    @classmethod
    def validate_barn_type(cls, v):
        if v not in ("pullet", "layer"):
            raise ValueError("barn_type must be 'pullet' or 'layer'")
        return v

    @field_validator("name", mode="before")
    @classmethod
    def strip_whitespace(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Barn name cannot be empty")
        return v


class BarnUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    barn_type: Optional[str] = None
    bird_capacity: Optional[int] = Field(None, gt=0, le=1000000)
    grower_id: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator("barn_type")
    @classmethod
    def validate_barn_type(cls, v):
        if v is not None and v not in ("pullet", "layer"):
            raise ValueError("barn_type must be 'pullet' or 'layer'")
        return v


class BarnResponse(BaseModel):
    id: str
    name: str
    barn_type: str
    bird_capacity: int
    current_bird_count: int
    grower_id: str
    grower_name: str = ""
    is_active: bool
    notes: Optional[str]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
