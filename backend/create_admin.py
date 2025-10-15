"""
Script to create an initial admin user
Run this script to set up the first admin user for the system
"""
from database import SessionLocal, engine, Base
from models import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_admin_user():
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if admin already exists
        existing_admin = db.query(User).filter(User.username == "admin").first()
        if existing_admin:
            print("Admin user already exists!")
            return
        
        # Create admin user
        hashed_password = pwd_context.hash("admin")
        admin = User(
            username="admin",
            email="admin@videomonitor.local",
            full_name="System Administrator",
            hashed_password=hashed_password,
            role="admin",
            is_active=True
        )
        db.add(admin)
        db.commit()
        print("Admin user created successfully!")
        print("  Username: admin")
        print("  Password: admin")
        print("  Please change the password after first login!")
    except Exception as e:
        print(f"Error creating admin user: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_admin_user()
