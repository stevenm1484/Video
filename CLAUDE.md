# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Video Monitoring Dashboard - A real-time alarm monitoring system that receives events from IP cameras via SMTP, processes media (images/videos), and provides a web dashboard for alarm management. The system uses FastAPI (backend) and React (frontend) with WebSocket for live updates.

## Development Commands

### Backend

```bash
# Create Python virtual environment (if not exists)
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Create admin user (first time setup)
cd backend
python create_admin.py

# Run backend server (includes SMTP server on port 2525)
cd backend
python main.py
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
# Frontend: http://localhost:3000

# Build for production
npm run build
```

### Quick Start (Both Servers)

```bash
# Windows
start.bat

# Linux/Mac
./start.sh
```

## Architecture

### Core Workflow

1. **Alarm Ingestion**: IP cameras send SMTP emails to unique camera addresses (e.g., `camera-abc123@monitor.local`)
2. **SMTP Processing**: `smtp_server.py` receives emails, extracts attachments, combines multiple images into videos using OpenCV
3. **Event Creation**: Creates `AlarmEvent` records in the database
4. **Real-time Broadcast**: WebSocket manager broadcasts new events to connected dashboard clients
5. **Alarm Management**: Users dismiss false alarms or generate detailed `Alarm` records for investigation

### Backend Structure

- **main.py**: FastAPI application with REST endpoints, WebSocket manager, JWT authentication
- **smtp_server.py**: Asynchronous SMTP server (aiosmtpd) that processes camera emails and attachments
- **streaming_server.py**: Handles RTSP camera stream management for live video viewing
- **models.py**: SQLAlchemy models - `User`, `VideoAccount`, `Camera`, `AlarmEvent`, `Alarm`
- **schemas.py**: Pydantic models for request/response validation
- **database.py**: Database session management (PostgreSQL only)
- **create_admin.py**: Script to create initial admin user

### Frontend Structure

- **src/pages/**: Page components
  - `Dashboard.jsx`: Real-time event wall with WebSocket updates
  - `AlarmDetail.jsx`: Detailed alarm investigation view with media, contacts, notes
  - `VideoAccounts.jsx`: Account and camera management
  - `Login.jsx`: Authentication
- **src/store/**: Zustand state management
  - `authStore.js`: JWT token and user state persistence
- **src/api/**: Axios client with JWT token injection
- **src/components/**: Reusable UI components

### Critical Integrations

- **WebSocket Connection**: `/ws` endpoint for real-time event broadcasting from backend to all connected clients
- **SMTP Server**: Runs concurrently with FastAPI server, processes camera emails on port 2525
- **Media Processing**: When multiple images are attached to one email, `smtp_server.py` automatically combines them into MP4 video using OpenCV
- **RTSP Streaming**: `streaming_server.py` manages camera stream instances for live video viewing in alarm details

## Database Schema

- **User**: Authentication, roles (admin/supervisor/user)
- **VideoAccount**: Customer accounts with JSON contacts array
- **Camera**: Unique `smtp_email` generated per camera, linked to account, stores RTSP URL
- **AlarmEvent**: Stores media paths (JSON array), status (pending/dismissed/alarm_generated)
- **Alarm**: Generated from events, includes notes, created_by, resolved_at

## Key Technical Details

### Authentication Flow
- JWT tokens with 30-minute expiration (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- OAuth2PasswordBearer with bcrypt password hashing
- Frontend stores token in Zustand with localStorage persistence
- All API requests include `Authorization: Bearer <token>` header

### SMTP Email Processing
- Camera sends email → SMTP server parses → extracts attachments
- Single image: stored directly
- Multiple images: combined into video using OpenCV at 1 fps
- Supported formats: JPG, PNG, GIF, BMP (images), MP4, AVI, MOV (videos)
- Media stored in `backend/uploads/`

### WebSocket Broadcasting
- `ConnectionManager` class manages active WebSocket connections
- New `AlarmEvent` triggers broadcast to all connected clients
- Frontend Dashboard auto-updates without page refresh

### CORS Configuration
- Default origins: `http://localhost:3000,http://localhost:5173`
- Override via `ALLOWED_ORIGINS` environment variable
- Supports credentials (cookies/auth headers)

## Environment Variables

Backend `.env` file (required):
```
SECRET_KEY=your-secret-key-change-in-production
DATABASE_URL=postgresql://user:password@host:5432/dbname
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Note**: DATABASE_URL must be set to a valid PostgreSQL connection string. SQLite is not supported.

## Testing

### SMTP Testing
```bash
# Create test images
python create_test_images.py

# Send test email to camera
python test_smtp_sender.py <camera-email> test_images/alarm1.jpg test_images/alarm2.jpg
```

### Streaming Testing
```bash
# Test RTSP stream connection
python test_rtsp_stream.py

# Test HLS re-encoding
python test_reencode_hls.py
```

## Common Modifications

### Adding New API Endpoints
1. Add route handler in `main.py`
2. Create Pydantic schemas in `schemas.py` if needed
3. Update database models in `models.py` if needed
4. Frontend: Add API call in `src/api/` and update relevant page component

### Modifying WebSocket Events
- Backend: Broadcast via `manager.broadcast({"type": "event_type", "data": {...}})`
- Frontend: Handle in Dashboard's `useEffect` WebSocket message listener

### Changing SMTP Port
- Modify `smtp_server.py`: Update `port` parameter in `Controller` initialization
- Update documentation to reflect new port

### Database Migrations
- Currently using `Base.metadata.create_all()` on startup (development mode)
- For production: Use Alembic migrations (already in requirements.txt)

## Production Deployment Notes

- PostgreSQL database required (`DATABASE_URL` env var must be set)
- Set secure `SECRET_KEY` (not default)
- Use Gunicorn/Uvicorn with multiple workers
- Serve frontend build with Nginx
- Configure proper SMTP port (25/587) with authentication
- Consider HLS/WebRTC for RTSP stream delivery
- Set up proper backup strategy for database + `uploads/` directory

## Default Credentials

- Username: `admin`
- Password: `admin`
- Created via `backend/create_admin.py`

**Always change in production!**
