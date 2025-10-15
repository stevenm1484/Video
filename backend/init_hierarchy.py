"""
Initialize default hierarchy:
- Group: Statewide
- Dealer: A209 (under Statewide)
- Link existing VideoAccounts to A209
- Update admin user to be super_admin
"""

from database import SessionLocal
from models import User, Group, Dealer, VideoAccount
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def init_hierarchy():
    db = SessionLocal()
    try:
        # 1. Create Group "Statewide"
        statewide_group = db.query(Group).filter(Group.name == "Statewide").first()
        if not statewide_group:
            statewide_group = Group(name="Statewide")
            db.add(statewide_group)
            db.commit()
            db.refresh(statewide_group)
            print(f"✓ Created Group: Statewide (ID: {statewide_group.id})")
        else:
            print(f"✓ Group already exists: Statewide (ID: {statewide_group.id})")

        # 2. Create Dealer "A209" under Statewide
        a209_dealer = db.query(Dealer).filter(Dealer.name == "A209").first()
        if not a209_dealer:
            a209_dealer = Dealer(name="A209", group_id=statewide_group.id)
            db.add(a209_dealer)
            db.commit()
            db.refresh(a209_dealer)
            print(f"✓ Created Dealer: A209 (ID: {a209_dealer.id}) under Group Statewide")
        else:
            print(f"✓ Dealer already exists: A209 (ID: {a209_dealer.id})")

        # 3. Update all existing VideoAccounts to be under A209
        accounts = db.query(VideoAccount).all()
        for account in accounts:
            if account.dealer_id is None:
                account.dealer_id = a209_dealer.id
                print(f"  - Linked account '{account.name}' (#{account.account_number}) to Dealer A209")

        db.commit()
        print(f"✓ Updated {len(accounts)} account(s) to be under Dealer A209")

        # 4. Update admin user to super_admin role
        admin_user = db.query(User).filter(User.username == "admin").first()
        if admin_user:
            if admin_user.role != "super_admin":
                admin_user.role = "super_admin"
                db.commit()
                print(f"✓ Updated admin user to super_admin role")
            else:
                print(f"✓ Admin user already has super_admin role")
        else:
            print("⚠ Warning: No 'admin' user found. Creating one...")
            admin_user = User(
                username="admin",
                email="admin@statewide.com",
                full_name="Super Administrator",
                hashed_password=pwd_context.hash("admin"),
                role="super_admin",
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            print("✓ Created super_admin user (username: admin, password: admin)")

        print("\n" + "="*60)
        print("Hierarchy initialized successfully!")
        print("="*60)
        print(f"Structure: Group 'Statewide' → Dealer 'A209' → {len(accounts)} Customer(s)")
        print("\nYou can now:")
        print("- Create additional groups via API: POST /api/groups")
        print("- Create dealers via API: POST /api/dealers")
        print("- Assign users to groups/dealers/customers")
        print("="*60)

    except Exception as e:
        print(f"Error initializing hierarchy: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_hierarchy()
