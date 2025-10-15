# AWS Deployment Guide for Video Monitoring Dashboard

This guide covers deploying the Video Monitoring Dashboard to AWS EC2.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [EC2 Instance Setup](#ec2-instance-setup)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [SSL/HTTPS Setup](#sslhttps-setup)
6. [Database Options](#database-options)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required AWS Resources

- **EC2 Instance**: t3.medium or larger (2 vCPU, 4 GB RAM minimum)
- **EBS Volume**: 30 GB+ for application and media storage
- **Security Group**: Properly configured firewall rules
- **Elastic IP**: Static IP address (recommended)
- **Domain Name**: Optional but recommended for SSL

### Required Ports

Configure your EC2 Security Group to allow:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP | SSH access |
| 80 | TCP | 0.0.0.0/0 | HTTP (redirects to HTTPS) |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 2525 | TCP | Camera IPs | SMTP for alarm emails |

---

## EC2 Instance Setup

### 1. Launch EC2 Instance

```bash
# Recommended AMI options:
# - Amazon Linux 2023
# - Ubuntu 22.04 LTS
# - Debian 11

# Instance type: t3.medium or larger
# Storage: 30 GB EBS (gp3)
```

### 2. Connect to Instance

```bash
# SSH into your instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Or for Ubuntu:
ssh -i your-key.pem ubuntu@your-instance-ip
```

### 3. Update System

```bash
# Amazon Linux 2023
sudo dnf update -y

# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
```

---

## Installation

### Option 1: Automated Deployment (Recommended)

```bash
# Clone repository
cd /tmp
git clone https://github.com/yourusername/videomonitoring.git
cd videomonitoring/aws-deployment

# Make scripts executable
chmod +x *.sh

# Run deployment script
sudo bash deploy.sh
```

The deployment script will:
- ✓ Install all system dependencies
- ✓ Install FFmpeg
- ✓ Setup Python virtual environment
- ✓ Install Python packages
- ✓ Build React frontend
- ✓ Configure Nginx
- ✓ Setup systemd services
- ✓ Start all services

### Option 2: Manual Installation

#### Step 1: Install System Dependencies

**Amazon Linux 2023:**
```bash
sudo dnf install -y python3 python3-pip python3-devel nginx git \
    postgresql postgresql-server postgresql-devel gcc gcc-c++ make

# Install Node.js
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs
```

**Ubuntu 22.04:**
```bash
sudo apt install -y python3 python3-pip python3-venv nginx git \
    postgresql postgresql-contrib libpq-dev build-essential curl

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

#### Step 2: Install FFmpeg

```bash
cd /tmp/videomonitoring/aws-deployment
chmod +x install_ffmpeg.sh
sudo bash install_ffmpeg.sh
```

#### Step 3: Setup Application

```bash
# Create application directory
sudo mkdir -p /var/www/videomonitoring
sudo chown $USER:$USER /var/www/videomonitoring

# Clone repository
git clone https://github.com/yourusername/videomonitoring.git /var/www/videomonitoring
cd /var/www/videomonitoring

# Setup Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install wheel gunicorn psycopg2-binary psutil
pip install -r requirements.txt
```

#### Step 4: Setup Database

```bash
cd /var/www/videomonitoring/backend

# Create admin user (will prompt for password)
python create_admin.py
```

#### Step 5: Build Frontend

```bash
cd /var/www/videomonitoring/frontend
npm install
npm run build
```

#### Step 6: Configure Nginx

```bash
# Copy nginx configuration
sudo cp /var/www/videomonitoring/aws-deployment/nginx.conf \
    /etc/nginx/sites-available/videomonitoring

# Update domain (replace your-domain.com with your actual domain or IP)
sudo sed -i 's/your-domain.com/your-actual-domain.com/g' \
    /etc/nginx/sites-available/videomonitoring

# Enable site
sudo ln -sf /etc/nginx/sites-available/videomonitoring \
    /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

#### Step 7: Setup Systemd Services

```bash
# Copy service files
sudo cp /var/www/videomonitoring/aws-deployment/systemd/videomonitoring-backend.service \
    /etc/systemd/system/

sudo cp /var/www/videomonitoring/aws-deployment/gunicorn.conf.py \
    /var/www/videomonitoring/

# Create log directory
sudo mkdir -p /var/log/videomonitoring
sudo mkdir -p /var/run/videomonitoring
sudo chown www-data:www-data /var/log/videomonitoring
sudo chown www-data:www-data /var/run/videomonitoring

# Set permissions
sudo chown -R www-data:www-data /var/www/videomonitoring

# Reload systemd
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable videomonitoring-backend
sudo systemctl start videomonitoring-backend

sudo systemctl enable nginx
sudo systemctl restart nginx
```

---

## Configuration

### Environment Variables

Edit the systemd service file to add environment variables:

```bash
sudo nano /etc/systemd/system/videomonitoring-backend.service
```

Add or modify:
```ini
Environment="SECRET_KEY=your-strong-secret-key-here"
Environment="DATABASE_URL=sqlite:////var/www/videomonitoring/backend/video_monitoring.db"
Environment="ALLOWED_ORIGINS=https://your-domain.com"
Environment="MAX_UPLOAD_SIZE=104857600"  # 100MB
```

After changes:
```bash
sudo systemctl daemon-reload
sudo systemctl restart videomonitoring-backend
```

### Nginx Configuration

Edit Nginx config for custom settings:

```bash
sudo nano /etc/nginx/sites-available/videomonitoring
```

Key settings to customize:
- `server_name`: Your domain or IP
- `client_max_body_size`: Maximum upload size
- `proxy_read_timeout`: Timeout for long requests

After changes:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL/HTTPS Setup

### Using Let's Encrypt (Recommended)

```bash
cd /var/www/videomonitoring/aws-deployment
chmod +x ssl_setup.sh
sudo bash ssl_setup.sh your-domain.com
```

This will:
- Install Certbot
- Obtain SSL certificate
- Update Nginx configuration for HTTPS
- Setup automatic renewal

### Certificate Renewal

Certificates auto-renew. Test renewal:
```bash
sudo certbot renew --dry-run
```

### Manual Certificate Setup

If using your own certificates:

```bash
# Copy certificates
sudo cp your-cert.pem /etc/ssl/certs/videomonitoring.crt
sudo cp your-key.pem /etc/ssl/private/videomonitoring.key

# Update nginx config
sudo nano /etc/nginx/sites-available/videomonitoring
```

Add SSL configuration:
```nginx
ssl_certificate /etc/ssl/certs/videomonitoring.crt;
ssl_certificate_key /etc/ssl/private/videomonitoring.key;
```

---

## Database Options

### Option 1: SQLite (Default)

Good for small deployments (< 10 cameras, < 1000 events/day).

Already configured in default installation.

### Option 2: PostgreSQL (Recommended for Production)

#### Install PostgreSQL

**Amazon Linux:**
```bash
sudo dnf install -y postgresql15-server postgresql15
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

**Ubuntu:**
```bash
sudo apt install -y postgresql postgresql-contrib
```

#### Setup Database

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE videomonitoring;
CREATE USER videomonitor WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE videomonitoring TO videomonitor;
\q
```

#### Update Application

```bash
# Install PostgreSQL adapter
source /var/www/videomonitoring/venv/bin/activate
pip install psycopg2-binary

# Update systemd service
sudo nano /etc/systemd/system/videomonitoring-backend.service
```

Change environment variable:
```ini
Environment="DATABASE_URL=postgresql://videomonitor:your-secure-password@localhost/videomonitoring"
```

Restart service:
```bash
sudo systemctl daemon-reload
sudo systemctl restart videomonitoring-backend
```

### Option 3: Amazon RDS PostgreSQL

1. Create RDS PostgreSQL instance in AWS Console
2. Configure security group to allow EC2 access
3. Update `DATABASE_URL` with RDS endpoint

---

## Monitoring & Maintenance

### Service Management

```bash
# Check service status
sudo systemctl status videomonitoring-backend

# View logs
sudo journalctl -u videomonitoring-backend -f

# Restart service
sudo systemctl restart videomonitoring-backend

# Check nginx
sudo systemctl status nginx
sudo nginx -t
```

### Log Files

```bash
# Application logs
sudo tail -f /var/log/videomonitoring/error.log
sudo tail -f /var/log/videomonitoring/access.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u videomonitoring-backend -n 100
```

### Disk Space Management

```bash
# Check disk usage
df -h

# Clean old segments
sudo find /var/www/videomonitoring/streams -name "*.ts" -mtime +1 -delete

# Clean old uploads (optional)
sudo find /var/www/videomonitoring/uploads -mtime +30 -delete

# Vacuum database (SQLite)
sqlite3 /var/www/videomonitoring/backend/video_monitoring.db "VACUUM;"
```

### Backup Strategy

```bash
#!/bin/bash
# /usr/local/bin/backup-videomonitoring.sh

BACKUP_DIR="/var/backups/videomonitoring"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp /var/www/videomonitoring/backend/video_monitoring.db \
   $BACKUP_DIR/db_$DATE.db

# Backup uploads (last 7 days)
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz \
   -C /var/www/videomonitoring uploads

# Remove old backups (> 30 days)
find $BACKUP_DIR -mtime +30 -delete

# Sync to S3 (optional)
# aws s3 sync $BACKUP_DIR s3://your-bucket/backups/
```

Add to crontab:
```bash
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-videomonitoring.sh
```

### System Monitoring

Install monitoring tools:

```bash
# Install htop for process monitoring
sudo dnf install -y htop  # Amazon Linux
sudo apt install -y htop  # Ubuntu

# Install netdata for comprehensive monitoring
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```

### Performance Tuning

#### Increase File Limits

```bash
# Edit limits
sudo nano /etc/security/limits.conf

# Add:
www-data soft nofile 65536
www-data hard nofile 65536
```

#### Optimize Gunicorn Workers

Edit `gunicorn.conf.py`:
```python
# Adjust workers based on CPU cores
workers = (2 * cpu_count) + 1
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u videomonitoring-backend -n 50

# Check permissions
sudo chown -R www-data:www-data /var/www/videomonitoring

# Check Python path
source /var/www/videomonitoring/venv/bin/activate
python -c "import main"
```

### Nginx Errors

```bash
# Test configuration
sudo nginx -t

# Check error log
sudo tail -f /var/log/nginx/error.log

# Common fixes:
sudo chmod -R 755 /var/www/videomonitoring/frontend/dist
sudo chown -R www-data:www-data /var/www/videomonitoring
```

### Database Connection Issues

```bash
# SQLite permissions
sudo chown www-data:www-data /var/www/videomonitoring/backend/video_monitoring.db

# PostgreSQL connection
psql -U videomonitor -d videomonitoring -h localhost

# Check DATABASE_URL
sudo systemctl show videomonitoring-backend | grep DATABASE_URL
```

### FFmpeg Streaming Issues

```bash
# Test FFmpeg
ffmpeg -version

# Check FFmpeg processes
ps aux | grep ffmpeg

# Check streams directory
ls -la /var/www/videomonitoring/streams/

# Permissions
sudo chown -R www-data:www-data /var/www/videomonitoring/streams
```

### WebSocket Connection Failed

```bash
# Check if service is running
sudo systemctl status videomonitoring-backend

# Check firewall
sudo iptables -L -n

# Check nginx config
sudo nginx -t

# Test WebSocket
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:8000/ws
```

### High Memory Usage

```bash
# Check memory
free -h

# Check process memory
ps aux --sort=-%mem | head

# Reduce Gunicorn workers
sudo nano /var/www/videomonitoring/gunicorn.conf.py
# Set: workers = 2

# Restart
sudo systemctl restart videomonitoring-backend
```

### SMTP Port Issues

```bash
# Test SMTP port
telnet localhost 2525

# Check if port is listening
sudo netstat -tulpn | grep 2525

# Allow in firewall
sudo ufw allow 2525/tcp
```

---

## Updating the Application

```bash
cd /var/www/videomonitoring

# Stop services
sudo systemctl stop videomonitoring-backend

# Backup database
cp backend/video_monitoring.db backend/video_monitoring.db.backup

# Pull updates
git pull

# Update Python dependencies
source venv/bin/activate
pip install -r requirements.txt

# Rebuild frontend
cd frontend
npm install
npm run build
cd ..

# Restart services
sudo systemctl start videomonitoring-backend
```

---

## Security Best Practices

1. **Change default credentials** immediately after deployment
2. **Use strong SECRET_KEY** in environment variables
3. **Enable SSL/HTTPS** for production
4. **Restrict SMTP port** (2525) to camera IP addresses only
5. **Regular backups** of database and media files
6. **Keep system updated**: `sudo dnf update -y` or `sudo apt update && sudo apt upgrade -y`
7. **Monitor logs** for suspicious activity
8. **Use Amazon RDS** for database in production
9. **Setup CloudWatch** alarms for monitoring

---

## Support Resources

- **Application Logs**: `/var/log/videomonitoring/`
- **System Logs**: `journalctl -u videomonitoring-backend`
- **Nginx Logs**: `/var/log/nginx/`
- **Documentation**: `ARCHITECTURE.md`, `STREAMING_GUIDE.md`

---

## Next Steps

After successful deployment:

1. ✓ Access the application at `http://your-domain.com`
2. ✓ Login with default admin credentials
3. ✓ Change admin password
4. ✓ Create video accounts and cameras
5. ✓ Configure cameras to send emails to generated SMTP addresses
6. ✓ Test live streaming functionality
7. ✓ Setup SSL certificate
8. ✓ Configure backups
9. ✓ Setup monitoring

---

Congratulations! Your Video Monitoring Dashboard is now deployed on AWS. 🎉

