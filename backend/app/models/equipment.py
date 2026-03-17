from sqlalchemy import String, Integer, Boolean, ForeignKey, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from decimal import Decimal
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class EquipmentType(str, enum.Enum):
    TRUCK = "truck"
    TRAILER = "trailer"


class Equipment(Base, TimestampMixin):
    """A truck or trailer used to transport eggs."""
    __tablename__ = "equipment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    equipment_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    equipment_type: Mapped[EquipmentType] = mapped_column(nullable=False)
    capacity_skids: Mapped[int] = mapped_column(Integer, default=0)
    weight_limit_lbs: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    license_plate: Mapped[Optional[str]] = mapped_column(String(50))
    hooked_to_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("equipment.id"), unique=True, index=True
    )
    current_barn_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("barns.id"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Self-referential: trailer.hooked_to -> truck
    hooked_to: Mapped[Optional["Equipment"]] = relationship(
        "Equipment", remote_side="Equipment.id", foreign_keys=[hooked_to_id]
    )
    current_barn: Mapped[Optional["Barn"]] = relationship("Barn")
