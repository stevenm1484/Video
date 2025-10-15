# Video Monitoring Dashboard - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              React Frontend (Port 3000)                   │   │
│  │  - Login/Auth                                            │   │
│  │  - Dashboard (Video Wall)                                │   │
│  │  - Account Management                                    │   │
│  │  - Alarm Detail View                                     │   │
│  └────────────────┬─────────────────────────────────────────┘   │
└─────────────────────┼─────────────────────────────────────────┘
                      │
                      │ HTTP REST API + WebSocket
                      │
┌─────────────────────▼─────────────────────────────────────────┐
│              FastAPI Backend (Port 8000)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    REST API Server                        │  │
│  │  - Authentication (JWT)                                   │  │
│  │  - Account CRUD                                          │  │
│  │  - Camera Management                                     │  │
│  │  - Event/Alarm Handling                                  │  │
│  │  - WebSocket Manager                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            SMTP Server (Port 2525)                        │  │
│  │  - Receives emails from cameras                          │  │
│  │  - Extracts attachments (images/videos)                  │  │
│  │  - Saves media files                                     │  │
│  │  - Creates alarm events                                  │  │
│  │  - Broadcasts via WebSocket                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            Image/Video Processor                          │  │
│  │  - Combines multiple images into video                   │  │
│  │  - Uses OpenCV + Pillow                                  │  │
│  │  - Generates MP4 files                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      │ SQLAlchemy ORM
                      │
┌─────────────────────▼─────────────────────────────────────────┐
│              Database (SQLite/PostgreSQL)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Tables:                                                  │  │
│  │  - users (authentication & roles)                        │  │
│  │  - video_accounts (customer accounts)                    │  │
│  │  - cameras (camera config + SMTP emails)                │  │
│  │  - alarm_events (incoming alarms)                        │  │
│  │  - alarms (generated alarm tickets)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│              External Systems (Cameras/NVRs)                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  IP Cameras / NVR Systems                                │  │
│  │  - Send emails on motion/alarm                           │  │
│  │  - Attach images/videos                                  │  │
│  │  - RTSP streams for live viewing                        │  │
│  └──────────────────┬───────────────────────────────────────┘  │
└─────────────────────┼─────────────────────────────────────────┘
                      │
                      │ SMTP Email (Port 2525)
                      │ camera-xxxxx@monitor.local
                      │
                 ┌────▼────┐
                 │  SMTP   │
                 │ Server  │
                 └─────────┘
```

## Data Flow

### 1. Alarm Event Flow

```
Camera Motion Detected
        │
        ▼
Camera sends email to camera-xxxxx@monitor.local
        │
        ▼
SMTP Server receives email (Port 2525)
        │
        ▼
Extract attachments (images/videos)
        │
        ▼
Save media files to uploads/
        │
        ├─→ Single image → Store as image event
        │
        └─→ Multiple images → Combine into video using OpenCV
        │
        ▼
Create AlarmEvent in database
        │
        ▼
Broadcast event via WebSocket to connected clients
        │
        ▼
Dashboard displays new event card in real-time
        │
        ▼
User action:
        │
        ├─→ Dismiss → Mark as dismissed, remove from dashboard
        │
        └─→ Generate Alarm → Create Alarm record, navigate to detail view
```

### 2. Authentication Flow

```
User enters credentials
        │
        ▼
POST /api/token with username/password
        │
        ▼
Backend validates credentials
        │
        ▼
Generate JWT token
        │
        ▼
Return token to frontend
        │
        ▼
Frontend stores token in localStorage (Zustand persist)
        │
        ▼
All subsequent requests include Authorization: Bearer <token>
        │
        ▼
Backend validates token on each request
```

### 3. Camera Setup Flow

```
Create VideoAccount
        │
        ▼
Add Camera to account
        │
        ▼
Backend generates unique SMTP email (camera-xxxxx@monitor.local)
        │
        ▼
User configures physical camera to send emails to this address
        │
        ▼
Camera sends test email
        │
        ▼
