from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    hashed_password = Column(String)

    # NEW: Separate Access Level and Role Type
    access_level = Column(String, default="customer")  # country, group, dealer, customer
    role_type = Column(String, default="user")  # admin, supervisor, user, user_escalate

    # DEPRECATED: Keep old 'role' column for backward compatibility
    role = Column(String, default="customer_user")  # Will be auto-generated from access_level + role_type

    is_active = Column(Boolean, default=True)
    is_receiving = Column(Boolean, default=False)  # Whether operator is receiving auto-assigned events
    previous_receiving_state = Column(Boolean, nullable=True, default=None)  # State before auto-disable (for restoration)

    # Hierarchical assignment - user can be assigned to multiple groups, dealers, or customers
    # Keep old single-value columns for backward compatibility (deprecated)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    dealer_id = Column(Integer, ForeignKey("dealers.id"), nullable=True)
    customer_id = Column(Integer, ForeignKey("video_accounts.id"), nullable=True)  # customer = video_account

    # New multi-value columns - arrays of IDs stored as JSON
    country_ids = Column(JSON, nullable=True, default=list)  # [country_id1, country_id2, ...]
    group_ids = Column(JSON, nullable=True, default=list)  # [group_id1, group_id2, ...]
    dealer_ids = Column(JSON, nullable=True, default=list)  # [dealer_id1, dealer_id2, ...]
    customer_ids = Column(JSON, nullable=True, default=list)  # [customer_id1, customer_id2, ...]

    # Video type filtering - array of video types user can see
    video_types = Column(JSON, nullable=True, default=list)  # ["Doorman", "Perimeter", "Loitering", ...] Empty = ALL types

    # Security fields for 2FA and IP whitelisting
    phone_number = Column(String, nullable=True)  # Phone number for SMS 2FA
    two_factor_enabled = Column(Boolean, default=False)  # Whether 2FA is enabled
    two_factor_secret = Column(String, nullable=True)  # TOTP secret for 2FA
    two_factor_method = Column(String, nullable=True)  # 'sms' or 'totp' or 'email'
    ip_whitelist = Column(JSON, nullable=True, default=list)  # List of whitelisted IP addresses/CIDR ranges
    require_2fa_or_whitelist = Column(Boolean, default=False)  # If True, user must have either 2FA enabled OR be on whitelist
    last_login_ip = Column(String, nullable=True)  # Last IP address used to login
    last_login_at = Column(DateTime, nullable=True)  # Last login timestamp
    last_logout_at = Column(DateTime, nullable=True)  # Last logout timestamp

    # SIP/PBX fields for phone dialing
    sip_extension = Column(String, nullable=True)  # SIP extension number for dialing
    sip_password = Column(String, nullable=True)  # SIP password for registration
    phone_dialing_enabled = Column(Boolean, default=False)  # Whether phone dialing is enabled for this user

    created_at = Column(DateTime, default=datetime.utcnow)

class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    website = Column(String, nullable=True)
    notification_emails = Column(JSON, nullable=True, default=list)  # [{"email": "...", "type": "all|general|vital_signs"}]
    created_at = Column(DateTime, default=datetime.utcnow)

class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    country_id = Column(Integer, ForeignKey("countries.id"), nullable=True)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    website = Column(String, nullable=True)
    notification_emails = Column(JSON, nullable=True, default=list)  # [{"email": "...", "type": "all|general|vital_signs"}]
    created_at = Column(DateTime, default=datetime.utcnow)

class Dealer(Base):
    __tablename__ = "dealers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    website = Column(String, nullable=True)
    notification_emails = Column(JSON, nullable=True, default=list)  # [{"email": "...", "type": "all|general|vital_signs"}]
    created_at = Column(DateTime, default=datetime.utcnow)

