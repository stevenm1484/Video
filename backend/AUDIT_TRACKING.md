# Comprehensive Audit Tracking System

## Overview
All alarm events and alarms are now tracked with detailed timestamps and user information in PostgreSQL for complete auditing and reporting capabilities.

## Database Tables

### 1. `alarm_events` Table
Tracks individual events received from cameras with complete lifecycle timestamps:

**Event Receipt:**
- `timestamp` - When event was received from camera (UTC)
- `camera_id` - Which camera sent the event

**Claim/View Tracking:**
- `claimed_by` / `claimed_at` - Who claimed the account and when
- `viewed_by` / `viewed_at` - Who opened the event detail and when

**Dismissal Tracking:**
- `dismissed_by` / `dismissed_at` - Who dismissed the event and when

**Escalation Tracking:**
- `escalated_by` / `escalated_at` - Who escalated the event and when

**Hold Tracking:**
- `held_by` / `held_at` - Who put the event on hold and when
- `unheld_by` / `unheld_at` - Who took it off hold and when

### 2. `alarms` Table
Tracks alarms generated from events with full handling timestamps:

**Alarm Generation:**
- `created_by` / `created_at` - Who generated the alarm and when
- `event_id` - Link to original event

**View Tracking:**
- `viewed_by` / `viewed_at` - Who opened the alarm detail screen and when

**Resolution Tracking:**
- `resolved_by` / `resolved_at` - Who resolved the alarm and when
- `resolution` - How it was resolved (Video Dispatched, Video False, etc.)

**Hold Tracking:**
- `held_by` / `held_at` - Who put the alarm on hold and when
- `unheld_by` / `unheld_at` - Who took it off hold and when

### 3. `alarm_audit_log` Table
Comprehensive log of all actions taken on events and alarms:

**Structure:**
- `id` - Unique log entry ID
- `event_id` - Related event (if applicable)
- `alarm_id` - Related alarm (if applicable)
- `action` - Action taken (see Actions list below)
- `user_id` / `username` - Who performed the action
- `timestamp` - When action occurred (UTC)
- `details` - Additional context as JSON
- `created_at` - When log entry was created

**Actions Tracked:**
- `event_received` - Event arrived from camera
- `event_claimed` - Operator claimed the account
- `event_viewed` - Operator opened event detail
- `event_dismissed` - Event was dismissed
- `event_escalated` - Event was escalated
- `alarm_generated` - Alarm was created from event
- `alarm_viewed` - Alarm detail screen opened
- `alarm_held` - Alarm put on hold
- `alarm_unheld` - Alarm taken off hold
- `alarm_resolved` - Alarm resolved/closed

### 4. `account_claims` Table
Tracks which operator is handling which account:

- `account_id` - Account being handled
- `user_id` - Operator handling it
- `claimed_at` - When operator claimed it
- `last_activity` - Last interaction timestamp
- `expires_at` - Auto-release time

## Time Metrics Available

### Event Metrics:
1. **Time to Claim**: `claimed_at - timestamp`
   - How long before operator claimed the event

2. **Time to View**: `viewed_at - timestamp`
   - How long before operator opened event detail

3. **Time to Action**: `(dismissed_at OR escalated_at) - timestamp`
   - How long before operator took action

4. **Event Handling Duration**: `(dismissed_at OR escalated_at) - claimed_at`
   - How long operator spent on the event

5. **Hold Duration**: `unheld_at - held_at`
   - How long event was on hold

### Alarm Metrics:
1. **Generation Time**: `alarm.created_at - event.timestamp`
   - Time between event receipt and alarm generation

2. **Time to View**: `viewed_at - created_at`
   - How long before operator opened alarm detail

3. **Time on Screen**: `resolved_at - viewed_at`
   - How long alarm was on screen before resolution

4. **Total Resolution Time**: `resolved_at - created_at`
   - Total time from alarm generation to resolution

5. **Hold Duration**: `unheld_at - held_at`
   - How long alarm was on hold

6. **Total Handling Time**: `resolved_at - (event.claimed_at OR alarm.created_at)`
   - Total time from first interaction to resolution

## SQL Query Examples

