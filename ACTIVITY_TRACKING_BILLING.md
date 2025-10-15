# Activity Tracking & Billing Feature

## Overview

The Activity Tracking & Billing feature allows you to monitor event counts per account and camera for billing purposes. It includes automatic threshold warnings and auto-snooze capabilities to manage high-volume accounts.

## Key Features

### 1. Monthly Event Counting
- **Account Level**: Tracks total events for the entire account
- **Camera Level**: Tracks events per individual camera
- **Automatic Reset**: Counters reset automatically on the 1st of each month

### 2. Activity Threshold Warning
- Set a numerical threshold (e.g., 100 events)
- When reached, sends email notifications to:
  - Customer contacts (account level)
  - Dealer contacts
  - Group contacts
  - Country contacts
- **Email Type**: `activity_threshold_warning`
- Can be configured at account or camera level

### 3. Activity Auto-Snooze
- Set a numerical threshold (e.g., 200 events)
- When reached, automatically snoozes the account or camera
- **No new events will be created** while auto-snoozed
- **Unsnooze Requirements**:
  - Must provide NEW thresholds higher than current count
  - Cannot unsnooze without increasing limits
- Prevents runaway billing

### 4. Camera-Level Overrides
- Each camera can override account-level settings
- `NULL` value means "use account default"
- Allows fine-grained control per camera

## Database Schema

### VideoAccount Table
```sql
monthly_event_count INTEGER DEFAULT 0
activity_threshold_warning INTEGER NULL  -- Warning threshold
activity_snooze_threshold INTEGER NULL   -- Auto-snooze threshold
activity_last_warning_sent_at TIMESTAMP NULL
activity_auto_snoozed_at TIMESTAMP NULL  -- When auto-snooze triggered
activity_billing_period_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP
activity_billing_period_end TIMESTAMP NULL
```

### Camera Table
```sql
monthly_event_count INTEGER DEFAULT 0
activity_threshold_warning INTEGER NULL  -- Override account setting
activity_snooze_threshold INTEGER NULL   -- Override account setting
activity_last_warning_sent_at TIMESTAMP NULL
activity_auto_snoozed_at TIMESTAMP NULL
```

## API Endpoints

### Get Activity Statistics

#### Account Stats
```http
GET /api/accounts/{account_id}/activity-stats
```

Response:
```json
{
  "account_id": 1,
  "account_name": "Video Doorman",
  "monthly_event_count": 150,
  "activity_threshold_warning": 100,
  "activity_snooze_threshold": 200,
  "activity_last_warning_sent_at": "2025-10-15T12:00:00",
  "activity_auto_snoozed_at": null,
  "activity_billing_period_start": "2025-10-01T00:00:00",
  "is_auto_snoozed": false,
  "snoozed_until": null
}
```

#### Camera Stats
```http
GET /api/cameras/{camera_id}/activity-stats
```

Response:
```json
{
  "camera_id": 5,
  "camera_name": "Front Door",
  "account_id": 1,
  "monthly_event_count": 75,
  "activity_threshold_warning": null,  // NULL = uses account default
  "activity_snooze_threshold": null,
  "activity_last_warning_sent_at": null,
  "activity_auto_snoozed_at": null,
  "is_auto_snoozed": false,
  "snoozed_until": null,
  "account_monthly_event_count": 150,
  "account_activity_threshold_warning": 100,
  "account_activity_snooze_threshold": 200
}
```

### Update Thresholds

#### Account Thresholds
```http
PUT /api/accounts/{account_id}/activity-thresholds
Content-Type: application/json

{
  "warning_threshold": 100,
  "snooze_threshold": 200
}
```

#### Camera Thresholds (Override)
```http
PUT /api/cameras/{camera_id}/activity-thresholds
Content-Type: application/json

{
  "warning_threshold": 50,
  "snooze_threshold": 100
}
```

Set to `null` to use account default:
```json
{
  "warning_threshold": null,
  "snooze_threshold": null
}
```