class VideoAccount(Base):
    __tablename__ = "video_accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String(8), unique=True, index=True, nullable=False)  # Unique 8-digit ID for API reference
    name = Column(String, index=True)
    account_number = Column(String, unique=True, index=True)
    notification_emails = Column(JSON, nullable=True, default=list)  # [{"email": "...", "type": "all|general|vital_signs"}]
    contacts = Column(JSON)  # List of contact information
    address = Column(String)  # Street address
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    notes = Column(Text)
    action_plan = Column(JSON, nullable=True)  # Array of action plan steps: [{type: "text|view_cameras|webhook", content: "...", label: "...", url: "...", completed: false}]
    inbound_phone_number = Column(String, nullable=True)  # Optional inbound phone number
    group = Column(String, nullable=True)  # Optional group/category
    dealer = Column(String, nullable=True)  # Optional dealer name

    # Eyes On feature - number of users required to dismiss/resolve
    eyes_on_count = Column(Integer, default=1)  # Default is 1 user required

    # Video type - default type for account (can be overridden per camera)
    # NULL = all types (no filtering)
    video_type = Column(String, nullable=True, default=None)  # Doorman, Perimeter, Loitering, or NULL for all

    # Snooze feature - suppress alarm creation for this account
    snoozed_until = Column(DateTime, nullable=True)  # NULL means not snoozed
    snoozed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # User who snoozed
    snoozed_at = Column(DateTime, nullable=True)  # When snooze was activated

    # Arm/Disarm schedules - define when cameras should be disarmed (not accepting SMTP events)
    disarm_schedules = Column(JSON, nullable=True)  # Array of schedule objects: [{id, name, description, periods: [{days:[], start_time, end_time}]}]

    # Timezone for schedule calculations (IANA timezone name, e.g., "America/New_York")
    timezone = Column(String, nullable=True, default="UTC")  # Default to UTC if not set

    # Priority for event ordering (lower number = higher priority)
    priority = Column(Integer, nullable=True, default=5)  # Default priority is 5

    # Allow dismiss on dashboard (can be overridden at camera level)
    allow_dismiss = Column(Boolean, default=True)  # Default allows dismissal

    # Hierarchy
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    dealer_id = Column(Integer, ForeignKey("dealers.id"), nullable=True)

    # Vital Signs Monitoring - Account level settings
    vital_signs_connectivity_enabled = Column(Boolean, default=False)  # Enable RTSP connectivity monitoring
    vital_signs_image_change_enabled = Column(Boolean, default=False)  # Enable image change detection
    vital_signs_image_change_threshold = Column(Integer, default=50)  # Percentage threshold for image change (0-100)

    # Activity Tracking and Billing - Account level settings
    monthly_event_count = Column(Integer, default=0)  # Count of events this billing period
    activity_threshold_warning = Column(Integer, nullable=True)  # Send warning email when this count is reached (NULL = disabled)
    activity_snooze_threshold = Column(Integer, nullable=True)  # Auto-snooze account when this count is reached (NULL = disabled)
    activity_last_warning_sent_at = Column(DateTime, nullable=True)  # When last warning was sent
    activity_auto_snoozed_at = Column(DateTime, nullable=True)  # When auto-snooze was triggered
    activity_billing_period_start = Column(DateTime, default=datetime.utcnow)  # Start of current billing period
    activity_billing_period_end = Column(DateTime, nullable=True)  # End of current billing period

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cameras = relationship("Camera", back_populates="account", cascade="all, delete-orphan")

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("video_accounts.id"))
    camera_number = Column(Integer, nullable=False)  # Auto-incrementing camera number, editable
    name = Column(String)
    rtsp_url = Column(String)
    rtsp_username = Column(String, nullable=True)  # Optional RTSP username
    rtsp_password = Column(String, nullable=True)  # Optional RTSP password
    smtp_email = Column(String, unique=True, index=True)  # Unique email for this camera
    location = Column(String)

    # Priority override - if set, uses this instead of account's priority (lower number = higher priority)
    priority = Column(Integer, nullable=True)  # NULL means use account default

    # Allow dismiss override - if set, uses this instead of account's allow_dismiss
    allow_dismiss = Column(Boolean, nullable=True)  # NULL means use account default

    # Eyes On override - if set, uses this instead of account's eyes_on_count
    eyes_on_count = Column(Integer, nullable=True)  # NULL means use account default

    # Video type override - if set, uses this instead of account's video_type
    video_type = Column(String, nullable=True)  # NULL means use account default

    # Inbound phone number override - if set, uses this instead of account's inbound_phone_number
    inbound_phone_number = Column(String, nullable=True)  # NULL means use account default

    # Snooze feature - suppress alarm creation for this camera
    snoozed_until = Column(DateTime, nullable=True)  # NULL means not snoozed
    snoozed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # User who snoozed
    snoozed_at = Column(DateTime, nullable=True)  # When snooze was activated

    # Disarm schedule assignment - which schedule (from account) applies to this camera
    disarm_schedule_id = Column(Integer, nullable=True)  # Reference to schedule ID in account's disarm_schedules array

    # Manual arm/disarm override - takes precedence over schedule
    # NULL = use schedule, True = manually armed (override schedule), False = manually disarmed (override schedule)
    manual_arm_state = Column(Boolean, nullable=True, default=None)

    # Vital Signs Monitoring - Camera level overrides (NULL = use account setting)
    vital_signs_connectivity_enabled = Column(Boolean, nullable=True, default=None)  # Override account setting
    vital_signs_image_change_enabled = Column(Boolean, nullable=True, default=None)  # Override account setting
    vital_signs_image_change_threshold = Column(Integer, nullable=True, default=None)  # Override account threshold

    # Default image for comparison (updated on each connectivity check)
    default_image_path = Column(String, nullable=True)  # Path to latest snapshot

    # Tool association - link camera to a tool (e.g., relay for door unlock)
    # DEPRECATED: Use associated_actions instead
    associated_tool_id = Column(Integer, ForeignKey("tools.id"), nullable=True)
    associated_relay_number = Column(Integer, nullable=True)  # For CBW relays, which relay number

    # Multiple tool/group associations - JSON array of actions
    # Format: [{"type": "tool", "tool_id": 1, "relay_number": 2, "label": "Unlock Door"},
    #          {"type": "tool_group", "group_id": 1, "label": "Open Gate"}]
    associated_actions = Column(JSON, default=list)

    # Activity Tracking and Billing - Camera level overrides (NULL = use account setting)
    monthly_event_count = Column(Integer, default=0)  # Count of events this billing period for this camera
    activity_threshold_warning = Column(Integer, nullable=True)  # Override account warning threshold (NULL = use account setting)
    activity_snooze_threshold = Column(Integer, nullable=True)  # Override account snooze threshold (NULL = use account setting)
    activity_last_warning_sent_at = Column(DateTime, nullable=True)  # When last warning was sent for this camera
    activity_auto_snoozed_at = Column(DateTime, nullable=True)  # When auto-snooze was triggered for this camera

    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("VideoAccount", back_populates="cameras")
    events = relationship("AlarmEvent", back_populates="camera")

