# Video Monitoring Dashboard

A comprehensive video monitoring system with alarm management, SMTP email integration, and live video streaming capabilities.

## Features

- 🔐 **User Authentication** - Hierarchical user system with role-based access
- 📧 **SMTP Integration** - Receive alarm events via email with images/videos
- 🎥 **Video Processing** - Automatically combines multiple images into videos
- 📺 **Real-time Dashboard** - Live video wall displaying alarm events
- ⚠️ **Alarm Management** - Dismiss events or generate detailed alarms
- 📱 **Account Management** - Manage video accounts, cameras, and contacts
- 🎬 **RTSP Support** - Live video streaming from cameras
- 🔔 **Real-time Updates** - WebSocket-based live notifications

## Technology Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - Database ORM
- **aiosmtpd** - SMTP server for receiving emails
- **OpenCV & Pillow** - Image/video processing
- **JWT** - Secure authentication

### Frontend
- **React** - UI framework
- **Vite** - Build tool
- **Zustand** - State management
- **React Router** - Navigation
- **React Toastify** - Notifications

## Installation

### Prerequisites
- Python 3.9+
- Node.js 16+
- npm or yarn

### Backend Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Create the database and admin user:
```bash
cd backend
python create_admin.py
```

3. Start the backend server:
```bash
python main.py
```

The backend will run on `http://localhost:8000`
The SMTP server will run on port `2525`

### Frontend Setup

1. Install Node dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

### Login
1. Open `http://localhost:3000`
2. Login with default credentials:
   - **Username**: admin
   - **Password**: admin
   - ⚠️ Change the password after first login!

### Adding Video Accounts

1. Navigate to **Accounts** page
2. Click **Add Account**
3. Fill in:
   - Account Name
   - Account Number
   - Contact Information
   - Notes

### Adding Cameras

1. Open an account
2. Click **Add Camera**
3. Fill in:
   - Camera Name
   - RTSP URL (e.g., `rtsp://username:password@ip:port/stream`)
   - Location
4. A unique SMTP email will be automatically generated for the camera

### Sending Alarm Events via SMTP

Configure your camera or monitoring system to send emails to the camera's unique SMTP address:

**SMTP Server Configuration:**
- Host: `your-server-ip`
- Port: `2525`
- Authentication: Not required for local testing

**Email Format:**
- To: The camera's unique SMTP email (e.g., `camera-abc12345@monitor.local`)
- Attachments: Images (JPG, PNG) or Videos (MP4)

When multiple images are attached, the system automatically combines them into a video.

### Handling Alarms

**Dashboard View:**
1. New events appear in real-time on the dashboard
2. View the media (images/videos)
3. Two options:
   - **Dismiss** - Remove the event if it's not significant
   - **Generate Alarm** - Create a detailed alarm for investigation

**Alarm Detail View:**
- View event media
- Access live video feed (if RTSP configured)
- See account information and notes
- View and call contacts
- Add investigation notes
- Resolve the alarm when complete

## Architecture

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
└────────┬────────┘
         │
         │ HTTP/WebSocket
         │
┌────────▼────────┐
│   Backend       │
│   (FastAPI)     │
├─────────────────┤
│ - REST API      │
│ - WebSocket     │
│ - SMTP Server   │
│ - Video Proc.   │
└────────┬────────┘
         │
         │
┌────────▼────────┐
│   Database      │
│   (SQLite)      │
└─────────────────┘
```

## API Endpoints

### Authentication
- `POST /api/token` - Login
- `POST /api/users` - Create user
- `GET /api/users/me` - Get current user

### Accounts
- `GET /api/accounts` - List accounts
- `POST /api/accounts` - Create account
- `GET /api/accounts/{id}` - Get account
- `PUT /api/accounts/{id}` - Update account
- `DELETE /api/accounts/{id}` - Delete account

### Cameras
- `GET /api/cameras` - List cameras
- `POST /api/cameras` - Create camera
- `DELETE /api/cameras/{id}` - Delete camera

### Events & Alarms
- `GET /api/events` - List events
- `PUT /api/events/{id}/dismiss` - Dismiss event
- `POST /api/events/{id}/generate-alarm` - Generate alarm
- `GET /api/alarms` - List alarms

### WebSocket
- `WS /ws` - Real-time event updates

## Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///./video_monitoring.db
```

### SMTP Configuration

The SMTP server runs on port 2525 by default. To change:

Edit `backend/smtp_server.py`:
```python
self.controller = Controller(
    self.handler,
    hostname='0.0.0.0',
    port=2525  # Change this
)
```

## Production Deployment

### Backend
1. Use a production WSGI server (e.g., Gunicorn)
2. Configure a proper PostgreSQL database
3. Set secure SECRET_KEY
4. Enable HTTPS
5. Configure firewall rules for SMTP port

### Frontend
1. Build production bundle:
```bash
npm run build
```
2. Serve with nginx or similar
3. Configure proper CORS settings

### SMTP
For production email receiving:
1. Configure proper MX records
2. Use port 25 or 587
3. Implement proper authentication
4. Add spam filtering

## Security Considerations

- Change default admin password immediately
- Use strong SECRET_KEY in production
- Enable HTTPS for all communications
- Implement rate limiting on SMTP server
- Validate and sanitize all email attachments
- Use proper authentication for RTSP streams
- Implement proper user session management

## Live Video Streaming

For RTSP live streaming in production:
1. Consider using WebRTC for browser-based streaming
2. Use streaming services like MediaMTX or Janus
3. Implement HLS for better browser compatibility
4. Add proper authentication for streams

## Troubleshooting

### SMTP Not Receiving Emails
- Check firewall rules for port 2525
- Verify camera SMTP configuration
- Check backend logs for errors

### WebSocket Connection Issues
- Verify backend is running on port 8000
- Check CORS settings
- Ensure no proxy blocking WebSocket

### Video Processing Fails
- Ensure OpenCV is properly installed
- Check uploaded file formats
- Verify sufficient disk space

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.

## Contributing

Contributions are welcome! Please read CONTRIBUTING.md for guidelines.