### Unsnooze After Auto-Snooze

#### Unsnooze Account
```http
POST /api/accounts/{account_id}/unsnooze-activity
Content-Type: application/json

{
  "new_warning_threshold": 300,
  "new_snooze_threshold": 400
}
```

**Important**: New thresholds MUST be higher than current `monthly_event_count`.

#### Unsnooze Camera
```http
POST /api/cameras/{camera_id}/unsnooze-activity
Content-Type: application/json

{
  "new_warning_threshold": 150,
  "new_snooze_threshold": 200
}
```

## Email Notifications

### Activity Threshold Warning Email

**Sent to**: Customer, Dealer, Group, Country (based on notification settings)

**Email Type**: `activity_threshold_warning`

**Trigger**: When `monthly_event_count >= activity_threshold_warning`

**Content Example**:
```
Subject: Activity Threshold Warning - Video Doorman

Activity Threshold Warning

Account: Video Doorman
Account Number: ACC123456

Current Event Count: 100
Warning Threshold: 100
Snooze Threshold: 200

This account has reached its activity warning threshold for the current billing period.

To avoid automatic snoozing, please:
1. Review and adjust the thresholds if needed
2. Contact support if you need to increase limits

Billing Period: 2025-10-01 to present
```

### Auto-Snooze Notification Email

**Sent to**: Same as warning emails

**Trigger**: When `monthly_event_count >= activity_snooze_threshold`

**Content Example**:
```
Subject: Account Auto-Snoozed - Video Doorman

Account Automatically Snoozed

Account: Video Doorman
Account Number: ACC123456

Event Count: 200
Snooze Threshold: 200

This account has been automatically snoozed because it reached its activity threshold.

All cameras under this account are now snoozed and will not generate new events.

To unsnooze this account:
1. Log into the dashboard
2. Navigate to the account settings
3. Click "Unsnooze"
4. You MUST increase both the warning and snooze thresholds

Note: The account will remain snoozed until manually reactivated with increased thresholds.
```

## Email Configuration

To receive activity tracking emails, configure notification emails at any level:

### Account Level
```json
{
  "notification_emails": [
    {
      "email": "billing@customer.com",
      "type": "activity_threshold_warning"
    },
    {
      "email": "admin@customer.com",
      "type": "all"
    }
  ]
}
```

### Dealer/Group/Country Level
Same format as account level. Emails cascade up the hierarchy.

## Monthly Reset Scheduler

### How It Works
1. **Scheduler runs daily at 00:01**
2. **On 1st of each month**:
   - Resets all `monthly_event_count` to 0
   - Clears `activity_last_warning_sent_at`
   - Clears `activity_auto_snoozed_at`
   - Auto-unsnoozed accounts/cameras (fresh start each month)
   - Records `activity_billing_period_end`
   - Updates `activity_billing_period_start`

### Running the Scheduler

#### Manual Run (for testing)
```bash
cd /var/www/videomonitoring/backend
/var/www/videomonitoring/venv/bin/python3 activity_reset_scheduler.py
```

#### As a Service (Production)
Create systemd service: `/etc/systemd/system/activity-reset-scheduler.service`

```ini
[Unit]
Description=Activity Tracking Monthly Reset Scheduler
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/var/www/videomonitoring/backend
ExecStart=/var/www/videomonitoring/venv/bin/python3 activity_reset_scheduler.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable activity-reset-scheduler
sudo systemctl start activity-reset-scheduler
sudo systemctl status activity-reset-scheduler
```

## Frontend Integration (TODO)

The frontend needs to be updated to display and manage these settings:

### Account Detail Page
- Show current event count with progress bar
- Display warning/snooze thresholds
- Show "Auto-Snoozed" badge if applicable
- Add "Activity Tracking" section with:
  - Warning Threshold input
  - Snooze Threshold input
  - Current count display
  - Billing period dates
  - Unsnooze button (if auto-snoozed)