class AlarmEvent(Base):
    __tablename__ = "alarm_events"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)  # When event was received from camera
    media_type = Column(String)  # image, video, call (for phone-triggered events), alert (for vital signs)
    alert_type = Column(String, nullable=True)  # connectivity, image_change (only set when media_type = "alert")
    media_paths = Column(JSON)  # List of file paths
    status = Column(String, default="pending")  # pending, dismissed, alarm_generated, escalated, on_hold

    # Audit tracking - Dismissal
    dismissed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    dismissed_at = Column(DateTime, nullable=True)

    # Audit tracking - Escalation
    escalated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    escalated_at = Column(DateTime, nullable=True)

    # Audit tracking - Hold
    held_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    held_at = Column(DateTime, nullable=True)
    unheld_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    unheld_at = Column(DateTime, nullable=True)

    # Audit tracking - Claim/View
    claimed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who claimed the account
    claimed_at = Column(DateTime, nullable=True)  # When operator claimed the event
    viewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who viewed the event detail
    viewed_at = Column(DateTime, nullable=True)  # When event detail was opened

    # Eyes On tracking for events - array of user IDs who have reviewed this event
    eyes_on_users = Column(JSON, nullable=True, default=list)  # [user_id1, user_id2, ...]

    # Call metadata - for phone-triggered events from FreePBX webhook
    call_uniqueid = Column(String, nullable=True)  # Asterisk call unique ID
    caller_id_num = Column(String, nullable=True)  # Caller ID number (with +1)
    caller_id_name = Column(String, nullable=True)  # Caller ID name
    parked_slot = Column(String, nullable=True)  # Parking slot number (e.g., "71")
    parked_lot = Column(String, nullable=True)  # Parking lot name (e.g., "default")
    call_timeout_sec = Column(Integer, nullable=True)  # Parking timeout in seconds
    call_status = Column(String, nullable=True, default="parked")  # parked, ringing, connected, ended
    call_retrieved_at = Column(DateTime, nullable=True)  # When call was retrieved from parking
    call_retrieved_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who retrieved the call

    # Live view captures - recordings made when user views live stream during event
    # Format: [{"camera_id": 1, "camera_name": "Front Door", "capture_timestamp": "...", "clip_path": "...", "duration_seconds": 10}]
    live_view_captures = Column(JSON, nullable=True, default=list)

    camera = relationship("Camera", back_populates="events")
    alarm = relationship("Alarm", back_populates="event", uselist=False)

