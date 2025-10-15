# Video Monitoring Dashboard - Quick Reference

## 🚀 Quick Start Commands

### Windows
```cmd
start.bat
```

### Linux/Mac
```bash
./start.sh
```

### Access
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **SMTP Server:** Port 2525

## 🔑 Default Login

- **Username:** admin
- **Password:** admin

⚠️ **Change this password immediately after first login!**

## 📁 Project Structure

```
videomonitoring/
├── backend/              # FastAPI backend
│   ├── main.py          # Main API server
│   ├── models.py        # Database models
│   ├── schemas.py       # Pydantic schemas
│   ├── database.py      # Database configuration
│   ├── smtp_server.py   # SMTP email receiver
│   └── create_admin.py  # Admin user creator
├── frontend/            # React frontend
│   ├── src/
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   ├── store/       # State management
│   │   └── api/         # API client
│   └── package.json
├── requirements.txt     # Python dependencies
├── README.md           # Full documentation
├── SETUP_GUIDE.md      # Detailed setup guide
└── start.bat/.sh       # Startup scripts
```

## 🎯 Common Tasks

### Add Video Account
1. Navigate to **Accounts**
2. Click **Add Account**
3. Fill in: Name, Account Number, Contacts, Notes
4. Click **Create Account**

### Add Camera
1. Open an account
2. Click **Add Camera**
3. Fill in: Name, RTSP URL, Location
4. Copy the generated SMTP email
5. Configure your camera to send emails to this address

### Test SMTP Email
```bash
# Create test images
python create_test_images.py

# Send test email
python test_smtp_sender.py <camera_smtp_email> test_images/alarm1.jpg
```

### Handle Alarms
1. **Dashboard** shows new events in real-time
2. **Dismiss** - Ignore false alarms
3. **Generate Alarm** - Investigate serious events
   - View media
   - Check contacts
   - Add notes
   - View live feed
   - Resolve when complete

## 📧 SMTP Configuration

### For IP Cameras
- **Server:** Your server IP address
- **Port:** 2525
- **Auth:** None (for testing)
- **To:** Camera's unique SMTP email

### Email Format
- **Subject:** Anything
- **Body:** Optional text
- **Attachments:** 
  - Images: .jpg, .png, .gif, .bmp
  - Videos: .mp4, .avi, .mov
- **Multiple Images:** Automatically combined into video

## 🔌 API Endpoints

### Authentication
- `POST /api/token` - Login
- `GET /api/users/me` - Get current user

### Accounts
- `GET /api/accounts` - List accounts
- `POST /api/accounts` - Create account
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
- `PUT /api/alarms/{id}/resolve` - Resolve alarm

### WebSocket
- `WS /ws` - Real-time updates

## 🗄️ Database Models

### User
- username, email, full_name
- role: admin | supervisor | user
- hashed_password

### VideoAccount
- name, account_number
- contacts (JSON)
- notes

### Camera
- name, rtsp_url, location
- smtp_email (auto-generated)
- account_id

### AlarmEvent
- camera_id, timestamp
- media_type: image | video
- media_paths (JSON)
- status: pending | dismissed | alarm_generated

### Alarm
- event_id, created_by
- notes, status
- created_at, resolved_at

## 🛠️ Troubleshooting

### Port Already in Use
```bash
# Find process using port 8000
netstat -ano | findstr :8000    # Windows
lsof -i :8000                    # Linux/Mac

# Kill process
taskkill /PID <PID> /F           # Windows
kill -9 <PID>                    # Linux/Mac
```

### Dependencies Not Installing
```bash
# Upgrade pip
python -m pip install --upgrade pip

# Install with verbose
pip install -r requirements.txt -v
```

### WebSocket Not Connecting
- Check backend is running on port 8000
- Check browser console for errors
- Verify no proxy blocking WebSocket
- Try different browser

### SMTP Not Receiving
```bash
# Test SMTP server
telnet localhost 2525
# If connected, SMTP server is running

# Check backend logs
cd backend
python main.py  # Watch for errors
```

## 📊 User Roles

### Admin
- Full system access
- User management
- All account access
- System configuration

### Supervisor
- View all accounts
- Manage alarms
- Generate reports
- Cannot manage users

### User
- View assigned accounts
- Handle alarms
- Basic operations
- Limited access

## 🔒 Security Checklist

- [ ] Change default admin password
- [ ] Set secure SECRET_KEY in .env
- [ ] Enable HTTPS for production
- [ ] Use PostgreSQL for production
- [ ] Configure firewall rules
- [ ] Set up backup strategy
- [ ] Enable SMTP authentication
- [ ] Review user permissions
- [ ] Set up monitoring/logging

## 📝 File Locations

### Database
`backend/video_monitoring.db` (SQLite)

### Uploaded Media
`backend/uploads/`

### Logs
Backend console output

### Configuration
`backend/.env` (create if needed)

## 🎨 UI Features

### Dashboard
- Real-time event cards
- Media preview (image/video)
- Thumbnail navigation
- Quick actions (Dismiss/Generate Alarm)
- WebSocket live updates

### Accounts Page
- Account list with details
- Camera management per account
- Contact information
- Notes and metadata

### Alarm Detail
- Full media view
- Live video feed option
- Account/camera information
- Contact list with click-to-call
- Notes editor
- Resolve functionality

## 💡 Tips

1. **Multiple Images:** Send 2+ images in one email to auto-create video
2. **RTSP Streaming:** Requires proper network configuration
3. **Email Testing:** Use test scripts before configuring real cameras
4. **Backup:** Regularly backup database and uploads folder
5. **Monitoring:** Watch backend logs for SMTP activity
6. **Performance:** Consider HLS/WebRTC for live video in production

## 📞 Support Resources

- **README.md** - Full project documentation
- **SETUP_GUIDE.md** - Detailed setup instructions
- **Backend Logs** - Check for error messages
- **Browser Console** - Check for frontend errors

## ⚡ Performance Tips

- Use PostgreSQL for production
- Enable caching for API responses
- Optimize image sizes before sending
- Use CDN for static assets
- Monitor database query performance
- Set up proper indexes

## 🔄 Update Commands

### Backend
```bash
pip install -r requirements.txt --upgrade
```

### Frontend
```bash
cd frontend
npm update
```

### Database Migration
```bash
# If using Alembic
alembic upgrade head
```
