#!/usr/bin/env python3
import sys
sys.path.insert(0, '/var/www/videomonitoring/backend')

from database import SessionLocal, engine, Base
from models import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Create database session
db = SessionLocal()

# Find admin user
admin = db.query(User).filter(User.username == "admin").first()

if admin:
    # Reset password to 'admin'
    admin.hashed_password = pwd_context.hash("admin")
    admin.access_level = "country"
    admin.role_type = "admin"
    db.commit()
    print("✓ Admin password reset to 'admin'")
    print(f"  Username: {admin.username}")
    print(f"  Access Level: {admin.access_level}")
    print(f"  Role Type: {admin.role_type}")
else:
    print("✗ Admin user not found!")

db.close()
