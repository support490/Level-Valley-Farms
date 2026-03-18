"""Seeds demo data for testing. Only runs if the database is empty."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal

from app.models.farm import Grower, Barn, BarnType, FlockPlacement
from app.models.flock import Flock, FlockStatus, FlockType, BirdColor, SourceType, MortalityRecord, ProductionRecord, FlockSource
from app.models.inventory import EggInventory, EggSale, EggGrade
from app.models.contracts import EggContract, ContractFlockAssignment
from app.models.logistics import PickupJob, PickupItem, PickupStatus, Shipment, ShipmentLine, ShipmentStatus, Driver
from app.models.equipment import Equipment, EquipmentType
from app.models.accounting import Account, JournalEntry, JournalLine, ExpenseCategory
from app.services.accounting_service import _next_entry_number


async def seed_demo_data(db: AsyncSession):
    """Seed demo data if no growers exist yet."""
    result = await db.execute(select(func.count(Grower.id)))
    if result.scalar() > 0:
        return False

    # ── Growers ──
    g1 = Grower(name="Miller Family Farms", location="1234 County Road 5, Martinsburg, PA",
                contact_name="John Miller", contact_phone="814-555-0101", contact_email="john@millerfarms.com")
    g2 = Grower(name="Weaver Poultry", location="567 Ridge Rd, Mifflinburg, PA",
                contact_name="Samuel Weaver", contact_phone="570-555-0202", contact_email="sam@weaverpoultry.com")
    g3 = Grower(name="Stoltzfus Egg Ranch", location="890 Valley View Lane, Belleville, PA",
                contact_name="Amos Stoltzfus", contact_phone="717-555-0303")
    db.add_all([g1, g2, g3])
    await db.flush()

    # ── Barns ──
    b1 = Barn(name="Miller Pullet A", barn_type=BarnType.PULLET, bird_capacity=25000, grower_id=g1.id, latitude=40.6310, longitude=-77.5700)
    b2 = Barn(name="Miller Layer 1", barn_type=BarnType.LAYER, bird_capacity=50000, grower_id=g1.id, latitude=40.6325, longitude=-77.5680)
    b3 = Barn(name="Miller Layer 2", barn_type=BarnType.LAYER, bird_capacity=50000, grower_id=g1.id, latitude=40.6340, longitude=-77.5660)
    b4 = Barn(name="Weaver Pullet House", barn_type=BarnType.PULLET, bird_capacity=20000, grower_id=g2.id, latitude=40.9200, longitude=-77.0500)
    b5 = Barn(name="Weaver Layer East", barn_type=BarnType.LAYER, bird_capacity=40000, grower_id=g2.id, latitude=40.9220, longitude=-77.0480)
    b6 = Barn(name="Stoltzfus Barn 1", barn_type=BarnType.LAYER, bird_capacity=45000, grower_id=g3.id, latitude=40.6000, longitude=-77.7200)
    db.add_all([b1, b2, b3, b4, b5, b6])
    await db.flush()

    # ── Flocks ──
    # Pullet flock at Miller's pullet barn (active, some birds will be split to layers)
    f1_pullet = Flock(flock_number="BPjm011525", flock_type=FlockType.PULLET, bird_color=BirdColor.BROWN,
                      source_type=SourceType.HATCHED, breed="Lohmann Brown", hatch_date="2025-01-15",
                      arrival_date="2025-01-17", initial_bird_count=22000, current_bird_count=0,
                      status=FlockStatus.SOLD, sold_date="2025-05-01",
                      cost_per_bird=Decimal("6.7443"))

    # Layer flocks (created from pullet splits)
    f1 = Flock(flock_number="BLjm011525", flock_type=FlockType.LAYER, bird_color=BirdColor.BROWN,
               source_type=SourceType.SPLIT, breed="Lohmann Brown", hatch_date="2025-01-15",
               arrival_date="2025-05-01", initial_bird_count=21840, current_bird_count=21840,
               cost_per_bird=Decimal("6.7443"), parent_flock_id=None)  # will set after flush
    f2 = Flock(flock_number="WLjm021025", flock_type=FlockType.LAYER, bird_color=BirdColor.WHITE,
               source_type=SourceType.SPLIT, breed="Hy-Line W-36", hatch_date="2025-02-10",
               arrival_date="2025-02-12", initial_bird_count=45000, current_bird_count=44720,
               cost_per_bird=Decimal("4.8889"))
    f3 = Flock(flock_number="WLsw040125", flock_type=FlockType.LAYER, bird_color=BirdColor.WHITE,
               source_type=SourceType.SPLIT, breed="Lohmann LSL-Classic", hatch_date="2025-04-01",
               arrival_date="2025-04-03", initial_bird_count=38000, current_bird_count=37850,
               cost_per_bird=Decimal("4.6053"))
    f4 = Flock(flock_number="BPsw062025", flock_type=FlockType.PULLET, bird_color=BirdColor.BROWN,
               source_type=SourceType.HATCHED, breed="Lohmann Brown", hatch_date="2025-06-20",
               arrival_date="2025-06-22", initial_bird_count=18000, current_bird_count=17900)
    f5 = Flock(flock_number="WLas081524", flock_type=FlockType.LAYER, bird_color=BirdColor.WHITE,
               source_type=SourceType.PURCHASED, breed="Hy-Line W-36",
               arrival_date="2024-08-15", initial_bird_count=40000, current_bird_count=0,
               status=FlockStatus.SOLD, sold_date="2025-10-01", cost_per_bird=Decimal("5.5000"))
    db.add_all([f1_pullet, f1, f2, f3, f4, f5])
    await db.flush()

    # Set parent flock reference now that we have IDs
    f1.parent_flock_id = f1_pullet.id

    # ── Flock Sources (merge tracking) ──
    fs1 = FlockSource(layer_flock_id=f1.id, pullet_flock_id=f1_pullet.id,
                      bird_count=21840, cost_per_bird=Decimal("6.7443"),
                      transfer_date="2025-05-01")
    db.add(fs1)

    # ── Placements ──
    # f1_pullet was in pullet barn, now retired
    p0 = FlockPlacement(flock_id=f1_pullet.id, barn_id=b1.id, bird_count=22000,
                        placed_date="2025-01-17", removed_date="2025-05-01", is_current=False)

    # f1 layer flock placed from split
    p1b = FlockPlacement(flock_id=f1.id, barn_id=b2.id, bird_count=21840,
                         placed_date="2025-05-01", is_current=True)
    b2.current_bird_count = 21840

    p2 = FlockPlacement(flock_id=f2.id, barn_id=b3.id, bird_count=44720,
                        placed_date="2025-02-12", is_current=True)
    b3.current_bird_count = 44720

    p3 = FlockPlacement(flock_id=f3.id, barn_id=b5.id, bird_count=37850,
                        placed_date="2025-04-03", is_current=True)
    b5.current_bird_count = 37850

    p4 = FlockPlacement(flock_id=f4.id, barn_id=b4.id, bird_count=17900,
                        placed_date="2025-06-22", is_current=True)
    b4.current_bird_count = 17900

    p5 = FlockPlacement(flock_id=f5.id, barn_id=b6.id, bird_count=40000,
                        placed_date="2024-08-15", removed_date="2025-10-01", is_current=False)
    db.add_all([p0, p1b, p2, p3, p4, p5])

    # ── Mortality Records ──
    mortalities = [
        MortalityRecord(flock_id=f1.id, record_date="2025-02-05", deaths=50, culls=10, cause="Natural attrition"),
        MortalityRecord(flock_id=f1.id, record_date="2025-03-15", deaths=80, culls=20, cause="Disease management"),
        MortalityRecord(flock_id=f2.id, record_date="2025-03-01", deaths=120, culls=30, cause="Initial settling losses"),
        MortalityRecord(flock_id=f2.id, record_date="2025-04-20", deaths=90, culls=40, cause="Heat stress"),
        MortalityRecord(flock_id=f3.id, record_date="2025-05-10", deaths=100, culls=50, cause="Standard culling"),
        MortalityRecord(flock_id=f4.id, record_date="2025-07-15", deaths=60, culls=40, cause="Arrival stress"),
    ]
    db.add_all(mortalities)

    # ── Production Records (last 30 days for active flocks) ──
    import random
    random.seed(42)  # reproducible demo data
    base_dates = []
    for i in range(30):
        day = 30 - i
        base_dates.append(f"2026-02-{11 + i:02d}" if 11 + i <= 28 else f"2026-03-{11 + i - 28:02d}")

    # Generate 30 days of production data
    for day_idx in range(30):
        d = base_dates[day_idx]
        # f1: mature layer, ~85% production
        egg1 = int(21840 * (0.82 + random.random() * 0.08))
        db.add(ProductionRecord(flock_id=f1.id, record_date=d, bird_count=21840,
                                egg_count=egg1, production_pct=round(egg1/21840*100, 1),
                                cracked=random.randint(5, 25), floor_eggs=random.randint(10, 40)))
        # f2: peak production ~90%
        egg2 = int(44720 * (0.87 + random.random() * 0.06))
        db.add(ProductionRecord(flock_id=f2.id, record_date=d, bird_count=44720,
                                egg_count=egg2, production_pct=round(egg2/44720*100, 1),
                                cracked=random.randint(10, 50), floor_eggs=random.randint(20, 60)))
        # f3: ramping up ~75%
        pct3 = 0.70 + (day_idx / 30) * 0.10 + random.random() * 0.05
        egg3 = int(37850 * pct3)
        db.add(ProductionRecord(flock_id=f3.id, record_date=d, bird_count=37850,
                                egg_count=egg3, production_pct=round(egg3/37850*100, 1),
                                cracked=random.randint(8, 30), floor_eggs=random.randint(15, 45)))

    # ── Egg Inventory ──
    # Get grade values
    grade_result = await db.execute(select(EggGrade).order_by(EggGrade.sort_order))
    grades = grade_result.scalars().all()
    grade_a_large = grades[0].value if grades else "grade_a_large"
    grade_a_medium = grades[1].value if len(grades) > 1 else "grade_a_medium"
    grade_b = grades[3].value if len(grades) > 3 else "grade_b"

    inv_records = [
        # f1 inventory
        EggInventory(flock_id=f1.id, record_date="2026-03-01", grade=grade_a_large,
                     skids_in=12, skids_out=0, skids_on_hand=12, dozens_per_skid=900),
        EggInventory(flock_id=f1.id, record_date="2026-03-05", grade=grade_a_large,
                     skids_in=8, skids_out=5, skids_on_hand=15, dozens_per_skid=900),
        EggInventory(flock_id=f1.id, record_date="2026-03-10", grade=grade_a_large,
                     skids_in=10, skids_out=0, skids_on_hand=25, dozens_per_skid=900),
        EggInventory(flock_id=f1.id, record_date="2026-03-01", grade=grade_a_medium,
                     skids_in=4, skids_out=0, skids_on_hand=4, dozens_per_skid=900),
        # f2 inventory
        EggInventory(flock_id=f2.id, record_date="2026-03-02", grade=grade_a_large,
                     skids_in=20, skids_out=0, skids_on_hand=20, dozens_per_skid=900),
        EggInventory(flock_id=f2.id, record_date="2026-03-07", grade=grade_a_large,
                     skids_in=18, skids_out=10, skids_on_hand=28, dozens_per_skid=900),
        EggInventory(flock_id=f2.id, record_date="2026-03-02", grade=grade_b,
                     skids_in=3, skids_out=0, skids_on_hand=3, dozens_per_skid=900),
        # f3 inventory
        EggInventory(flock_id=f3.id, record_date="2026-03-03", grade=grade_a_large,
                     skids_in=14, skids_out=0, skids_on_hand=14, dozens_per_skid=900),
        EggInventory(flock_id=f3.id, record_date="2026-03-08", grade=grade_a_large,
                     skids_in=12, skids_out=8, skids_on_hand=18, dozens_per_skid=900),
    ]
    db.add_all(inv_records)

    # ── Egg Sales ──
    # Get accounts for journal entries
    ar_result = await db.execute(select(Account).where(Account.account_number == "1020"))
    ar_account = ar_result.scalar_one_or_none()
    sales_result = await db.execute(select(Account).where(Account.account_number == "4010"))
    sales_account = sales_result.scalar_one_or_none()

    sale_data = [
        (f1.id, "2026-03-04", "Valley Fresh Markets", grade_a_large, 5, Decimal("0.32")),
        (f2.id, "2026-03-06", "Sunrise Grocers", grade_a_large, 10, Decimal("0.32")),
        (f2.id, "2026-03-09", "Valley Fresh Markets", grade_a_large, 8, Decimal("0.32")),
        (f3.id, "2026-03-07", "Mountain View Foods", grade_a_large, 8, Decimal("0.31")),
    ]

    for fid, sdate, buyer, grade, skids, price_per_doz in sale_data:
        total = Decimal(str(skids)) * Decimal("900") * price_per_doz

        je_id = None
        if ar_account and sales_account:
            entry_number = await _next_entry_number(db)
            je = JournalEntry(
                entry_number=entry_number, entry_date=sdate,
                description=f"Egg sale to {buyer} — {skids} skids", flock_id=fid,
            )
            db.add(je)
            await db.flush()
            db.add(JournalLine(journal_entry_id=je.id, account_id=ar_account.id,
                               debit=total, credit=Decimal("0")))
            db.add(JournalLine(journal_entry_id=je.id, account_id=sales_account.id,
                               debit=Decimal("0"), credit=total))
            je_id = je.id

        sale = EggSale(flock_id=fid, sale_date=sdate, buyer=buyer, grade=grade,
                       skids_sold=skids, price_per_dozen=price_per_doz, total_amount=total,
                       journal_entry_id=je_id)
        db.add(sale)

    # ── Contracts ──
    c1 = EggContract(contract_number="EC-2025-001", buyer="Valley Fresh Markets",
                     description="Two-flock Grade A Large contract",
                     num_flocks=2, start_date="2025-06-01", end_date="2026-06-01",
                     price_per_dozen=Decimal("0.32"), grade=grade_a_large,
                     notes="Premium buyer, weekly delivery schedule")
    c2 = EggContract(contract_number="EC-2025-002", buyer="Sunrise Grocers",
                     description="Single flock supply agreement",
                     num_flocks=1, start_date="2025-08-01", end_date="2026-08-01",
                     price_per_dozen=Decimal("0.32"), grade=grade_a_large,
                     notes="Bi-weekly delivery, 30-day payment terms")
    c3 = EggContract(contract_number="EC-2025-003", buyer="Mountain View Foods",
                     description="Grade B outlet contract",
                     num_flocks=3, start_date="2025-09-01",
                     price_per_dozen=Decimal("0.20"), grade=grade_b,
                     notes="Takes all Grade B and rejects at discount")
    db.add_all([c1, c2, c3])
    await db.flush()

    # ── Contract Assignments ──
    db.add(ContractFlockAssignment(contract_id=c1.id, flock_id=f1.id))
    db.add(ContractFlockAssignment(contract_id=c1.id, flock_id=f2.id))
    db.add(ContractFlockAssignment(contract_id=c2.id, flock_id=f2.id))
    db.add(ContractFlockAssignment(contract_id=c3.id, flock_id=f3.id))

    # ── Expenses with categories (journal entries for Layer Cost Report) ──
    # Find expense accounts
    feed_acct_result = await db.execute(select(Account).where(Account.account_number == "5010"))
    feed_acct = feed_acct_result.scalar_one_or_none()
    grower_acct_result = await db.execute(select(Account).where(Account.account_number == "5020"))
    grower_acct = grower_acct_result.scalar_one_or_none()
    chick_acct_result = await db.execute(select(Account).where(Account.account_number == "5030"))
    chick_acct = chick_acct_result.scalar_one_or_none()
    vet_acct_result = await db.execute(select(Account).where(Account.account_number == "5040"))
    vet_acct = vet_acct_result.scalar_one_or_none()
    util_acct_result = await db.execute(select(Account).where(Account.account_number == "5060"))
    util_acct = util_acct_result.scalar_one_or_none()
    other_acct_result = await db.execute(select(Account).where(Account.account_number == "5070"))
    other_acct = other_acct_result.scalar_one_or_none()
    cash_result = await db.execute(select(Account).where(Account.account_number == "1010"))
    cash_acct = cash_result.scalar_one_or_none()

    if feed_acct and cash_acct:
        # Comprehensive expenses per flock for Layer Cost Report
        all_expenses = [
            # Flock 1 expenses
            ("Pullet cost — LVF-2025-001", "2025-01-17", Decimal("148374.91"), f1.id, chick_acct, ExpenseCategory.CHICK_PURCHASE),
            ("Feed delivery Jan", "2026-01-15", Decimal("45000.00"), f1.id, feed_acct, ExpenseCategory.FEED),
            ("Feed delivery Feb", "2026-02-15", Decimal("48000.00"), f1.id, feed_acct, ExpenseCategory.FEED),
            ("Feed delivery Mar", "2026-03-01", Decimal("42000.00"), f1.id, feed_acct, ExpenseCategory.FEED),
            ("Grower payment Q1", "2026-03-01", Decimal("36000.00"), f1.id, grower_acct, ExpenseCategory.GROWER_PAYMENT),
            ("Vet service — vaccination", "2026-02-10", Decimal("3576.09"), f1.id, vet_acct, ExpenseCategory.VETERINARY),
            ("Barn electric Jan-Mar", "2026-03-05", Decimal("4500.00"), f1.id, util_acct, ExpenseCategory.SERVICE),
            ("Misc supplies", "2026-02-20", Decimal("587.61"), f1.id, other_acct, ExpenseCategory.OTHER),
            # Flock 2 expenses
            ("Pullet cost — LVF-2025-002", "2025-02-12", Decimal("220000.00"), f2.id, chick_acct, ExpenseCategory.CHICK_PURCHASE),
            ("Feed delivery Jan-Feb", "2026-02-01", Decimal("85000.00"), f2.id, feed_acct, ExpenseCategory.FEED),
            ("Feed delivery Mar", "2026-03-01", Decimal("52000.00"), f2.id, feed_acct, ExpenseCategory.FEED),
            ("Grower payment Q1", "2026-03-01", Decimal("54000.00"), f2.id, grower_acct, ExpenseCategory.GROWER_PAYMENT),
            ("Barn electric Q1", "2026-03-05", Decimal("6200.00"), f2.id, util_acct, ExpenseCategory.SERVICE),
            # Flock 3 expenses
            ("Pullet cost — LVF-2025-003", "2025-04-03", Decimal("175000.00"), f3.id, chick_acct, ExpenseCategory.CHICK_PURCHASE),
            ("Feed delivery Feb-Mar", "2026-03-01", Decimal("68000.00"), f3.id, feed_acct, ExpenseCategory.FEED),
            ("Grower payment Q1", "2026-03-01", Decimal("42000.00"), f3.id, grower_acct, ExpenseCategory.GROWER_PAYMENT),
        ]

        for desc, edate, amount, fid, expense_account, category in all_expenses:
            en = await _next_entry_number(db)
            je = JournalEntry(
                entry_number=en, entry_date=edate, description=desc,
                flock_id=fid, expense_category=category, is_posted=True,
            )
            db.add(je)
            await db.flush()
            db.add(JournalLine(journal_entry_id=je.id, account_id=expense_account.id,
                               debit=amount, credit=Decimal("0")))
            db.add(JournalLine(journal_entry_id=je.id, account_id=cash_acct.id,
                               debit=Decimal("0"), credit=amount))

    # ── Drivers ──
    d1 = Driver(driver_number="DR-0001", name="Jake Miller", phone="814-555-1010",
                license_number="PA-CDL-12345", truck_type="Freightliner M2", truck_plate="PA-EGG-101")
    d2 = Driver(driver_number="DR-0002", name="Tom Weaver", phone="570-555-2020",
                license_number="PA-CDL-67890", truck_type="International CV", truck_plate="PA-EGG-202")
    db.add_all([d1, d2])
    await db.flush()

    # ── Equipment ──
    tr1 = Equipment(equipment_number="TR-0001", name="Blue Freightliner", equipment_type=EquipmentType.TRUCK,
                    license_plate="PA-EGG-101", notes="Primary pickup truck")
    tr2 = Equipment(equipment_number="TR-0002", name="White International", equipment_type=EquipmentType.TRUCK,
                    license_plate="PA-EGG-202", notes="Secondary truck")
    tl1 = Equipment(equipment_number="TL-0001", name="Reefer Trailer A", equipment_type=EquipmentType.TRAILER,
                    capacity_skids=26, weight_limit_lbs=Decimal("44000"), license_plate="PA-TRL-301",
                    notes="26 skid capacity, refrigerated")
    tl2 = Equipment(equipment_number="TL-0002", name="Reefer Trailer B", equipment_type=EquipmentType.TRAILER,
                    capacity_skids=26, weight_limit_lbs=Decimal("44000"), license_plate="PA-TRL-302")
    tl3 = Equipment(equipment_number="TL-0003", name="Short Trailer", equipment_type=EquipmentType.TRAILER,
                    capacity_skids=16, weight_limit_lbs=Decimal("30000"), license_plate="PA-TRL-303",
                    notes="Smaller trailer for single-barn runs")
    db.add_all([tr1, tr2, tl1, tl2, tl3])
    await db.flush()

    # Hook trailer A to truck 1, trailer B parked at Miller Layer 1
    tl1.hooked_to_id = tr1.id
    tl2.current_barn_id = b2.id

    # ── Pickup Jobs ──
    pu1 = PickupJob(pickup_number="PU-000001", scheduled_date="2026-03-10",
                    driver_name="Jake Miller", driver_id=d1.id, trailer_id=tl1.id,
                    status=PickupStatus.COMPLETED, completed_date="2026-03-10")
    pu2 = PickupJob(pickup_number="PU-000002", scheduled_date="2026-03-12",
                    driver_name="Jake Miller", driver_id=d1.id, trailer_id=tl1.id,
                    status=PickupStatus.COMPLETED, completed_date="2026-03-12")
    pu3 = PickupJob(pickup_number="PU-000003", scheduled_date="2026-03-14",
                    driver_name="Tom Weaver", driver_id=d2.id,
                    status=PickupStatus.PENDING,
                    notes="Pickup from all 3 active layer barns")
    db.add_all([pu1, pu2, pu3])
    await db.flush()

    # Completed pickup items
    db.add(PickupItem(pickup_job_id=pu1.id, barn_id=b2.id, flock_id=f1.id,
                      skids_estimated=8, skids_actual=8, grade=grade_a_large))
    db.add(PickupItem(pickup_job_id=pu1.id, barn_id=b3.id, flock_id=f2.id,
                      skids_estimated=15, skids_actual=14, grade=grade_a_large))
    db.add(PickupItem(pickup_job_id=pu2.id, barn_id=b5.id, flock_id=f3.id,
                      skids_estimated=10, skids_actual=10, grade=grade_a_large))
    db.add(PickupItem(pickup_job_id=pu2.id, barn_id=b3.id, flock_id=f2.id,
                      skids_estimated=12, skids_actual=12, grade=grade_a_large))
    # Pending pickup items
    db.add(PickupItem(pickup_job_id=pu3.id, barn_id=b2.id, flock_id=f1.id,
                      skids_estimated=10))
    db.add(PickupItem(pickup_job_id=pu3.id, barn_id=b3.id, flock_id=f2.id,
                      skids_estimated=18))
    db.add(PickupItem(pickup_job_id=pu3.id, barn_id=b5.id, flock_id=f3.id,
                      skids_estimated=12))

    # ── Shipments with BOLs ──
    sh1 = Shipment(shipment_number="SH-000001", bol_number="BOL-2026-0301",
                   contract_id=c1.id, ship_date="2026-03-05", buyer="Valley Fresh Markets",
                   carrier="Valley Express Trucking", destination="123 Market St, Philadelphia, PA",
                   status=ShipmentStatus.DELIVERED, notes="Weekly delivery")
    sh2 = Shipment(shipment_number="SH-000002", bol_number="BOL-2026-0308",
                   contract_id=c2.id, ship_date="2026-03-08", buyer="Sunrise Grocers",
                   carrier="PA Freight Lines", destination="456 Commerce Ave, Harrisburg, PA",
                   status=ShipmentStatus.SHIPPED)
    sh3 = Shipment(shipment_number="SH-000003", bol_number="BOL-2026-0312",
                   contract_id=c1.id, ship_date="2026-03-12", buyer="Valley Fresh Markets",
                   carrier="Valley Express Trucking", destination="123 Market St, Philadelphia, PA",
                   status=ShipmentStatus.PENDING, notes="Next weekly delivery")
    db.add_all([sh1, sh2, sh3])
    await db.flush()

    # Shipment lines
    db.add(ShipmentLine(shipment_id=sh1.id, flock_id=f1.id, grade=grade_a_large,
                        skids=5, dozens_per_skid=900, price_per_dozen=Decimal("0.32")))
    db.add(ShipmentLine(shipment_id=sh1.id, flock_id=f2.id, grade=grade_a_large,
                        skids=5, dozens_per_skid=900, price_per_dozen=Decimal("0.32")))
    db.add(ShipmentLine(shipment_id=sh2.id, flock_id=f2.id, grade=grade_a_large,
                        skids=8, dozens_per_skid=900, price_per_dozen=Decimal("0.32")))
    db.add(ShipmentLine(shipment_id=sh3.id, flock_id=f1.id, grade=grade_a_large,
                        skids=6, dozens_per_skid=900, price_per_dozen=Decimal("0.32")))
    db.add(ShipmentLine(shipment_id=sh3.id, flock_id=f2.id, grade=grade_a_large,
                        skids=8, dozens_per_skid=900, price_per_dozen=Decimal("0.32")))

    await db.commit()
    return True
