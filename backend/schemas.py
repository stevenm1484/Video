from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional, List, Dict, Any
import json

# User schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    password: str

    # NEW: Separate Access Level and Role Type
    access_level: str = "customer"  # country, group, dealer, customer
    role_type: str = "user"  # admin, supervisor, user, user_escalate

    # DEPRECATED fields for backward compatibility
    role: Optional[str] = None  # Will be auto-generated from access_level + role_type if not provided
    group_id: Optional[int] = None  # Deprecated - use group_ids
    dealer_id: Optional[int] = None  # Deprecated - use dealer_ids
    customer_id: Optional[int] = None  # Deprecated - use customer_ids

    country_ids: Optional[List[int]] = []  # Multiple countries
    group_ids: Optional[List[int]] = []  # Multiple groups
    dealer_ids: Optional[List[int]] = []  # Multiple dealers
    customer_ids: Optional[List[int]] = []  # Multiple customers
    video_types: Optional[List[str]] = []  # Video types user can see (empty = ALL types)

    # Security fields
    phone_number: Optional[str] = None
    two_factor_enabled: bool = False
    two_factor_method: Optional[str] = None  # 'sms', 'totp', or 'email'
    ip_whitelist: Optional[List[str]] = []  # List of whitelisted IP addresses/CIDR ranges
    require_2fa_or_whitelist: bool = False

    # SIP/PBX fields
    sip_extension: Optional[str] = None
    sip_password: Optional[str] = None
    phone_dialing_enabled: bool = False

