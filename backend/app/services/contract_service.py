from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.contracts import EggContract, ContractFlockAssignment
from app.models.flock import Flock
from app.schemas.contracts import EggContractCreate, EggContractUpdate, ContractAssignmentCreate


async def get_all_contracts(db: AsyncSession, active_only: bool = False):
    query = select(EggContract).order_by(EggContract.contract_number)
    if active_only:
        query = query.where(EggContract.is_active == True)
    result = await db.execute(query)
    contracts = result.scalars().all()
    return [await _contract_to_dict(db, c) for c in contracts]


async def get_contract(db: AsyncSession, contract_id: str):
    contract = await db.get(EggContract, contract_id)
    if not contract:
        return None
    return await _contract_to_dict(db, contract)


async def create_contract(db: AsyncSession, data: EggContractCreate):
    existing = await db.execute(
        select(EggContract).where(EggContract.contract_number == data.contract_number)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Contract number '{data.contract_number}' already exists")

    contract = EggContract(**data.model_dump())
    db.add(contract)
    await db.commit()
    await db.refresh(contract)
    return await _contract_to_dict(db, contract)


async def update_contract(db: AsyncSession, contract_id: str, data: EggContractUpdate):
    contract = await db.get(EggContract, contract_id)
    if not contract:
        return None

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(contract, key, val)

    await db.commit()
    await db.refresh(contract)
    return await _contract_to_dict(db, contract)


async def delete_contract(db: AsyncSession, contract_id: str):
    contract = await db.get(EggContract, contract_id)
    if not contract:
        return False
    # Soft-delete: deactivate
    contract.is_active = False
    await db.commit()
    return True


async def assign_flock(db: AsyncSession, data: ContractAssignmentCreate):
    contract = await db.get(EggContract, data.contract_id)
    if not contract:
        raise ValueError("Contract not found")
    if not contract.is_active:
        raise ValueError("Contract is not active")

    flock = await db.get(Flock, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    # Check if already assigned
    existing = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.contract_id == data.contract_id,
            ContractFlockAssignment.flock_id == data.flock_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Flock is already assigned to this contract")

    # Check num_flocks limit
    count_result = await db.execute(
        select(func.count(ContractFlockAssignment.id)).where(
            ContractFlockAssignment.contract_id == data.contract_id
        )
    )
    current_count = count_result.scalar()
    if current_count >= contract.num_flocks:
        raise ValueError(f"Contract already has {current_count}/{contract.num_flocks} flocks assigned")

    assignment = ContractFlockAssignment(
        contract_id=data.contract_id,
        flock_id=data.flock_id,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return await _contract_to_dict(db, contract)


async def unassign_flock(db: AsyncSession, contract_id: str, flock_id: str):
    result = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.contract_id == contract_id,
            ContractFlockAssignment.flock_id == flock_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        return False
    await db.delete(assignment)
    await db.commit()
    return True


async def get_contracts_for_flock(db: AsyncSession, flock_id: str):
    result = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.flock_id == flock_id
        )
    )
    assignments = result.scalars().all()
    contracts = []
    for a in assignments:
        contract = await db.get(EggContract, a.contract_id)
        if contract:
            contracts.append(await _contract_to_dict(db, contract))
    return contracts


async def _contract_to_dict(db: AsyncSession, contract: EggContract) -> dict:
    # Get assigned flocks
    result = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.contract_id == contract.id
        )
    )
    assignments = result.scalars().all()
    assigned_flocks = []
    for a in assignments:
        flock = await db.get(Flock, a.flock_id)
        if flock:
            assigned_flocks.append({
                "assignment_id": a.id,
                "flock_id": flock.id,
                "flock_number": flock.flock_number,
            })

    return {
        "id": contract.id,
        "contract_number": contract.contract_number,
        "buyer": contract.buyer,
        "description": contract.description,
        "num_flocks": contract.num_flocks,
        "start_date": contract.start_date,
        "end_date": contract.end_date,
        "price_per_dozen": float(contract.price_per_dozen) if contract.price_per_dozen else None,
        "grade": contract.grade,
        "notes": contract.notes,
        "is_active": contract.is_active,
        "created_at": contract.created_at,
        "updated_at": contract.updated_at,
        "assigned_flocks": assigned_flocks,
    }