class Alarm(Base):
    __tablename__ = "alarms"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("alarm_events.id"), unique=True)
    created_by = Column(Integer, ForeignKey("users.id"))  # Who generated the alarm
    created_at = Column(DateTime, default=datetime.utcnow)  # When alarm was generated
    notes = Column(Text)
    status = Column(String, default="active")  # active, resolved, escalated, on_hold

    # Audit tracking - Resolution
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who resolved the alarm
    resolved_at = Column(DateTime, nullable=True)  # When alarm was resolved
    resolution = Column(String, nullable=True)  # Video Dispatched, Video False, Entry, Eyes-On, Dispersed Persons

    # Audit tracking - View
    viewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who viewed the alarm detail
    viewed_at = Column(DateTime, nullable=True)  # When alarm detail screen was opened

    # Audit tracking - Hold
    held_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who put alarm on hold
    held_at = Column(DateTime, nullable=True)  # When alarm was put on hold
    unheld_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who took alarm off hold
    unheld_at = Column(DateTime, nullable=True)  # When alarm was taken off hold

    # Additional data
    call_logs = Column(JSON, nullable=True)  # Array of call log objects
    related_event_ids = Column(JSON, nullable=True)  # All event IDs that are part of this alarm (for multi-event alarms)
    action_plan_state = Column(JSON, nullable=True)  # Track completion state of action plan steps

    # Eyes On tracking - array of user IDs who have dismissed/resolved this alarm
    eyes_on_users = Column(JSON, nullable=True, default=list)  # [user_id1, user_id2, ...]

    event = relationship("AlarmEvent", back_populates="alarm")

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    account_id = Column(Integer, nullable=True)  # For account-level snooze tracking
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String)  # "snoozed", "dismissed"
    resolution = Column(String)  # "snoozed", "dismissed"
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    media_paths = Column(JSON, nullable=True)  # Tracks what was suppressed/dismissed
    media_type = Column(String, nullable=True)  # image, video
    notes = Column(Text, nullable=True)  # Optional context
    created_at = Column(DateTime, default=datetime.utcnow)

class AccountClaim(Base):
    __tablename__ = "account_claims"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("video_accounts.id"), unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    claimed_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)  # Auto-release time

class AlarmAuditLog(Base):
    __tablename__ = "alarm_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("alarm_events.id"), nullable=True)
    alarm_id = Column(Integer, ForeignKey("alarms.id"), nullable=True)
    action = Column(String(50))  # event_received, event_claimed, alarm_generated, alarm_viewed, etc.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(JSON, nullable=True)  # Additional context as JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    session_id = Column(String(50), nullable=True)  # Groups actions from same alarm handling session

class UserActivityLog(Base):
    __tablename__ = "user_activity_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    username = Column(String(255))
    action = Column(String(50))  # user_login, user_logout, receiving_enabled, receiving_disabled, receiving_auto_disabled
    timestamp = Column(DateTime, default=datetime.utcnow)
    ip_address = Column(String(45), nullable=True)
    details = Column(JSON, nullable=True)  # Additional context as JSON
    created_at = Column(DateTime, default=datetime.utcnow)