class UserUpdate(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    password: Optional[str] = None  # Password is optional when updating

    # NEW: Separate Access Level and Role Type
    access_level: str = "customer"  # country, group, dealer, customer
    role_type: str = "user"  # admin, supervisor, user, user_escalate

    # DEPRECATED fields for backward compatibility
    role: Optional[str] = None  # Will be auto-generated from access_level + role_type if not provided
    group_id: Optional[int] = None  # Deprecated - use group_ids
    dealer_id: Optional[int] = None  # Deprecated - use dealer_ids
    customer_id: Optional[int] = None  # Deprecated - use customer_ids

    country_ids: Optional[List[int]] = []  # Multiple countries
    group_ids: Optional[List[int]] = []  # Multiple groups
    dealer_ids: Optional[List[int]] = []  # Multiple dealers
    customer_ids: Optional[List[int]] = []  # Multiple customers
    video_types: Optional[List[str]] = []  # Video types user can see (empty = ALL types)
    is_active: bool = True

    # Security fields
    phone_number: Optional[str] = None
    two_factor_enabled: bool = False
    two_factor_method: Optional[str] = None  # 'sms', 'totp', or 'email'
    ip_whitelist: Optional[List[str]] = []  # List of whitelisted IP addresses/CIDR ranges
    require_2fa_or_whitelist: bool = False

    # SIP/PBX fields
    sip_extension: Optional[str] = None
    sip_password: Optional[str] = None
    phone_dialing_enabled: bool = False

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str

    # NEW: Separate Access Level and Role Type
    access_level: str
    role_type: str

    # DEPRECATED: Keep for backward compatibility
    role: str

    is_active: bool
    is_receiving: bool = False
    group_id: Optional[int]  # Deprecated - for backward compatibility
    dealer_id: Optional[int]  # Deprecated - for backward compatibility
    customer_id: Optional[int]  # Deprecated - for backward compatibility
    country_ids: Optional[List[int]] = []  # Multiple countries
    group_ids: Optional[List[int]] = []  # Multiple groups
    dealer_ids: Optional[List[int]] = []  # Multiple dealers
    customer_ids: Optional[List[int]] = []  # Multiple customers
    video_types: Optional[List[str]] = []  # Video types user can see
    created_at: datetime

    # Security fields (don't expose two_factor_secret to frontend)
    phone_number: Optional[str] = None
    two_factor_enabled: bool = False
    two_factor_method: Optional[str] = None  # 'sms', 'totp', or 'email'
    ip_whitelist: Optional[List[str]] = []  # List of whitelisted IP addresses/CIDR ranges
    require_2fa_or_whitelist: bool = False
    last_login_ip: Optional[str] = None
    last_login_at: Optional[datetime] = None

    # SIP/PBX fields - include password for PBX registration (only sent over HTTPS)
    sip_extension: Optional[str] = None
    sip_password: Optional[str] = None  # Needed for PBX registration
    phone_dialing_enabled: bool = False

    @field_validator('country_ids', 'group_ids', 'dealer_ids', 'customer_ids', 'video_types', 'ip_whitelist', mode='before')
    @classmethod
    def parse_ids_arrays(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    class Config:
        from_attributes = True

# Country schemas
class CountryCreate(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    notification_emails: Optional[List[dict]] = []

class CountryResponse(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    notification_emails: Optional[List[dict]] = []
    created_at: datetime

    class Config:
        from_attributes = True

# Group schemas
class GroupCreate(BaseModel):
    name: str
    country_id: Optional[int] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    notification_emails: Optional[List[dict]] = []

class GroupResponse(BaseModel):
    id: int
    name: str
    country_id: Optional[int]
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    notification_emails: Optional[List[dict]] = []
    created_at: datetime

    class Config:
        from_attributes = True

# Dealer schemas
class DealerCreate(BaseModel):
    name: str
    group_id: int
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    notification_emails: Optional[List[dict]] = []

class DealerResponse(BaseModel):
    id: int
    name: str
    group_id: int
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    notification_emails: Optional[List[dict]] = []
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    requires_2fa: bool = False  # Indicates if 2FA verification is needed
    temp_token: Optional[str] = None  # Temporary token for 2FA flow

# 2FA schemas
class TwoFactorSetupRequest(BaseModel):
    method: str  # 'sms', 'totp', or 'email'
    phone_number: Optional[str] = None  # Required for SMS method

class TwoFactorSetupResponse(BaseModel):
    message: str
    method: str
    qr_code: Optional[str] = None  # Base64 encoded QR code for TOTP
    secret: Optional[str] = None  # TOTP secret (for backup)

class TwoFactorVerifyRequest(BaseModel):
    code: str
    temp_token: Optional[str] = None  # For login flow

class IPWhitelistUpdate(BaseModel):
    ip_whitelist: List[str]  # List of IP addresses/CIDR ranges

# Video Account schemas
class VideoAccountCreate(BaseModel):
    model_config = {"extra": "ignore"}  # Ignore extra fields like id, created_at, updated_at

    name: str
    account_number: str
    account_id: Optional[str] = None  # Optional - will be auto-generated if not provided
    contacts: Optional[List[Dict[str, Any]]] = []
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    notes: Optional[str] = ""
    action_plan: Optional[List[Dict[str, Any]]] = None
    inbound_phone_number: Optional[str] = None
    group: Optional[str] = None
    dealer: Optional[str] = None
    eyes_on_count: Optional[int] = 1
    video_type: Optional[str] = None  # Doorman, Perimeter, Loitering, or None for all types
    priority: Optional[int] = 5  # Lower number = higher priority
    allow_dismiss: Optional[bool] = True  # Allow dismissal on dashboard
    group_id: Optional[int] = None
    dealer_id: Optional[int] = None
    disarm_schedules: Optional[Any] = None  # Can be JSON string or list - will be converted
    timezone: Optional[str] = "UTC"  # IANA timezone name
    vital_signs_connectivity_enabled: Optional[bool] = False
    vital_signs_image_change_enabled: Optional[bool] = False
    vital_signs_image_change_threshold: Optional[int] = 50

class VideoAccountResponse(BaseModel):
    id: int
    account_id: str  # Unique 8-digit ID
    name: str
    account_number: str
    contacts: Optional[List[Dict[str, Any]]]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    notes: Optional[str]
    action_plan: Optional[List[Dict[str, Any]]]
    inbound_phone_number: Optional[str]
    group: Optional[str]
    dealer: Optional[str]
    eyes_on_count: int
    video_type: Optional[str]  # None = all types
    priority: int = 5  # Lower number = higher priority
    allow_dismiss: bool = True  # Allow dismissal on dashboard
    group_id: Optional[int]
    dealer_id: Optional[int]
    disarm_schedules: Optional[List[Dict[str, Any]]] = None
    timezone: Optional[str] = "UTC"
    snoozed_until: Optional[datetime] = None
    snoozed_by: Optional[int] = None
    snoozed_at: Optional[datetime] = None
    vital_signs_connectivity_enabled: bool = False
    vital_signs_image_change_enabled: bool = False
    vital_signs_image_change_threshold: int = 50
    created_at: datetime
    updated_at: datetime

    @field_validator('disarm_schedules', mode='before')
    @classmethod
    def parse_disarm_schedules(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    class Config:
        from_attributes = True

# Camera schemas
class CameraCreate(BaseModel):
    account_id: int
    camera_number: Optional[int] = None  # Optional - will be auto-incremented if not provided
    name: str
    rtsp_url: str
    rtsp_username: Optional[str] = None  # Optional RTSP authentication
    rtsp_password: Optional[str] = None  # Optional RTSP authentication
    location: Optional[str] = ""
    priority: Optional[int] = None  # NULL means use account default
    allow_dismiss: Optional[bool] = None  # NULL means use account default
    eyes_on_count: Optional[int] = None  # NULL means use account default
    video_type: Optional[str] = None  # NULL means use account default
    inbound_phone_number: Optional[str] = None  # NULL means use account default
    disarm_schedule_id: Optional[int] = None  # NULL means no schedule assigned
    vital_signs_connectivity_enabled: Optional[bool] = None  # NULL means use account default
    vital_signs_image_change_enabled: Optional[bool] = None  # NULL means use account default
    vital_signs_image_change_threshold: Optional[int] = None  # NULL means use account default
    # DEPRECATED: Use associated_actions instead
    associated_tool_id: Optional[int] = None  # Tool associated with this camera
    associated_relay_number: Optional[int] = None  # For CBW relays, which relay number
    # Multiple tool/group associations
    # Format: [{"type": "tool", "tool_id": 1, "relay_number": 2, "label": "Unlock Door"},
    #          {"type": "tool_group", "group_id": 1, "label": "Open Gate"}]
    associated_actions: Optional[List[Dict[str, Any]]] = []

class CameraUpdate(BaseModel):
    model_config = {"extra": "ignore"}  # Ignore extra fields

    camera_number: Optional[int] = None  # Editable
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    rtsp_username: Optional[str] = None  # Optional RTSP authentication
    rtsp_password: Optional[str] = None  # Optional RTSP authentication
    location: Optional[str] = None
    priority: Optional[int] = None  # NULL means use account default
    allow_dismiss: Optional[bool] = None  # NULL means use account default
    eyes_on_count: Optional[int] = None
    video_type: Optional[str] = None  # NULL means use account default
    inbound_phone_number: Optional[str] = None  # NULL means use account default
    disarm_schedule_id: Optional[int] = None  # NULL means no schedule assigned
    manual_arm_state: Optional[bool] = None  # NULL = use schedule, True = armed, False = disarmed
    vital_signs_connectivity_enabled: Optional[bool] = None  # NULL means use account default
    vital_signs_image_change_enabled: Optional[bool] = None  # NULL means use account default
    vital_signs_image_change_threshold: Optional[int] = None  # NULL means use account default
    # DEPRECATED: Use associated_actions instead
    associated_tool_id: Optional[int] = None  # Tool associated with this camera
    associated_relay_number: Optional[int] = None  # For CBW relays, which relay number
    # Multiple tool/group associations
    associated_actions: Optional[List[Dict[str, Any]]] = None

class CameraResponse(BaseModel):
    id: int
    account_id: int
    camera_number: int
    name: str
    rtsp_url: str
    rtsp_username: Optional[str] = None
    rtsp_password: Optional[str] = None
    smtp_email: str
    location: Optional[str]
    priority: Optional[int] = None  # NULL means use account default
    allow_dismiss: Optional[bool] = None  # NULL means use account default
    eyes_on_count: Optional[int]
    video_type: Optional[str]
    inbound_phone_number: Optional[str]
    disarm_schedule_id: Optional[int] = None
    manual_arm_state: Optional[bool] = None
    vital_signs_connectivity_enabled: Optional[bool] = None
    vital_signs_image_change_enabled: Optional[bool] = None
    vital_signs_image_change_threshold: Optional[int] = None
    default_image_path: Optional[str] = None
    # DEPRECATED: Use associated_actions instead
    associated_tool_id: Optional[int] = None
    associated_relay_number: Optional[int] = None
    # Multiple tool/group associations
    associated_actions: Optional[List[Dict[str, Any]]] = []
    snoozed_until: Optional[datetime] = None
    snoozed_by: Optional[int] = None
    snoozed_at: Optional[datetime] = None
    created_at: datetime

    @field_validator('associated_actions', mode='before')
    @classmethod
    def parse_associated_actions(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    class Config:
        from_attributes = True

# Alarm Event schemas
class AlarmEventResponse(BaseModel):
    id: int
    camera_id: int
    timestamp: datetime
    media_type: Optional[str] = "video"  # Default to video if not set
    media_paths: List[str]
    status: str
    dismissed_by: Optional[int] = None
    dismissed_at: Optional[datetime] = None
    escalated_by: Optional[int] = None
    escalated_at: Optional[datetime] = None
    eyes_on_users: Optional[List[int]] = None
    # Call-specific fields
    call_uniqueid: Optional[str] = None
    caller_id_num: Optional[str] = None
    caller_id_name: Optional[str] = None
    parked_slot: Optional[str] = None
    parked_lot: Optional[str] = None
    call_timeout_sec: Optional[int] = None
    call_status: Optional[str] = None
    call_retrieved_at: Optional[datetime] = None
    call_retrieved_by: Optional[int] = None
    # Live view captures - recordings made when user views live stream during event
    live_view_captures: Optional[List[Dict[str, Any]]] = []

    @field_validator('media_paths', mode='before')
    @classmethod
    def parse_media_paths(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            return json.loads(v)
        return v

    @field_validator('media_type', mode='before')
    @classmethod
    def set_default_media_type(cls, v):
        # If media_type is None, set to "video"
        if v is None:
            return "video"
        return v

    @field_validator('eyes_on_users', mode='before')
    @classmethod
    def parse_eyes_on_users(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    @field_validator('live_view_captures', mode='before')
    @classmethod
    def parse_live_view_captures(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    class Config:
        from_attributes = True

# Alarm schemas
class AlarmCreate(BaseModel):
    notes: Optional[str] = ""

class AlarmUpdate(BaseModel):
    notes: Optional[str] = None
    resolution: Optional[str] = None
    call_logs: Optional[List[Dict[str, Any]]] = None
    action_plan_state: Optional[Dict[str, Any]] = None

class EscalateRequest(BaseModel):
    notes: Optional[str] = None

class AlarmResponse(BaseModel):
    id: int
    event_id: int
    created_by: int
    created_at: datetime
    notes: Optional[str]
    status: str
    resolved_at: Optional[datetime]
    resolution: Optional[str] = None
    call_logs: Optional[List[Dict[str, Any]]] = None
    action_plan_state: Optional[Dict[str, Any]] = None
    eyes_on_users: Optional[List[int]] = None

    @field_validator('call_logs', mode='before')
    @classmethod
    def parse_call_logs(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    @field_validator('action_plan_state', mode='before')
    @classmethod
    def parse_action_plan_state(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return {}
        return v or {}

    @field_validator('eyes_on_users', mode='before')
    @classmethod
    def parse_eyes_on_users(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    class Config:
        from_attributes = True

# Snooze schemas
class SnoozeRequest(BaseModel):
    duration_minutes: Optional[int] = None  # Quick snooze: 10, 30, 60, 480, 1440
    until_datetime: Optional[datetime] = None  # Custom snooze until specific datetime

class SnoozeResponse(BaseModel):
    success: bool
    snoozed_until: Optional[datetime] = None
    message: str

# Vital Signs schemas
class VitalSignsCheckResponse(BaseModel):
    id: int
    camera_id: int
    check_type: str
    check_time: datetime
    connectivity_status: Optional[str] = None
    connectivity_response_time_ms: Optional[int] = None
    connectivity_error_message: Optional[str] = None
    image_change_detected: Optional[bool] = None
    image_change_percentage: Optional[int] = None
    previous_image_path: Optional[str] = None
    current_image_path: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    created_at: datetime

    @field_validator('details', mode='before')
    @classmethod
    def parse_details(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return {}
        return v or {}

    class Config:
        from_attributes = True

class VitalSignsStatusResponse(BaseModel):
    id: int
    camera_id: int
    connectivity_status: str
    connectivity_last_check: Optional[datetime] = None
    connectivity_last_online: Optional[datetime] = None
    connectivity_last_offline: Optional[datetime] = None
    connectivity_consecutive_failures: int
    image_change_status: str
    image_change_last_check: Optional[datetime] = None
    image_change_last_normal: Optional[datetime] = None
    image_change_last_changed: Optional[datetime] = None
    image_change_percentage: Optional[int] = None
    connectivity_alert_sent: bool
    connectivity_alert_sent_at: Optional[datetime] = None
    image_change_alert_sent: bool
    image_change_alert_sent_at: Optional[datetime] = None
    updated_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

class VitalSignsSettingsUpdate(BaseModel):
    """Update vital signs settings for account or camera"""
    vital_signs_connectivity_enabled: Optional[bool] = None
    vital_signs_image_change_enabled: Optional[bool] = None
    vital_signs_image_change_threshold: Optional[int] = None

# Tool schemas
class ToolCreate(BaseModel):
    account_id: int
    name: str
    tool_type: str  # "cbw_relay", "webhook", "custom"
    description: Optional[str] = None
    config: dict  # Tool-specific configuration
    category: Optional[str] = None
    hide_in_alarm_view: Optional[bool] = False

class ToolUpdate(BaseModel):
    name: Optional[str] = None
    tool_type: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    category: Optional[str] = None
    hide_in_alarm_view: Optional[bool] = None

class ToolResponse(BaseModel):
    id: int
    account_id: int
    name: str
    tool_type: str
    description: Optional[str]
    config: dict
    category: Optional[str]
    hide_in_alarm_view: bool
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Tool Group schemas
class ToolGroupCreate(BaseModel):
    account_id: int
    name: str
    description: Optional[str] = None
    actions: List[Dict[str, Any]]  # Array of action objects

class ToolGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    actions: Optional[List[Dict[str, Any]]] = None

class ToolGroupResponse(BaseModel):
    id: int
    account_id: int
    name: str
    description: Optional[str]
    actions: List[Dict[str, Any]]
    created_by: int
    created_at: datetime
    updated_at: datetime

    @field_validator('actions', mode='before')
    @classmethod
    def parse_actions(cls, v):
        # If it's a JSON string, parse it
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v or []

    class Config:
        from_attributes = True

# Tenant schemas
class TenantCreate(BaseModel):
    apartment_id: int
    name: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    sms_enabled: bool = True
    email_enabled: bool = True

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    sms_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None

class TenantResponse(BaseModel):
    id: int
    apartment_id: int
    name: str
    phone_number: Optional[str]
    email: Optional[str]
    notes: Optional[str]
    sms_enabled: bool
    email_enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Apartment schemas
class ApartmentCreate(BaseModel):
    account_id: int
    apartment_number: str
    notes: Optional[str] = None

class ApartmentUpdate(BaseModel):
    apartment_number: Optional[str] = None
    notes: Optional[str] = None

class ApartmentResponse(BaseModel):
    id: int
    account_id: int
    apartment_number: str
    notes: Optional[str]
    tenants: List[TenantResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