### Camera Settings
- Same as account, but with "Use Account Default" checkbox
- Show both camera and account counts

### Dashboard
- Badge indicator for auto-snoozed accounts
- Warning indicator when approaching threshold

## Usage Examples

### Example 1: Basic Setup
```bash
# Set account thresholds
curl -X PUT http://localhost:8000/api/accounts/1/activity-thresholds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warning_threshold": 100,
    "snooze_threshold": 200
  }'
```

### Example 2: Camera Override
```bash
# Set higher limit for specific camera
curl -X PUT http://localhost:8000/api/cameras/5/activity-thresholds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warning_threshold": 500,
    "snooze_threshold": 1000
  }'
```

### Example 3: Unsnooze After Reaching Limit
```bash
# Unsnooze account with increased thresholds
curl -X POST http://localhost:8000/api/accounts/1/unsnooze-activity \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "new_warning_threshold": 300,
    "new_snooze_threshold": 400
  }'
```

### Example 4: Check Activity Stats
```bash
# Get account activity statistics
curl http://localhost:8000/api/accounts/1/activity-stats \
  -H "Authorization: Bearer $TOKEN"
```

## Files Created/Modified

### New Files
- `backend/add_activity_tracking.py` - Migration script
- `backend/activity_tracking_service.py` - Core service logic
- `backend/activity_reset_scheduler.py` - Monthly reset scheduler
- `ACTIVITY_TRACKING_BILLING.md` - This documentation

### Modified Files
- `backend/models.py` - Added activity tracking columns
- `backend/main.py` - Added API endpoints
- `backend/smtp_server.py` - Integrated activity counter increment

## Testing

### Test Activity Tracking
```python
# Run this in Python shell
from database import SessionLocal
from activity_tracking_service import ActivityTrackingService

db = SessionLocal()
service = ActivityTrackingService(db)

# Increment event count
service.increment_event_count(camera_id=1)

# Check stats
from models import Camera, VideoAccount
camera = db.query(Camera).filter(Camera.id == 1).first()
print(f"Camera count: {camera.monthly_event_count}")

account = db.query(VideoAccount).filter(VideoAccount.id == camera.account_id).first()
print(f"Account count: {account.monthly_event_count}")
```

### Test Monthly Reset
```python
from activity_tracking_service import ActivityTrackingService
from database import SessionLocal

db = SessionLocal()
service = ActivityTrackingService(db)
service.reset_monthly_counters()
```

## Billing Integration

The `monthly_event_count` field can be used for billing:

```sql
-- Generate billing report for current month
SELECT
    va.id,
    va.name,
    va.account_number,
    va.monthly_event_count,
    va.activity_billing_period_start,
    va.activity_billing_period_end
FROM video_accounts va
WHERE va.activity_billing_period_start >= DATE_TRUNC('month', CURRENT_DATE);

-- Per-camera breakdown
SELECT
    c.account_id,
    va.name as account_name,
    c.id as camera_id,
    c.name as camera_name,
    c.monthly_event_count
FROM cameras c
JOIN video_accounts va ON c.account_id = va.id
WHERE va.activity_billing_period_start >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY c.account_id, c.id;
```

## Troubleshooting

### Counter not incrementing
- Check SMTP server logs: `sudo tail -f /var/log/videomonitoring-error.log | grep Activity`
- Verify database columns exist: `\d video_accounts` in psql
- Check if service is being called in smtp_server.py

### Email not sending
- Verify notification_emails are configured on account/dealer/group
- Check email type includes "activity_threshold_warning" or "all"
- Review email service logs

### Monthly reset not working
- Check scheduler service status: `sudo systemctl status activity-reset-scheduler`
- View scheduler logs: `sudo journalctl -u activity-reset-scheduler -f`
- Verify /tmp/activity_reset_last_run.txt file

## Support

For questions or issues, contact the development team or reference this documentation.
