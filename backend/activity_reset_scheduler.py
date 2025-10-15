"""
Activity Reset Scheduler
Automatically resets monthly event counters on the first day of each month.
"""

import os
import schedule
import time
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from activity_tracking_service import ActivityTrackingService
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:ZUzXgq<<5sivAc4fSeX|~c|#s~#C@monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com:5432/videomonitoring")

def reset_monthly_counters():
    """Reset all monthly event counters"""
    logger.info("🔄 Starting monthly counter reset...")

    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()

        service = ActivityTrackingService(db)
        service.reset_monthly_counters()

        db.close()
        logger.info("✅ Monthly counter reset completed successfully")

    except Exception as e:
        logger.error(f"❌ Error resetting monthly counters: {e}")


def check_and_run_monthly_reset():
    """Check if it's the first day of the month and reset if needed"""
    now = datetime.now()

    # Check if it's the first day of the month
    if now.day == 1:
        # Check if we've already run today (avoid multiple resets)
        last_run_file = "/tmp/activity_reset_last_run.txt"

        try:
            if os.path.exists(last_run_file):
                with open(last_run_file, "r") as f:
                    last_run = f.read().strip()
                    if last_run == now.strftime("%Y-%m-%d"):
                        logger.info("Monthly reset already completed today")
                        return
        except Exception as e:
            logger.error(f"Error checking last run: {e}")

        # Run the reset
        reset_monthly_counters()

        # Record that we ran today
        try:
            with open(last_run_file, "w") as f:
                f.write(now.strftime("%Y-%m-%d"))
        except Exception as e:
            logger.error(f"Error recording last run: {e}")


def run_scheduler():
    """Run the scheduler that checks daily for monthly resets"""
    logger.info("📅 Activity Reset Scheduler started")
    logger.info("Will check daily at 00:01 for monthly counter reset")

    # Schedule daily check at 00:01
    schedule.every().day.at("00:01").do(check_and_run_monthly_reset)

    # Also check immediately on startup (in case scheduler was down on the 1st)
    check_and_run_monthly_reset()

    # Keep running
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute


if __name__ == "__main__":
    run_scheduler()
