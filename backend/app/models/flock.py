from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text, Date, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from decimal import Decimal
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class FlockStatus(str, enum.Enum):
    ACTIVE = "active"
    TRANSFERRED = "transferred"
    CLOSING = "closing"
    SOLD = "sold"
    CULLED = "culled"


class FlockType(str, enum.Enum):
    PULLET = "pullet"
    LAYER = "layer"


class BirdColor(str, enum.Enum):
    BROWN = "brown"
    WHITE = "white"


class SourceType(str, enum.Enum):
    HATCHED = "hatched"
    PURCHASED = "purchased"
    SPLIT = "split"


# Valid state transitions
VALID_STATUS_TRANSITIONS = {
    FlockStatus.ACTIVE: {FlockStatus.TRANSFERRED, FlockStatus.CLOSING, FlockStatus.SOLD, FlockStatus.CULLED},
    FlockStatus.TRANSFERRED: {FlockStatus.ACTIVE, FlockStatus.SOLD, FlockStatus.CULLED},
    FlockStatus.CLOSING: {FlockStatus.SOLD, FlockStatus.CULLED},
    FlockStatus.SOLD: set(),    # terminal state
    FlockStatus.CULLED: set(),  # terminal state
}


class Flock(Base, TimestampMixin):
    """A flock of birds tracked from arrival to sale."""
    __tablename__ = "flocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    flock_type: Mapped[FlockType] = mapped_column(default=FlockType.LAYER)
    bird_color: Mapped[BirdColor] = mapped_column(default=BirdColor.BROWN)
    source_type: Mapped[SourceType] = mapped_column(default=SourceType.HATCHED)
    breed: Mapped[Optional[str]] = mapped_column(String(100))
    hatch_date: Mapped[Optional[str]] = mapped_column(String(10))
    arrival_date: Mapped[str] = mapped_column(String(10), nullable=False)
    initial_bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    current_bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[FlockStatus] = mapped_column(default=FlockStatus.ACTIVE)
    cost_per_bird: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("0.0000"))
    parent_flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"), index=True)
    sold_date: Mapped[Optional[str]] = mapped_column(String(10))
    sale_price_per_bird: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4))
    closeout_date: Mapped[Optional[str]] = mapped_column(String(10))
    closeout_skids_remaining: Mapped[Optional[int]] = mapped_column(Integer)
    closeout_cases_remaining: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    parent_flock: Mapped[Optional["Flock"]] = relationship("Flock", remote_side="Flock.id", foreign_keys=[parent_flock_id])
    flock_sources: Mapped[List["FlockSource"]] = relationship("FlockSource", back_populates="layer_flock", foreign_keys="FlockSource.layer_flock_id")
    placements: Mapped[List["FlockPlacement"]] = relationship("FlockPlacement", back_populates="flock")
    mortality_records: Mapped[List["MortalityRecord"]] = relationship("MortalityRecord", back_populates="flock")
    production_records: Mapped[List["ProductionRecord"]] = relationship("ProductionRecord", back_populates="flock")
    expenses: Mapped[List["JournalEntry"]] = relationship("JournalEntry", back_populates="flock")


class FlockSource(Base, TimestampMixin):
    """Tracks which pullet flocks contributed birds to a layer flock (for merge tracking)."""
    __tablename__ = "flock_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    layer_flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    pullet_flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_per_bird: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    transfer_date: Mapped[str] = mapped_column(String(10), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    layer_flock: Mapped["Flock"] = relationship("Flock", foreign_keys=[layer_flock_id], back_populates="flock_sources")
    pullet_flock: Mapped["Flock"] = relationship("Flock", foreign_keys=[pullet_flock_id])


class MortalityRecord(Base, TimestampMixin):
    """Tracks bird deaths and culls per flock."""
    __tablename__ = "mortality_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    record_date: Mapped[str] = mapped_column(String(10), nullable=False)
    deaths: Mapped[int] = mapped_column(Integer, default=0)
    culls: Mapped[int] = mapped_column(Integer, default=0)
    cause: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    flock: Mapped["Flock"] = relationship("Flock", back_populates="mortality_records")


class ProductionRecord(Base, TimestampMixin):
    """Daily egg production per flock."""
    __tablename__ = "production_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    record_date: Mapped[str] = mapped_column(String(10), nullable=False)
    bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    egg_count: Mapped[int] = mapped_column(Integer, nullable=False)
    production_pct: Mapped[float] = mapped_column(Float, nullable=False)
    cracked: Mapped[int] = mapped_column(Integer, default=0)
    floor_eggs: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    flock: Mapped["Flock"] = relationship("Flock", back_populates="production_records")
