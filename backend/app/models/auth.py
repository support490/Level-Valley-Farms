from sqlalchemy import String, Integer, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class UserRole(str, enum.Enum):
    OWNER = "owner"
    MANAGER = "manager"
    DRIVER = "driver"
    GROWER = "grower"


class User(Base, TimestampMixin):
    """Application user with role-based access."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(200))
    hashed_password: Mapped[str] = mapped_column(String(500), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(default=UserRole.MANAGER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Notification(Base, TimestampMixin):
    """In-app notification for a user."""
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    notification_type: Mapped[str] = mapped_column(String(50), default="info")
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[str]] = mapped_column(String(36))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