### Get average response time per operator:
```sql
SELECT
    u.username,
    AVG(EXTRACT(EPOCH FROM (ae.claimed_at - ae.timestamp))) as avg_response_seconds,
    COUNT(*) as events_handled
FROM alarm_events ae
JOIN users u ON ae.claimed_by = u.id
WHERE ae.claimed_at IS NOT NULL
GROUP BY u.username
ORDER BY avg_response_seconds;
```

### Get alarm resolution time breakdown:
```sql
SELECT
    a.id as alarm_id,
    u.username as operator,
    ae.timestamp as event_received,
    a.created_at as alarm_generated,
    a.viewed_at as alarm_viewed,
    a.resolved_at as alarm_resolved,
    EXTRACT(EPOCH FROM (a.viewed_at - a.created_at)) as seconds_to_view,
    EXTRACT(EPOCH FROM (a.resolved_at - a.viewed_at)) as seconds_on_screen,
    EXTRACT(EPOCH FROM (a.resolved_at - a.created_at)) as total_seconds
FROM alarms a
JOIN alarm_events ae ON a.event_id = ae.id
JOIN users u ON a.created_by = u.id
WHERE a.resolved_at IS NOT NULL
ORDER BY a.created_at DESC
LIMIT 100;
```

### Get hold time statistics:
```sql
SELECT
    u.username as held_by,
    u2.username as unheld_by,
    a.id as alarm_id,
    a.held_at,
    a.unheld_at,
    EXTRACT(EPOCH FROM (a.unheld_at - a.held_at))/60 as hold_minutes
FROM alarms a
LEFT JOIN users u ON a.held_by = u.id
LEFT JOIN users u2 ON a.unheld_by = u2.id
WHERE a.held_at IS NOT NULL AND a.unheld_at IS NOT NULL
ORDER BY a.held_at DESC;
```

### Get complete audit trail for an alarm:
```sql
SELECT
    aal.timestamp,
    aal.action,
    aal.username,
    aal.details
FROM alarm_audit_log aal
WHERE aal.alarm_id = 123
ORDER BY aal.timestamp;
```

## Report Capabilities

With this audit system, you can generate reports on:

1. **Operator Performance:**
   - Average response time
   - Average resolution time
   - Number of alarms handled
   - Time spent per alarm

2. **System Metrics:**
   - Event volume by time period
   - Peak hours analysis
   - Average handling times
   - Hold time analysis

3. **Compliance/Audit:**
   - Complete timeline of who did what and when
   - All status changes with timestamps
   - User activity logs
   - Hold/unhold tracking

4. **Account Analysis:**
   - Which accounts generate most alarms
   - Average resolution time per account
   - False alarm rates
   - Response time trends

## Implementation Status

✅ **Completed:**
- Database schema created with all audit columns
- `alarm_audit_log` table created
- `AlarmAuditLog` model added to models.py
- All timestamp columns added to existing tables

🔄 **Next Steps (To Be Implemented):**
- Update SMTP server to log `event_received` action
- Update claim endpoint to log `event_claimed` and set `claimed_at`
- Update view endpoints to log `alarm_viewed` and set `viewed_at`
- Update hold/unhold endpoints to log actions and set timestamps
- Update resolve endpoint to set `resolved_by`
- Create helper function for logging audit actions
- Create API endpoints for audit reports
- Create dashboard for viewing metrics

## Helper Function (To Be Added)

```python
def log_audit_action(
    db: Session,
    action: str,
    user_id: int = None,
    username: str = None,
    event_id: int = None,
    alarm_id: int = None,
    details: dict = None
):
    """
    Log an audit action to alarm_audit_log table

    Args:
        db: Database session
        action: Action name (e.g., 'alarm_viewed', 'event_claimed')
        user_id: User ID who performed action
        username: Username who performed action
        event_id: Related event ID
        alarm_id: Related alarm ID
        details: Additional context as dictionary
    """
    audit_log = AlarmAuditLog(
        event_id=event_id,
        alarm_id=alarm_id,
        action=action,
        user_id=user_id,
        username=username,
        details=details
    )
    db.add(audit_log)
    db.commit()
```