System receives and processes alarm
```

## Component Details

### Backend Components

#### 1. Main API Server (`main.py`)
- FastAPI application
- REST endpoints for CRUD operations
- WebSocket endpoint for real-time updates
- JWT authentication middleware
- CORS configuration

#### 2. Database Models (`models.py`)
- **User:** Authentication and authorization
- **VideoAccount:** Customer accounts with contacts
- **Camera:** Camera configurations with unique SMTP emails
- **AlarmEvent:** Incoming alarm events with media
- **Alarm:** Generated alarm tickets for investigation

#### 3. SMTP Server (`smtp_server.py`)
- Asynchronous SMTP server using aiosmtpd
- Email parsing and attachment extraction
- Image-to-video conversion
- Database event creation
- WebSocket broadcasting

#### 4. Database Layer (`database.py`)
- SQLAlchemy setup
- Connection pooling
- Session management

#### 5. Schemas (`schemas.py`)
- Pydantic models for request/response validation
- Type safety
- Automatic documentation

### Frontend Components

#### 1. Authentication (`Login.jsx`, `authStore.js`)
- Login form
- JWT token management
- Persistent authentication state
- Auto-logout on 401

#### 2. Dashboard (`Dashboard.jsx`)
- Real-time event display
- WebSocket connection
- Event cards with media preview
- Dismiss/Generate Alarm actions

#### 3. Account Management (`VideoAccounts.jsx`)
- Account CRUD operations
- Camera management
- Contact information
- Modals for creation/editing

#### 4. Alarm Detail (`AlarmDetail.jsx`)
- Full media view
- Account/camera information
- Contact list with click-to-call
- Notes editor
- Resolve functionality

#### 5. Layout (`Layout.jsx`)
- Navigation
- User information
- Logout functionality

## Technology Stack

### Backend
| Technology | Purpose |
|------------|---------|
| FastAPI | Web framework, REST API |
| SQLAlchemy | Database ORM |
| aiosmtpd | SMTP server |
| OpenCV | Video processing |
| Pillow | Image processing |
| python-jose | JWT tokens |
| passlib | Password hashing |
| uvicorn | ASGI server |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| Vite | Build tool |
| React Router | Navigation |
| Zustand | State management |
| Axios | HTTP client |
| React Toastify | Notifications |
| Lucide React | Icons |
| React Player | Video playback |

## Security Architecture

### Authentication
```
Password → bcrypt hash → Database
            ↓
    Compare on login
            ↓
    Generate JWT with expiry
            ↓
    Client stores token
            ↓
    Include in Authorization header
            ↓
    Validate on each request
```

### Authorization
- Role-based access control (admin, supervisor, user)
- Protected routes in frontend
- Authorization checks in backend
- Hierarchical permissions

### Data Protection
- Password hashing with bcrypt
- JWT with expiration
- HTTPS in production
- Input validation with Pydantic
- SQL injection prevention (ORM)

## Scalability Considerations

### Current Architecture
- Single server
- SQLite database
- Local file storage
- In-memory WebSocket connections

### Production Scale-out

```
                    ┌─────────────┐
                    │   Nginx     │
                    │ Load Balancer│
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │Backend 1│       │Backend 2│       │Backend 3│
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    │  (Primary)  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    │  (Replica)  │
                    └─────────────┘

                    ┌─────────────┐
                    │     S3      │
                    │File Storage │
                    └─────────────┘

                    ┌─────────────┐
                    │    Redis    │
                    │  (Sessions) │
                    └─────────────┘
```

### High Availability
- Multiple backend instances
- PostgreSQL with replication
- Shared storage (S3/NFS)
- Redis for session management
- Message queue for SMTP processing

## Integration Points

### Camera Integration
- **SMTP:** Email with attachments
- **RTSP:** Live video streaming
- **Webhook:** Future expansion
- **API:** Direct integration

### External Systems
- **Email providers:** Send notifications
- **SMS gateways:** Alert contacts
- **Monitoring systems:** System health
- **Backup services:** Data protection

## Development Workflow

```
Developer
    │
    ▼
Code Changes
    │
    ├─→ Backend: Edit Python files → Auto-reload (uvicorn)
    │
    └─→ Frontend: Edit React files → Hot reload (Vite)
    │
    ▼
Test locally
    │
    ▼
Commit to Git
    │
    ▼
Deploy to production
    │
    ├─→ Backend: systemd service restart
    │
    └─→ Frontend: npm build → nginx serve
```

## Monitoring & Logging

### Backend Logging
- Console output (stdout/stderr)
- Request/response logging
- Error tracking
- SMTP activity logs

### Frontend Logging
- Browser console
- Error boundaries
- Network tab (DevTools)

### Production Monitoring
- Application logs → File/ELK stack
- System metrics → Prometheus/Grafana
- Uptime monitoring → Pingdom/UptimeRobot
- Error tracking → Sentry

## Backup Strategy

### Data to Backup
1. **Database:** `video_monitoring.db` or PostgreSQL dump
2. **Media files:** `uploads/` directory
3. **Configuration:** `.env` files

### Backup Schedule
- Database: Hourly incremental, daily full
- Media: Real-time sync to S3/backup server
- Configuration: Version controlled (Git)

### Recovery Process
1. Restore database from backup
2. Restore media files
3. Restart services
4. Verify functionality
