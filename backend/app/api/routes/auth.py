from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel, Field

from app.db.database import get_db
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ── Schemas ──

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=4)
    full_name: str = Field(..., min_length=1, max_length=200)
    role: str = "manager"
    email: Optional[str] = None


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# ── Helper: get current user (optional — doesn't block if no token) ──

async def get_current_user_optional(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    if not token:
        return None
    payload = auth_service.decode_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = await auth_service.get_user_by_id(db, user_id)
    return user


# ── Routes ──

@router.post("/login", response_model=LoginResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await auth_service.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = auth_service.create_access_token({"sub": user.id, "username": user.username, "role": user.role.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": auth_service._user_to_dict(user),
    }


@router.post("/register")
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.create_user(
            db, data.username, data.password, data.full_name, data.role, data.email
        )
        return auth_service._user_to_dict(user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me")
async def get_me(user=Depends(get_current_user_optional)):
    if not user:
        return None
    return auth_service._user_to_dict(user)


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db)):
    return await auth_service.get_all_users(db)


@router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdateRequest, db: AsyncSession = Depends(get_db)):
    update_data = data.model_dump(exclude_unset=True)
    result = await auth_service.update_user(db, user_id, **update_data)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


# ── Notifications ──

@router.get("/notifications")
async def list_notifications(
    unread_only: bool = Query(False),
    user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    return await auth_service.get_notifications(db, user_id, unread_only)


@router.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, db: AsyncSession = Depends(get_db)):
    if not await auth_service.mark_notification_read(db, notif_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked as read"}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    user_id = user.id if user else None
    await auth_service.mark_all_read(db, user_id)
    return {"message": "All notifications marked as read"}


# ── Activity Feed ──

@router.get("/activity/{entity_type}/{entity_id}")
async def entity_activity(entity_type: str, entity_id: str, db: AsyncSession = Depends(get_db)):
    return await auth_service.get_entity_activity(db, entity_type, entity_id)
