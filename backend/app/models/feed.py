from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from decimal import Decimal
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class FeedType(str, enum.Enum):
    LAYER = "layer"
    PULLET = "pullet"
    STARTER = "starter"
    GROWER = "grower"
    PRE_LAY = "pre_lay"
    OTHER = "other"


class POStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class VendorType(str, enum.Enum):
    FEED = "feed"
    MEDICATION = "medication"
    SUPPLIES = "supplies"
    EQUIPMENT = "equipment"
    OTHER = "other"


class Vendor(Base, TimestampMixin):
    """A supply vendor (feed mill, pharmacy, etc.)."""
    __tablename__ = "vendors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor_type: Mapped[VendorType] = mapped_column(default=VendorType.OTHER)
    contact_name: Mapped[Optional[str]] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(200))
    address: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    fax: Mapped[Optional[str]] = mapped_column(String(50))
    website: Mapped[Optional[str]] = mapped_column(String(200))
    terms: Mapped[Optional[str]] = mapped_column(String(50), default="Net 30")
    tax_id: Mapped[Optional[str]] = mapped_column(String(50))
    is_1099: Mapped[bool] = mapped_column(Boolean, default=False)


class FeedDelivery(Base, TimestampMixin):
    """A feed delivery ticket from the feed mill."""
    __tablename__ = "feed_deliveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    ticket_number: Mapped[str] = mapped_column(String(100), nullable=False)
    barn_id: Mapped[str] = mapped_column(String(36), ForeignKey("barns.id"), nullable=False, index=True)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"), index=True)
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    delivery_date: Mapped[str] = mapped_column(String(10), nullable=False)
    feed_type: Mapped[FeedType] = mapped_column(default=FeedType.LAYER)
    tons: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    cost_per_ton: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    total_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    barn: Mapped["Barn"] = relationship("Barn")
    flock: Mapped[Optional["Flock"]] = relationship("Flock")
    vendor: Mapped[Optional["Vendor"]] = relationship("Vendor")


class Medication(Base, TimestampMixin):
    """A medication or vaccine in inventory."""
    __tablename__ = "medications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), default="dose")
    quantity_on_hand: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    reorder_level: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    cost_per_unit: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    vendor: Mapped[Optional["Vendor"]] = relationship("Vendor")
    administrations: Mapped[List["MedicationAdmin"]] = relationship("MedicationAdmin", back_populates="medication")


class MedicationAdmin(Base, TimestampMixin):
    """Record of a medication/vaccine administered to a flock."""
    __tablename__ = "medication_admins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    medication_id: Mapped[str] = mapped_column(String(36), ForeignKey("medications.id"), nullable=False, index=True)
    admin_date: Mapped[str] = mapped_column(String(10), nullable=False)
    dosage: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    administered_by: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    flock: Mapped["Flock"] = relationship("Flock")
    medication: Mapped["Medication"] = relationship("Medication", back_populates="administrations")


class PurchaseOrder(Base, TimestampMixin):
    """A purchase order to a vendor."""
    __tablename__ = "purchase_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    po_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendors.id"), nullable=False, index=True)
    order_date: Mapped[str] = mapped_column(String(10), nullable=False)
    expected_date: Mapped[Optional[str]] = mapped_column(String(10))
    status: Mapped[POStatus] = mapped_column(default=POStatus.DRAFT)
    total_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    vendor: Mapped["Vendor"] = relationship("Vendor")
    lines: Mapped[List["PurchaseOrderLine"]] = relationship("PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan")


class PurchaseOrderLine(Base, TimestampMixin):
    """Line item on a purchase order."""
    __tablename__ = "purchase_order_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    po_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_orders.id"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), default="each")
    unit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    total: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    purchase_order: Mapped["PurchaseOrder"] = relationship("PurchaseOrder", back_populates="lines")
