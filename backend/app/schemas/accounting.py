from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal, InvalidOperation


def _validate_date_str(v: str, field_name: str) -> str:
    if not v:
        raise ValueError(f"{field_name} is required")
    try:
        date.fromisoformat(v)
    except (ValueError, TypeError):
        raise ValueError(f"{field_name} must be a valid date in YYYY-MM-DD format")
    return v


def _validate_amount(v) -> float:
    """Validate and round monetary amounts to 2 decimal places."""
    try:
        val = float(v)
    except (TypeError, ValueError):
        raise ValueError("Must be a valid number")
    if val < 0:
        raise ValueError("Amount cannot be negative")
    return round(val, 2)


class AccountCreate(BaseModel):
    account_number: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=200)
    account_type: str
    parent_id: Optional[str] = None
    description: Optional[str] = None

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, v):
        valid = ("asset", "liability", "equity", "revenue", "expense")
        if v not in valid:
            raise ValueError(f"account_type must be one of: {', '.join(valid)}")
        return v


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    parent_id: Optional[str] = None


class AccountResponse(BaseModel):
    id: str
    account_number: str
    name: str
    account_type: str
    parent_id: Optional[str]
    description: Optional[str]
    is_active: bool
    balance: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JournalLineCreate(BaseModel):
    account_id: str = Field(..., min_length=1)
    debit: float = 0.0
    credit: float = 0.0
    description: Optional[str] = None

    @field_validator("debit", "credit", mode="before")
    @classmethod
    def round_amount(cls, v):
        return _validate_amount(v)

    @field_validator("credit")
    @classmethod
    def validate_not_both(cls, v, info):
        debit = info.data.get("debit", 0.0)
        if debit > 0 and v > 0:
            raise ValueError("A journal line cannot have both a debit and credit amount")
        if debit == 0 and v == 0:
            raise ValueError("A journal line must have either a debit or credit amount")
        return v


class JournalEntryCreate(BaseModel):
    entry_date: str
    description: str = Field(..., min_length=1, max_length=500)
    flock_id: Optional[str] = None
    expense_category: Optional[str] = None
    reference: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    lines: List[JournalLineCreate] = Field(..., min_length=2)

    @field_validator("entry_date")
    @classmethod
    def validate_entry_date(cls, v):
        return _validate_date_str(v, "entry_date")

    @field_validator("expense_category")
    @classmethod
    def validate_category(cls, v):
        if v is not None:
            valid = ("feed", "grower_payment", "flock_cost", "veterinary", "service",
                     "chick_purchase", "transport", "utilities", "other")
            if v not in valid:
                raise ValueError(f"expense_category must be one of: {', '.join(valid)}")
        return v


class JournalEntryUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    flock_id: Optional[str] = None
    expense_category: Optional[str] = None
    reference: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None


class JournalLineResponse(BaseModel):
    id: str
    journal_entry_id: str
    account_id: str
    account_name: str = ""
    account_number: str = ""
    debit: float
    credit: float
    description: Optional[str]

    model_config = {"from_attributes": True}


class JournalEntryResponse(BaseModel):
    id: str
    entry_number: str
    entry_date: str
    description: str
    flock_id: Optional[str]
    flock_number: Optional[str] = None
    expense_category: Optional[str]
    reference: Optional[str]
    is_posted: bool
    notes: Optional[str]
    lines: List[JournalLineResponse] = []
    total_debit: float = 0.0
    total_credit: float = 0.0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QuickExpenseCreate(BaseModel):
    entry_date: str
    description: str = Field(..., min_length=1, max_length=500)
    amount: float = Field(..., gt=0)
    expense_category: str
    flock_id: Optional[str] = None
    reference: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    expense_account_id: str = Field(..., min_length=1)
    payment_account_id: str = Field(..., min_length=1)

    @field_validator("entry_date")
    @classmethod
    def validate_entry_date(cls, v):
        return _validate_date_str(v, "entry_date")

    @field_validator("amount", mode="before")
    @classmethod
    def round_amount(cls, v):
        val = _validate_amount(v)
        if val <= 0:
            raise ValueError("Amount must be greater than zero")
        return val

    @field_validator("expense_category")
    @classmethod
    def validate_category(cls, v):
        valid = ("feed", "grower_payment", "flock_cost", "veterinary", "service",
                 "chick_purchase", "transport", "utilities", "other")
        if v not in valid:
            raise ValueError(f"expense_category must be one of: {', '.join(valid)}")
        return v


class TrialBalanceRow(BaseModel):
    account_id: str
    account_number: str
    account_name: str
    account_type: str
    debit_balance: float
    credit_balance: float


class TrialBalanceResponse(BaseModel):
    as_of_date: str
    rows: List[TrialBalanceRow]
    total_debits: float
    total_credits: float
    is_balanced: bool


class AccountLedgerEntry(BaseModel):
    entry_date: str
    entry_number: str
    description: str
    debit: float
    credit: float
    running_balance: float
    journal_entry_id: str
    flock_number: Optional[str] = None


class RecurringEntryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=500)
    frequency: str
    amount: float = Field(..., gt=0)
    expense_account_id: str = Field(..., min_length=1)
    payment_account_id: str = Field(..., min_length=1)
    flock_id: Optional[str] = None
    expense_category: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    auto_post: bool = False
    notes: Optional[str] = None

    @field_validator("frequency")
    @classmethod
    def validate_frequency(cls, v):
        valid = ("weekly", "biweekly", "monthly", "quarterly", "annually")
        if v not in valid:
            raise ValueError(f"frequency must be one of: {', '.join(valid)}")
        return v

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, v):
        return _validate_date_str(v, "start_date")

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, v):
        if v:
            return _validate_date_str(v, "end_date")
        return v


class RecurringEntryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    flock_id: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None
    auto_post: Optional[bool] = None
    notes: Optional[str] = None


class RecurringEntryResponse(BaseModel):
    id: str
    name: str
    description: str
    frequency: str
    amount: float
    expense_account_id: str
    expense_account_name: str = ""
    payment_account_id: str
    payment_account_name: str = ""
    flock_id: Optional[str]
    flock_number: Optional[str] = None
    expense_category: Optional[str]
    start_date: str
    end_date: Optional[str]
    last_generated_date: Optional[str]
    next_due_date: Optional[str]
    is_active: bool
    auto_post: bool
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class FiscalPeriodCreate(BaseModel):
    period_name: str = Field(..., min_length=1, max_length=50)
    start_date: str
    end_date: str

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_dates(cls, v):
        return _validate_date_str(v, "date")


class FiscalPeriodResponse(BaseModel):
    id: str
    period_name: str
    start_date: str
    end_date: str
    is_closed: bool
    closed_date: Optional[str]
    closed_by: Optional[str]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
