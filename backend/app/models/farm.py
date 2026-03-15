from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Enum as SAEnum, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class BarnType(str, enum.Enum):
    PULLET = "pullet"
    LAYER = "layer"


class Grower(Base, TimestampMixin):
    """A grower farm that operates under Level Valley."""
    __tablename__ = "growers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str] = mapped_column(String(500), nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(String(200))
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50))
    contact_email: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    barns: Mapped[List["Barn"]] = relationship("Barn", back_populates="grower", cascade="all, delete-orphan")


class Barn(Base, TimestampMixin):
    """A barn (pullet or layer) at a grower farm."""
    __tablename__ = "barns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    barn_type: Mapped[BarnType] = mapped_column(SAEnum(BarnType), nullable=False)
    bird_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    current_bird_count: Mapped[int] = mapped_column(Integer, default=0)
    grower_id: Mapped[str] = mapped_column(String(36), ForeignKey("growers.id"), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    grower: Mapped["Grower"] = relationship("Grower", back_populates="barns")
    flock_placements: Mapped[List["FlockPlacement"]] = relationship("FlockPlacement", back_populates="barn")


class FlockPlacement(Base, TimestampMixin):
    """Tracks which flock is in which barn and when."""
    __tablename__ = "flock_placements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    barn_id: Mapped[str] = mapped_column(String(36), ForeignKey("barns.id"), nullable=False, index=True)
    bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    placed_date: Mapped[str] = mapped_column(String(10), nullable=False)
    removed_date: Mapped[Optional[str]] = mapped_column(String(10))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)

    flock: Mapped["Flock"] = relationship("Flock", back_populates="placements")
    barn: Mapped["Barn"] = relationship("Barn", back_populates="flock_placements")