class CameraVitalSignsCheck(Base):
    """Audit log for each vital signs check performed on a camera"""
    __tablename__ = "camera_vital_signs_checks"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), index=True)
    check_type = Column(String(50))  # "connectivity" or "image_change"
    check_time = Column(DateTime, default=datetime.utcnow, index=True)

    # Connectivity check results
    connectivity_status = Column(String(20), nullable=True)  # "online", "offline", "error"
    connectivity_response_time_ms = Column(Integer, nullable=True)  # Response time in milliseconds
    connectivity_error_message = Column(Text, nullable=True)  # Error details if failed

    # Image change check results
    image_change_detected = Column(Boolean, nullable=True)  # True if significant change detected
    image_change_percentage = Column(Integer, nullable=True)  # Percentage of change (0-100)
    previous_image_path = Column(String, nullable=True)  # Path to previous image used for comparison
    current_image_path = Column(String, nullable=True)  # Path to current image captured

    # Additional metadata
    details = Column(JSON, nullable=True)  # Additional information as needed
    created_at = Column(DateTime, default=datetime.utcnow)

class CameraVitalSignsStatus(Base):
    """Current vital signs status for each camera (one record per camera)"""
    __tablename__ = "camera_vital_signs_status"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), unique=True, index=True)

    # Connectivity status
    connectivity_status = Column(String(20), default="unknown")  # "online", "offline", "error", "unknown"
    connectivity_last_check = Column(DateTime, nullable=True)
    connectivity_last_online = Column(DateTime, nullable=True)
    connectivity_last_offline = Column(DateTime, nullable=True)
    connectivity_consecutive_failures = Column(Integer, default=0)  # Count of consecutive failures

    # Image change status
    image_change_status = Column(String(20), default="normal")  # "normal", "changed", "error", "unknown"
    image_change_last_check = Column(DateTime, nullable=True)
    image_change_last_normal = Column(DateTime, nullable=True)
    image_change_last_changed = Column(DateTime, nullable=True)
    image_change_percentage = Column(Integer, nullable=True)  # Last detected change percentage

    # Notification tracking
    connectivity_alert_sent = Column(Boolean, default=False)  # Whether offline alert was sent
    connectivity_alert_sent_at = Column(DateTime, nullable=True)
    image_change_alert_sent = Column(Boolean, default=False)  # Whether moved/blocked alert was sent
    image_change_alert_sent_at = Column(DateTime, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

class Tool(Base):
    """External tools that can be triggered from action plans (e.g., relays, webhooks)"""
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("video_accounts.id"), index=True)  # Account this tool belongs to
    name = Column(String, index=True)  # Tool name (e.g., "Front Door Relay")
    tool_type = Column(String)  # "cbw_relay", "webhook", "custom"
    description = Column(Text, nullable=True)  # Optional description

    # Configuration - stored as JSON to support different tool types
    config = Column(JSON)  # {url, username, password, relays: [{number, description}]} for CBW, {url, method, headers, body} for webhook

    # Grouping/categorization
    category = Column(String, nullable=True)  # Optional category for organization

    # Hide from alarm view - useful when tool is only used in groups
    hide_in_alarm_view = Column(Boolean, default=False)  # If True, tool won't appear in alarm detail view

    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ToolGroup(Base):
    """Tool Groups - Macros that combine multiple tool actions in sequence or parallel"""
    __tablename__ = "tool_groups"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("video_accounts.id"), index=True)  # Account this group belongs to
    name = Column(String, index=True)  # Group name (e.g., "Alarm Response")
    description = Column(Text, nullable=True)  # Optional description

    # Actions configuration - array of action objects
    # Each action: {
    #   type: "relay" | "camera_view" | "webhook" | "delay",
    #   tool_id: int (for relay/camera_view/webhook types),
    #   relay_number: int (for relay type, optional),
    #   duration: int (in milliseconds, for timed actions),
    #   parallel_group: int (actions with same number run in parallel, null = sequential)
    # }
    # Example: [
    #   {type: "relay", tool_id: 1, relay_number: 1, duration: 2000, parallel_group: null},  # Trigger relay 1 for 2s, then...
    #   {type: "camera_view", tool_id: 2, duration: 4000, parallel_group: null},  # Show camera 1 for 4s, then...
    #   {type: "camera_view", tool_id: 3, duration: null, parallel_group: 1},  # Switch to camera grid (no duration), while...
    #   {type: "relay", tool_id: 1, relay_number: 2, duration: 1000, parallel_group: 1}  # ...simultaneously trigger relay 2
    # ]
    actions = Column(JSON)  # Array of action objects

    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Apartment(Base):
    """Apartments/units within a Video Doorman building"""
    __tablename__ = "apartments"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("video_accounts.id"), index=True)  # Account this apartment belongs to
    apartment_number = Column(String, index=True)  # Apartment/unit number
    notes = Column(Text, nullable=True)  # Optional notes about the apartment
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenants = relationship("Tenant", back_populates="apartment", cascade="all, delete-orphan")

