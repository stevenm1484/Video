# Receiving Status Audit Tracking

## Overview
Complete audit logging system for tracking when users are in "RECEIVING" vs "NOT RECEIVING" mode, including reasons for all state changes.

## Audit Actions Tracked

### 1. Manual Receiving State Changes
**Action**: `receiving_enabled` or `receiving_disabled`
**Details**: `{"manual_toggle": True}`
**Location**: `/api/users/me/receiving-status` endpoint (main.py:741-749)
**Trigger**: User manually clicks the RECEIVING/NOT RECEIVING toggle button

### 2. Auto-Disable on Page Refresh
**Action**: `receiving_auto_disabled`
**Details**: `{"reason": "page_refresh"}`
**Location**: Dashboard.jsx:31, auto-disable endpoint (main.py:826-833)
**Trigger**: User refreshes the dashboard page or first loads it

### 3. Auto-Disable on Tab Blur
**Action**: `receiving_auto_disabled`
**Details**: `{"reason": "tab_blur"}`
**Location**: Dashboard.jsx:64, auto-disable endpoint
**Trigger**: User switches to a different browser tab or minimizes the window

### 4. Auto-Disable When Active Event Claimed
**Action**: `receiving_auto_disabled`
**Details**: `{"reason": "active_event"}`
**Location**: Dashboard.jsx:86, auto-disable endpoint
**Trigger**: User has an active event assigned to them on the dashboard

### 5. Auto-Disable on Alarm Navigation
**Action**: `receiving_auto_disabled`
**Details**: `{"reason": "alarm_navigation"}`
**Location**: Dashboard.jsx:662, auto-disable endpoint
**Trigger**: User clicks "Alarm" button to navigate to alarm detail screen

### 6. Auto-Disable on Logout
**Action**: `receiving_auto_disabled`
**Details**: `{"reason": "logout"}`
**Location**: Logout endpoint (main.py:786-796)
**Trigger**: User logs out of the system

## Database Tables

### user_activity_log
Primary table for all receiving state audit tracking:
```sql
CREATE TABLE user_activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    username VARCHAR(255),
    action VARCHAR(50),  -- receiving_enabled, receiving_disabled, receiving_auto_disabled
    timestamp TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    ip_address VARCHAR(45),
    details JSON,  -- Contains "reason" or "manual_toggle" flags
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);
```

## Viewing Audit Logs

### Using view_user_activity.py
```bash
/var/www/videomonitoring/venv/bin/python /var/www/videomonitoring/backend/view_user_activity.py
```

This script shows:
- All user activity in the last 24 hours
- Summary by action type
- User login/logout sessions with durations
- **Receiving state changes with reasons**

### SQL Query Examples

**View all receiving state changes for a specific user:**
```sql
SELECT
    timestamp,
    action,
    details
FROM user_activity_log
WHERE username = 'admin'
AND action IN ('receiving_enabled', 'receiving_disabled', 'receiving_auto_disabled')
ORDER BY timestamp DESC
LIMIT 20;
```

**Calculate receiving uptime for a user:**
```sql
WITH state_changes AS (
    SELECT
        timestamp,
        action,
        CASE WHEN action = 'receiving_enabled' THEN 1 ELSE 0 END as is_on
    FROM user_activity_log
    WHERE username = 'admin'
    AND action IN ('receiving_enabled', 'receiving_disabled', 'receiving_auto_disabled')
    ORDER BY timestamp
)
-- Calculate duration in receiving state
SELECT
    SUM(
        CASE WHEN is_on = 1
        THEN EXTRACT(EPOCH FROM (LEAD(timestamp) OVER (ORDER BY timestamp) - timestamp))
        ELSE 0
        END
    ) / 60 as receiving_minutes
FROM state_changes;
```

**Count reasons for auto-disable:**
```sql
SELECT
    details->>'reason' as reason,
    COUNT(*) as count
FROM user_activity_log
WHERE action = 'receiving_auto_disabled'
AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY details->>'reason'
ORDER BY count DESC;
```

## State Transition Flow

```
1. User logs in
   → receiving_auto_disabled (reason: page_refresh)
   → State: NOT RECEIVING

2. User manually enables receiving
   → receiving_enabled (manual_toggle: true)
   → State: RECEIVING

3. User gets auto-assigned an event
   → receiving_auto_disabled (reason: active_event)
   → State: NOT RECEIVING

4. User dismisses event
   → Returns to dashboard
   → State: Still NOT RECEIVING (must manually re-enable)

5. User manually enables receiving again
   → receiving_enabled (manual_toggle: true)
   → State: RECEIVING

6. User switches to another tab
   → receiving_auto_disabled (reason: tab_blur)
   → State: NOT RECEIVING

7. User returns to tab and manually enables
   → receiving_enabled (manual_toggle: true)
   → State: RECEIVING

8. User clicks "Alarm" button
   → receiving_auto_disabled (reason: alarm_navigation)
   → State: NOT RECEIVING

9. User resolves alarm and returns to dashboard
   → State: Still NOT RECEIVING (must manually re-enable)

10. User logs out
    → receiving_auto_disabled (reason: logout)
    → State: NOT RECEIVING
```

## Key Behaviors

1. **Default State**: NOT RECEIVING (every page load starts as NOT RECEIVING)
2. **Manual Control**: User must explicitly click the toggle to enable RECEIVING
3. **Auto-Disable Never Enables**: The system never automatically enables receiving, only disables
4. **Explicit Re-Enable Required**: After any auto-disable, user must manually re-enable
5. **Complete Audit Trail**: Every state change is logged with timestamp, user, and reason

## Metrics Available

From the audit logs, you can calculate:

1. **Receiving Uptime**: Total time users spend in RECEIVING mode
2. **Manual Toggle Frequency**: How often users manually change their status
3. **Auto-Disable Frequency by Reason**: Which triggers cause the most auto-disables
4. **Response Time**: Time from event assignment to user claiming it
5. **Active Event Duration**: Time user spends with an active event
6. **Login Session Metrics**: Time between login and logout with receiving state tracking

## Implementation Details

### Backend Endpoint: `/api/users/me/auto-disable-receiving`
- Accepts `reason` query parameter
- Only logs if user was actually receiving (avoids duplicate logs)
- Updates `users.is_receiving` to False
- Broadcasts WebSocket message to all clients
- Returns: `{was_receiving, is_receiving, reason}`

### Frontend Auto-Disable Triggers
All implemented in Dashboard.jsx with proper state synchronization:
1. Page load useEffect (line 31)
2. Tab blur event listener (line 64)
3. Active event detection useEffect (line 86)
4. Alarm navigation handler (line 662)

## Testing Audit Logs

1. **Login** → Check for `page_refresh` auto-disable
2. **Toggle Receiving ON** → Check for `receiving_enabled` with manual_toggle
3. **Switch tabs** → Check for `tab_blur` auto-disable
4. **Get auto-assigned event** → Check for `active_event` auto-disable
5. **Click Alarm button** → Check for `alarm_navigation` auto-disable
6. **Logout** → Check for `logout` auto-disable

All actions should appear in `user_activity_log` table with proper details JSON.
