from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class BarnInline(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    barn_type: str = Field("layer", pattern="^(pullet|layer)$")
    bird_capacity: int = Field(..., gt=0)
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class GrowerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    location: str = Field(..., min_length=1, max_length=500)
    contact_name: Optional[str] = Field(None, max_length=200)
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    barns: Optional[List[BarnInline]] = None

    @field_validator("name", "location", mode="before")
    @classmethod
    def strip_whitespace(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Field cannot be empty or whitespace only")
        return v


class GrowerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    location: Optional[str] = Field(None, min_length=1, max_length=500)
    contact_name: Optional[str] = Field(None, max_length=200)
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: Optional[bool] = None

    @field_validator("name", "location", mode="before")
    @classmethod
    def strip_whitespace(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Field cannot be empty or whitespace only")
        return v


class BarnDetail(BaseModel):
    id: str
    name: str
    barn_type: str
    bird_capacity: int
    current_bird_count: int = 0
    is_active: bool = True
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    current_flock_id: Optional[str] = None
    current_flock_number: Optional[str] = None
    current_flock_status: Optional[str] = None


class GrowerResponse(BaseModel):
    id: str
    name: str
    location: str
    contact_name: Optional[str]
    contact_phone: Optional[str]
    contact_email: Optional[str]
    notes: Optional[str]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GrowerListResponse(GrowerResponse):
    barn_count: int = 0
    total_bird_capacity: int = 0
    total_current_birds: int = 0
    barns: Optional[List[BarnDetail]] = None