class Tenant(Base):
    """Tenants/residents within an apartment"""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    apartment_id = Column(Integer, ForeignKey("apartments.id"), index=True)  # Apartment this tenant belongs to
    name = Column(String)  # Tenant name
    phone_number = Column(String, nullable=True)  # Phone number
    email = Column(String, nullable=True)  # Email address
    notes = Column(Text, nullable=True)  # Optional notes about the tenant

    # Notification preferences
    sms_enabled = Column(Boolean, default=True)  # Enable SMS notifications
    email_enabled = Column(Boolean, default=True)  # Enable email notifications

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    apartment = relationship("Apartment", back_populates="tenants")

class InboundEvent(Base):
    """
    Log of ALL inbound events received from any source (SMTP, webhook, API, call, etc.)
    This table captures every event BEFORE any filtering (snooze, disarm, etc.)
    """
    __tablename__ = "inbound_events"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True, index=True)  # NULL if no camera linked
    account_id = Column(Integer, ForeignKey("video_accounts.id"), nullable=True, index=True)  # NULL if no account linked
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)  # When event was received

    # Source information
    source_type = Column(String, index=True)  # smtp, webhook, api, call, manual
    source_identifier = Column(String, nullable=True)  # SMTP email, phone number, API key, etc.

    # Event metadata
    media_type = Column(String, nullable=True)  # image, video, call, alert
    media_paths = Column(JSON, nullable=True)  # List of file paths (if applicable)

    # Processing outcome - what happened to this inbound event
    # Initial outcomes: pending_created, snoozed, disarmed, no_camera_match, no_account_match, error
    # Final outcomes: dismissed, alarm_created, on_hold, unheld, alarm_resolved
    outcome = Column(String, index=True)
    outcome_reason = Column(Text, nullable=True)  # Details about why event was filtered

    # Final outcome tracking - what ultimately happened after pending
    final_outcome = Column(String, nullable=True, index=True)  # dismissed, alarm_created, on_hold
    final_outcome_at = Column(DateTime, nullable=True)  # When final outcome occurred
    final_outcome_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # Who performed final action

    # For alarm_created final outcome
    alarm_id = Column(Integer, ForeignKey("alarms.id"), nullable=True)  # Link to alarm if created
    alarm_resolution = Column(String, nullable=True)  # Resolution if alarm was resolved (Video Dispatched, Video False, etc.)
    alarm_resolved_at = Column(DateTime, nullable=True)  # When alarm was resolved

    # Link to created alarm event (if one was created)
    alarm_event_id = Column(Integer, ForeignKey("alarm_events.id"), nullable=True)  # NULL if no event created

    # Call metadata (for call-based events)
    call_uniqueid = Column(String, nullable=True)
    caller_id_num = Column(String, nullable=True)
    caller_id_name = Column(String, nullable=True)

    # Additional context
    raw_payload = Column(JSON, nullable=True)  # Store raw request data for debugging
    created_at = Column(DateTime, default=datetime.utcnow)
