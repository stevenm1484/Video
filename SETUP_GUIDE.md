# Video Monitoring Dashboard - Setup Guide

## Quick Start (Windows)

1. **Run the startup script:**
   ```cmd
   start.bat
   ```
   This will:
   - Create a virtual environment
   - Install all dependencies
   - Set up the database
   - Create an admin user
   - Start both backend and frontend

2. **Access the application:**
   - Open browser to `http://localhost:3000`
   - Login with:
     - Username: `admin`
     - Password: `admin`

## Quick Start (Linux/Mac)

1. **Make the script executable:**
   ```bash
   chmod +x start.sh
   ```

2. **Run the startup script:**
   ```bash
   ./start.sh
   ```

3. **Access the application:**
   - Open browser to `http://localhost:3000`
   - Login with:
     - Username: `admin`
     - Password: `admin`

## Manual Setup

### Step 1: Backend Setup

1. **Create virtual environment:**
   ```bash
   python -m venv venv
   ```

2. **Activate virtual environment:**
   - Windows: `venv\Scripts\activate.bat`
   - Linux/Mac: `source venv/bin/activate`

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create admin user:**
   ```bash
   cd backend
   python create_admin.py
   cd ..
   ```

5. **Start backend:**
   ```bash
   cd backend
   python main.py
   ```
   Backend runs on `http://localhost:8000`
   SMTP server runs on port `2525`

### Step 2: Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start frontend:**
   ```bash
   npm run dev
   ```
   Frontend runs on `http://localhost:3000`

## Testing the System

### Create Test Images

Run the test image creator:
```bash
python create_test_images.py
```

This creates sample images in `test_images/` directory.

### Add a Video Account

1. Login to the system
2. Go to "Accounts" page
3. Click "Add Account"
4. Fill in details:
   - Name: Test Security
   - Account Number: 12345
   - Add contacts (optional)
   - Add notes (optional)

### Add a Camera

1. Open the account you created
2. Click "Add Camera"
3. Fill in details:
   - Name: Front Door Camera
   - RTSP URL: `rtsp://admin:password@192.168.1.100:554/stream`
   - Location: Main Entrance
4. Copy the generated SMTP email (e.g., `camera-abc12345@monitor.local`)

### Send Test Alarm Email

Use the test email sender:
```bash
python test_smtp_sender.py camera-abc12345@monitor.local test_images/alarm1.jpg test_images/alarm2.jpg
```

Replace `camera-abc12345@monitor.local` with your camera's actual SMTP email.

### View the Alarm

1. Go back to Dashboard
2. You should see the new alarm event appear
3. Click "Generate Alarm" to investigate
4. View media, contacts, and add notes
5. Click "Resolve Alarm" when done

## Configuring Real Cameras

### Option 1: Camera Built-in Email

Most IP cameras have email notification settings:
1. Go to camera settings
2. Find "Email" or "SMTP" settings
3. Configure:
   - SMTP Server: Your server IP
   - SMTP Port: 2525
   - To Email: Camera's unique SMTP email
   - No authentication needed (for local testing)

### Option 2: Blue Iris or Similar NVR

If using Blue Iris or similar:
1. Set up email alerts
2. Configure SMTP settings
3. Attach snapshots or video clips
4. Send to camera's unique SMTP email

### Option 3: Motion Detection Software

If using Motion or similar:
1. Configure email notifications
2. Set SMTP server to your monitoring server
3. Attach images on motion events

## Production Configuration

### Security

1. **Change default password:**
   - Login as admin
   - Create a new admin user
   - Delete or disable default admin

2. **Set secure SECRET_KEY:**
   Create `backend/.env`:
   ```env
   SECRET_KEY=your-very-long-random-secret-key-here
   ```

3. **Use HTTPS:**
   - Configure reverse proxy (nginx/Apache)
   - Obtain SSL certificate (Let's Encrypt)

### Database

For production, use PostgreSQL:

1. **Install PostgreSQL**

2. **Create database:**
   ```sql
   CREATE DATABASE videomonitor;
   CREATE USER vmuser WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE videomonitor TO vmuser;
   ```

3. **Update .env:**
   ```env
   DATABASE_URL=postgresql://vmuser:secure_password@localhost/videomonitor
   ```

### SMTP Server

For production email:

1. **Use standard SMTP port:**
   Edit `backend/smtp_server.py`:
   ```python
   port=25  # or 587 for submission
   ```

2. **Configure firewall:**
   ```bash
   # Allow SMTP port
   sudo ufw allow 25/tcp
   ```

3. **Set up DNS:**
   Add MX record pointing to your server

### Process Management

Use a process manager like systemd or supervisor:

**Backend service (`/etc/systemd/system/videomonitor-backend.service`):**
```ini
[Unit]
Description=Video Monitor Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/videomonitoring/backend
Environment="PATH=/path/to/videomonitoring/venv/bin"
ExecStart=/path/to/videomonitoring/venv/bin/python main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable videomonitor-backend
sudo systemctl start videomonitor-backend
```

### Frontend Build

Build for production:
```bash
cd frontend
npm run build
```

Serve with nginx:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        root /path/to/videomonitoring/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Troubleshooting

### Backend won't start

**Error: "Address already in use"**
- Port 8000 or 2525 is in use
- Solution: Kill process or change port

**Error: "Module not found"**
- Dependencies not installed
- Solution: `pip install -r requirements.txt`

### Frontend won't start

**Error: "Cannot find module"**
- Dependencies not installed
- Solution: `npm install`

**Error: "Port 3000 already in use"**
- Another app using port 3000
- Solution: Change port in `vite.config.js`

### SMTP not receiving

**No emails arriving:**
1. Check backend logs
2. Verify SMTP server is running (check logs for "SMTP Server running")
3. Test with telnet:
   ```bash
   telnet localhost 2525
   HELO test
   MAIL FROM: test@test.com
   RCPT TO: camera-abc@monitor.local
   DATA
   Subject: Test
   
   Test message.
   .
   QUIT
   ```

### WebSocket issues

**Events not appearing in real-time:**
1. Check browser console for WebSocket errors
2. Verify backend is running
3. Check firewall/proxy settings

### Video processing fails

**Images not combining into video:**
1. Check OpenCV installation: `pip install opencv-python`
2. Verify images are valid JPG/PNG
3. Check backend logs for errors

## Advanced Configuration

### Custom SMTP Port

Edit `backend/smtp_server.py`:
```python
self.controller = Controller(
    self.handler,
    hostname='0.0.0.0',
    port=YOUR_PORT  # Change here
)
```

### Multiple Instances

Run multiple instances for high availability:
1. Use load balancer (nginx/HAProxy)
2. Share database (PostgreSQL)
3. Share uploads directory (NFS/S3)

### Email Authentication

Add SMTP authentication in `backend/smtp_server.py`:
```python
class Authenticator:
    def __call__(self, server, session, envelope, mechanism, auth_data):
        # Implement authentication logic
        return True

handler = CustomSMTPHandler(websocket_manager)
controller = Controller(
    handler,
    hostname='0.0.0.0',
    port=2525,
    authenticator=Authenticator()
)
```

## Support

For issues and questions:
- Check logs in `backend/` directory
- Review this setup guide
- Open an issue on GitHub

## Next Steps

1. Add more user accounts with different roles
2. Set up multiple cameras
3. Configure real camera email notifications
4. Set up automated backups
5. Configure monitoring and alerts
