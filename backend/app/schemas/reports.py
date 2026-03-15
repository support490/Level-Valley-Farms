from pydantic import BaseModel
from typing import Optional, List


class FlockExpenseBreakdown(BaseModel):
    category: str
    total: float
    per_bird: float = 0
    per_dozen_eggs: float = 0
    entry_count: int


class FlockReportResponse(BaseModel):
    flock_id: str
    flock_number: str
    breed: Optional[str]
    status: str
    arrival_date: str
    sold_date: Optional[str]
    initial_bird_count: int
    current_bird_count: int
    total_deaths: int
    total_culls: int
    mortality_pct: float
    expenses_by_category: List[FlockExpenseBreakdown]
    total_expenses: float
    total_revenue: float
    net_profit_loss: float
    expense_per_bird: float = 0
    gross_income_per_bird: float = 0
    net_profit_per_bird: float = 0
    eggs_produced_dozens: float = 0
    dozens_per_bird_housed: float = 0
    avg_sale_price_per_dozen: float = 0
    feed_purchased_tons: float = 0
    feed_conversion_lbs_per_doz: float = 0
    current_cost_per_bird: float = 0
    production_summary: dict
    placement_history: List[dict]
    contracts: List[dict] = []


class IncomeStatementRow(BaseModel):
    account_id: str
    account_number: str
    account_name: str
    amount: float


class IncomeStatementResponse(BaseModel):
    period_from: str
    period_to: str
    revenue: List[IncomeStatementRow]
    total_revenue: float
    expenses: List[IncomeStatementRow]
    total_expenses: float
    net_income: float


class BalanceSheetSection(BaseModel):
    accounts: List[IncomeStatementRow]
    total: float


class BalanceSheetResponse(BaseModel):
    as_of_date: str
    assets: BalanceSheetSection
    liabilities: BalanceSheetSection
    equity: BalanceSheetSection
    total_liabilities_equity: float
    is_balanced: bool
