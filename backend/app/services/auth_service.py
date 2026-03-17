from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from datetime import datetime, timedelta, timezone
from typing import Optional

from passlib.context import CryptContext
from jose import jwt, JWTError

from app.core.config import settings
from app.models.auth import User, UserRole, Notification
from app.models.settings import AuditLog

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_minutes: int = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# ── User CRUD ──

async def authenticate_user(db: AsyncSession, username: str, password: str):
    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


async def get_user_by_id(db: AsyncSession, user_id: str):
    return await db.get(User, user_id)


async def get_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, username: str, password: str, full_name: str,
                      role: str = "manager", email: str = None):
    existing = await get_user_by_username(db, username)
    if existing:
        raise ValueError(f"Username '{username}' already exists")

    user = User(
        username=username,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=UserRole(role),
        email=email,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_all_users(db: AsyncSession):
    result = await db.execute(select(User).order_by(User.full_name))
    return [_user_to_dict(u) for u in result.scalars().all()]


async def update_user(db: AsyncSession, user_id: str, **kwargs):
    user = await db.get(User, user_id)
    if not user:
        return None
    for key, value in kwargs.items():
        if key == "password":
            user.hashed_password = hash_password(value)
        elif key == "role":
            user.role = UserRole(value)
        elif hasattr(user, key):
            setattr(user, key, value)
    await db.commit()
    await db.refresh(user)
    return _user_to_dict(user)


async def seed_admin_user(db: AsyncSession):
    """Create default admin user if none exists."""
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar() or 0
    if count == 0:
        await create_user(db, "admin", "admin", "Administrator", "owner", "admin@lvf.com")


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
    }


# ── Notifications ──

async def create_notification(db: AsyncSession, title: str, message: str,
                               notification_type: str = "info",
                               user_id: str = None,
                               entity_type: str = None, entity_id: str = None):
    notif = Notification(
        user_id=user_id, title=title, message=message,
        notification_type=notification_type,
        entity_type=entity_type, entity_id=entity_id,
    )
    db.add(notif)
    await db.commit()
    return notif


async def get_notifications(db: AsyncSession, user_id: str = None, unread_only: bool = False):
    query = select(Notification).order_by(Notification.created_at.desc()).limit(50)
    if user_id:
        # Show user-specific + broadcast (user_id=None)
        query = query.where(
            (Notification.user_id == user_id) | (Notification.user_id.is_(None))
        )
    if unread_only:
        query = query.where(Notification.is_read == False)
    result = await db.execute(query)
    return [{
        "id": n.id, "user_id": n.user_id, "title": n.title,
        "message": n.message, "notification_type": n.notification_type,
        "entity_type": n.entity_type, "entity_id": n.entity_id,
        "is_read": n.is_read, "created_at": n.created_at,
    } for n in result.scalars().all()]


async def mark_notification_read(db: AsyncSession, notif_id: str):
    notif = await db.get(Notification, notif_id)
    if notif:
        notif.is_read = True
        await db.commit()
    return notif is not None


async def mark_all_read(db: AsyncSession, user_id: str = None):
    query = update(Notification).where(Notification.is_read == False)
    if user_id:
        query = query.where(
            (Notification.user_id == user_id) | (Notification.user_id.is_(None))
        )
    query = query.values(is_read=True)
    await db.execute(query)
    await db.commit()


# ── Audit Trail ──

async def log_audit(db: AsyncSession, action: str, entity_type: str,
                    description: str, entity_id: str = None,
                    user: str = "system", details: str = None):
    entry = AuditLog(
        action=action, entity_type=entity_type,
        entity_id=entity_id, description=description,
        details=details, user=user,
    )
    db.add(entry)
    await db.commit()


# ── Activity Feed ──

async def get_entity_activity(db: AsyncSession, entity_type: str, entity_id: str):
    """Get audit log entries for a specific entity."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.created_at.desc())
        .limit(20)
    )
    return [{
        "id": a.id, "action": a.action, "entity_type": a.entity_type,
        "entity_id": a.entity_id, "description": a.description,
        "details": a.details, "user": a.user, "created_at": a.created_at,
    } for a in result.scalars().all()]
