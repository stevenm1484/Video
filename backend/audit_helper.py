"""
Audit logging helper functions for comprehensive tracking
"""
from datetime import datetime
from sqlalchemy.orm import Session
from models import AlarmAuditLog, UserActivityLog

def log_audit_action(
    db: Session,
    action: str,
    user_id: int = None,
    username: str = None,
    event_id: int = None,
    alarm_id: int = None,
    details: dict = None,
    session_id: str = None
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
        session_id: Unique ID for grouping actions from same alarm handling session

    Actions:
        - event_received: Event arrived from camera
        - event_claimed: Operator claimed the account
        - event_viewed: Operator opened event detail
        - event_dismissed: Event was dismissed
        - event_escalated: Event was escalated
        - event_held: Event put on hold
        - event_unheld: Event taken off hold
        - alarm_generated: Alarm was created from event
        - alarm_viewed: Alarm detail screen opened
        - alarm_held: Alarm put on hold
        - alarm_unheld: Alarm taken off hold
        - alarm_resolved: Alarm resolved/closed
    """
    try:
        audit_log = AlarmAuditLog(
            event_id=event_id,
            alarm_id=alarm_id,
            action=action,
            user_id=user_id,
            username=username,
            details=details,
            session_id=session_id,
            timestamp=datetime.utcnow()
        )
        db.add(audit_log)
        db.commit()
        print(f"[AUDIT] {action} - User: {username or user_id} - Event: {event_id} - Alarm: {alarm_id} - Session: {session_id}")
    except Exception as e:
        print(f"[AUDIT ERROR] Failed to log {action}: {e}")
        db.rollback()

def get_audit_trail(db: Session, event_id: int = None, alarm_id: int = None):
    """
    Get complete audit trail for an event or alarm

    Args:
        db: Database session
        event_id: Event ID to get trail for
        alarm_id: Alarm ID to get trail for

    Returns:
        List of audit log entries ordered by timestamp
    """
    query = db.query(AlarmAuditLog)

    if event_id:
        query = query.filter(AlarmAuditLog.event_id == event_id)
    if alarm_id:
        query = query.filter(AlarmAuditLog.alarm_id == alarm_id)

    return query.order_by(AlarmAuditLog.timestamp).all()

def calculate_time_metrics(db: Session, alarm_id: int):
    """
    Calculate time metrics for an alarm

    Returns dict with:
        - time_to_claim: Seconds from event receipt to claim
        - time_to_view: Seconds from alarm generation to view
        - time_on_screen: Seconds from view to resolution
        - total_resolution_time: Seconds from generation to resolution
        - hold_duration: Total seconds on hold (if applicable)
    """
    from models import Alarm, AlarmEvent

    alarm = db.query(Alarm).filter(Alarm.id == alarm_id).first()
    if not alarm:
        return None

    event = db.query(AlarmEvent).filter(AlarmEvent.id == alarm.event_id).first()
    if not event:
        return None

    metrics = {}

    # Time to claim (event received to operator claim)
    if event.claimed_at and event.timestamp:
        metrics['time_to_claim'] = (event.claimed_at - event.timestamp).total_seconds()

    # Time to view alarm (alarm generated to viewed)
    if alarm.viewed_at and alarm.created_at:
        metrics['time_to_view'] = (alarm.viewed_at - alarm.created_at).total_seconds()

    # Time on screen (viewed to resolved)
    if alarm.resolved_at and alarm.viewed_at:
        metrics['time_on_screen'] = (alarm.resolved_at - alarm.viewed_at).total_seconds()

    # Total resolution time (generated to resolved)
    if alarm.resolved_at and alarm.created_at:
        metrics['total_resolution_time'] = (alarm.resolved_at - alarm.created_at).total_seconds()

    # Hold duration (held to unheld)
    if alarm.unheld_at and alarm.held_at:
        metrics['hold_duration'] = (alarm.unheld_at - alarm.held_at).total_seconds()

    # Total handling time (event received to alarm resolved)
    if alarm.resolved_at and event.timestamp:
        metrics['total_handling_time'] = (alarm.resolved_at - event.timestamp).total_seconds()

    return metrics

def log_user_activity(
    db: Session,
    action: str,
    user_id: int,
    username: str,
    ip_address: str = None,
    details: dict = None
):
    """
    Log user activity to user_activity_log table

    Args:
        db: Database session
        action: Action name (e.g., 'user_login', 'receiving_enabled')
        user_id: User ID who performed action
        username: Username who performed action
        ip_address: IP address of the user
        details: Additional context as dictionary

    Actions:
        - user_login: User logged in
        - user_logout: User logged out
        - receiving_enabled: User enabled receiving status
        - receiving_disabled: User manually disabled receiving status
        - receiving_auto_disabled: System auto-disabled receiving (page refresh, tab blur, alarm view)
    """
    try:
        activity_log = UserActivityLog(
            user_id=user_id,
            username=username,
            action=action,
            ip_address=ip_address,
            details=details,
            timestamp=datetime.utcnow()
        )
        db.add(activity_log)
        db.commit()
        print(f"[USER ACTIVITY] {action} - User: {username} (IP: {ip_address})")
    except Exception as e:
        print(f"[USER ACTIVITY ERROR] Failed to log {action}: {e}")
        db.rollback()
