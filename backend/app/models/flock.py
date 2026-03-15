from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class FlockStatus(str, enum.Enum):
    ACTIVE = "active"
    TRANSFERRED = "transferred"
    SOLD = "sold"
    CULLED = "culled"


# Valid state transitions
VALID_STATUS_TRANSITIONS = {
    FlockStatus.ACTIVE: {FlockStatus.TRANSFERRED, FlockStatus.SOLD, FlockStatus.CULLED},
    FlockStatus.TRANSFERRED: {FlockStatus.ACTIVE, FlockStatus.SOLD, FlockStatus.CULLED},
    FlockStatus.SOLD: set(),    # terminal state
    FlockStatus.CULLED: set(),  # terminal state
}


class Flock(Base, TimestampMixin):
    """A flock of birds tracked from arrival to sale."""
    __tablename__ = "flocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    breed: Mapped[Optional[str]] = mapped_column(String(100))
    hatch_date: Mapped[Optional[str]] = mapped_column(String(10))
    arrival_date: Mapped[str] = mapped_column(String(10), nullable=False)
    initial_bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    current_bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[FlockStatus] = mapped_column(default=FlockStatus.ACTIVE)
    sold_date: Mapped[Optional[str]] = mapped_column(String(10))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    placements: Mapped[List["FlockPlacement"]] = relationship("FlockPlacement", back_populates="flock")
    mortality_records: Mapped[List["MortalityRecord"]] = relationship("MortalityRecord", back_populates="flock")
    production_records: Mapped[List["ProductionRecord"]] = relationship("ProductionRecord", back_populates="flock")
    expenses: Mapped[List["JournalEntry"]] = relationship("JournalEntry", back_populates="flock")


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
