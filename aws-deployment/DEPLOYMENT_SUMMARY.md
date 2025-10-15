# AWS Deployment Configuration - Summary

## ✅ What Has Been Created

This deployment package contains everything needed to deploy the Video Monitoring Dashboard to AWS.

### 📁 File Structure

```
aws-deployment/
├── README.md                          # Main AWS deployment documentation
├── AWS_DEPLOYMENT_GUIDE.md           # Comprehensive 400+ line guide
├── QUICK_START.md                     # 15-minute quick start
├── DEPLOYMENT_SUMMARY.md             # This file
│
├── Configuration Files
├── nginx.conf                         # Nginx reverse proxy config
├── gunicorn.conf.py                  # Gunicorn WSGI server config
│
├── Deployment Scripts
├── deploy.sh                          # ⭐ Main automated deployment script
├── install_ffmpeg.sh                  # FFmpeg installation for AWS Linux
├── ssl_setup.sh                       # SSL/HTTPS with Let's Encrypt
├── monitoring.sh                      # Real-time system monitoring
├── backup.sh                          # Automated backup script
├── health-check.sh                    # Health check for load balancers
│
├── Systemd Services
├── systemd/
│   ├── videomonitoring-backend.service   # Backend service
│   └── videomonitoring-smtp.service      # SMTP server service
│
├── Docker Configuration
├── docker/
│   ├── Dockerfile                     # Container image
│   └── docker-compose.yml             # Multi-container orchestration
│
├── Infrastructure as Code
└── cloudformation/
    └── videomonitoring-stack.yaml     # Complete AWS infrastructure template
```

## 🎯 Deployment Options

### Option 1: Automated Script (Fastest) ⭐

**Time: ~10-15 minutes**

```bash
cd aws-deployment
chmod +x deploy.sh
sudo bash deploy.sh
```

**What it does:**
1. Detects OS (Amazon Linux, Ubuntu, Debian, CentOS)
2. Installs system dependencies
3. Installs FFmpeg from source
4. Creates Python virtual environment
5. Installs Python packages
6. Builds React frontend
7. Configures Nginx
8. Sets up systemd services
9. Starts everything

**Result:** Fully working application on `http://your-ip`

### Option 2: Docker Deployment (Portable)

**Time: ~5 minutes**

```bash
cd docker
docker-compose up -d
```

**Includes:**
- FastAPI backend
- PostgreSQL database
- Redis cache
- Nginx reverse proxy

**Result:** Containerized, scalable application

### Option 3: CloudFormation (Full Infrastructure)

**Time: ~20 minutes**

```bash
aws cloudformation create-stack \
  --stack-name videomonitoring \
  --template-body file://cloudformation/videomonitoring-stack.yaml \
  --parameters ParameterKey=KeyName,ParameterValue=your-key \
  --capabilities CAPABILITY_IAM
```

**Creates:**
- VPC with subnet
- EC2 instance
- Security groups
- Elastic IP
- S3 bucket
- IAM roles

**Result:** Complete AWS infrastructure with auto-deployment

### Option 4: Manual Deployment (Full Control)

**Time: ~30-45 minutes**

Follow step-by-step guide in `AWS_DEPLOYMENT_GUIDE.md`

## 🔧 Configuration Components

### 1. Nginx Configuration

**File:** `nginx.conf`

**Features:**
- Reverse proxy to FastAPI backend
- WebSocket support for real-time updates
- Static file serving (frontend, uploads, streams)
- HLS video streaming with CORS
- 100MB upload limit
- SSL/TLS termination ready

**Endpoints:**
- `/` → React frontend
- `/api` → FastAPI backend
- `/ws` → WebSocket connection
- `/uploads` → Uploaded media files
- `/streams` → HLS video streams

### 2. Gunicorn Configuration

**File:** `gunicorn.conf.py`

**Settings:**
- Workers: `(2 × CPU_count) + 1`
- Worker class: Uvicorn (ASGI)
- Timeout: 5 minutes
- Bind: 127.0.0.1:8000
- User: www-data

**Logs:**
- Access: `/var/log/videomonitoring/access.log`
- Error: `/var/log/videomonitoring/error.log`

### 3. Systemd Services

**Files:**
- `videomonitoring-backend.service`
- `videomonitoring-smtp.service`

**Features:**
- Auto-start on boot
- Auto-restart on failure
- Resource limits
- Security restrictions
- Logging to journald

**Commands:**
```bash
sudo systemctl start videomonitoring-backend
sudo systemctl stop videomonitoring-backend
sudo systemctl restart videomonitoring-backend
sudo systemctl status videomonitoring-backend
sudo journalctl -u videomonitoring-backend -f
```

### 4. FFmpeg Installation

**File:** `install_ffmpeg.sh`

**Compiles from source with:**
- H.264 encoder (libx264)
- H.265 encoder (libx265)
- AAC audio (libfdk-aac)
- RTSP input support
- HLS output support

**Supported OS:**
- Amazon Linux 2/2023
- Ubuntu 20.04+
- Debian 11+
- CentOS 7+
- RHEL 7+

### 5. SSL/HTTPS Setup

**File:** `ssl_setup.sh`

**Features:**
- Automatic Let's Encrypt certificate
- Nginx HTTPS configuration
- HTTP to HTTPS redirect
- Auto-renewal setup
- Security headers

**Usage:**
```bash
sudo bash ssl_setup.sh your-domain.com
```

### 6. Monitoring Script

**File:** `monitoring.sh`

**Displays:**
- Service status (backend, nginx)
- Port status (8000, 80, 443, 2525)
- CPU/Memory/Disk usage
- Active FFmpeg processes
- Recent errors
- Storage usage

**Usage:**
```bash
bash monitoring.sh
```

### 7. Backup Script

**File:** `backup.sh`

**Backs up:**
- Database (SQLite/PostgreSQL)
- Recent uploads (last 7 days)
- Configuration files
- Optional S3 sync

**Setup:**
```bash
sudo cp backup.sh /usr/local/bin/backup-videomonitoring.sh
sudo chmod +x /usr/local/bin/backup-videomonitoring.sh
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-videomonitoring.sh
```

### 8. Health Check Script

**File:** `health-check.sh`

**Checks:**
- Backend API responsiveness
- Service status
- Disk space (fail if >90%)
- Memory (fail if <100MB)

**Usage:**
```bash
bash health-check.sh
echo $?  # 0 = healthy, 1 = unhealthy
```

## 🗄️ Database Options

### SQLite (Default)
- **Location:** `/var/www/videomonitoring/backend/video_monitoring.db`
- **Good for:** <10 cameras, <1000 events/day
- **Setup:** None required (auto-created)

### PostgreSQL (Recommended)
- **Setup:** Included in deploy.sh
- **Good for:** Production deployments
- **Features:** Concurrent access, replication

### Amazon RDS
- **Setup:** CloudFormation template included
- **Good for:** High availability
- **Features:** Automated backups, multi-AZ

## 🔒 Security Features

### Application Security
- ✅ JWT authentication with bcrypt hashing
- ✅ CORS configuration via environment variables
- ✅ Secret key from environment
- ✅ Input validation with Pydantic

### Infrastructure Security
- ✅ HTTPS/SSL with Let's Encrypt
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ Firewall configuration (UFW/firewalld)
- ✅ Process isolation (www-data user)
- ✅ Read-only mounts for static files
- ✅ Resource limits (CPU, memory, file descriptors)

### Network Security
- ✅ Nginx reverse proxy
- ✅ Backend not directly exposed
- ✅ AWS Security Groups
- ✅ VPC isolation (CloudFormation)

## 📊 Monitoring & Logging

### Application Logs
```bash
# Real-time logs
sudo journalctl -u videomonitoring-backend -f

# Error logs only
sudo journalctl -u videomonitoring-backend -p err

# Gunicorn logs
sudo tail -f /var/log/videomonitoring/error.log
sudo tail -f /var/log/videomonitoring/access.log
```

### Nginx Logs
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### System Monitoring
```bash
# Run monitoring dashboard
bash aws-deployment/monitoring.sh

# Check resource usage
htop
df -h
free -h
```

### AWS CloudWatch (Optional)
- EC2 metrics (CPU, network, disk)
- Custom metrics via CloudWatch agent
- Alarms for high resource usage
- Log aggregation

## 🔄 Maintenance Tasks

### Update Application
```bash
cd /var/www/videomonitoring
sudo systemctl stop videomonitoring-backend
git pull
source venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && npm run build
sudo systemctl start videomonitoring-backend
```

### Clean Old Files
```bash
# Remove old HLS segments
find /var/www/videomonitoring/streams -name "*.ts" -mtime +1 -delete

# Remove old uploads (30+ days)
find /var/www/videomonitoring/uploads -mtime +30 -delete
```

### Renew SSL Certificate
```bash
# Test renewal
sudo certbot renew --dry-run

# Manual renewal (usually automatic)
sudo certbot renew
sudo systemctl reload nginx
```

### Database Maintenance
```bash
# SQLite vacuum
sqlite3 /var/www/videomonitoring/backend/video_monitoring.db "VACUUM;"

# PostgreSQL vacuum
sudo -u postgres vacuumdb --all --analyze
```

## 💰 Cost Estimate

### AWS Resources
| Resource | Type | Monthly Cost |
|----------|------|-------------|
| EC2 | t3.medium | ~$30 |
| EBS | 50GB gp3 | ~$4 |
| Elastic IP | (attached) | Free |
| Data Transfer | ~50GB | ~$5 |
| **Total** | | **~$40/month** |

### Cost Optimization
- Use Reserved Instances (save 30-40%)
- Implement S3 lifecycle policies
- Use CloudFront CDN
- Auto-scaling for variable load
- Spot instances for development

## 🚀 Getting Started

### Prerequisites
1. AWS account
2. EC2 instance running (t3.medium+)
3. SSH key pair
4. Security group configured
5. Domain name (optional, for SSL)

### Quick Start (3 steps)
```bash
# 1. SSH into instance
ssh -i your-key.pem ec2-user@your-instance-ip

# 2. Clone and deploy
cd /tmp
git clone https://github.com/yourusername/videomonitoring.git
cd videomonitoring/aws-deployment
chmod +x deploy.sh
sudo bash deploy.sh

# 3. Access application
# http://your-instance-ip
```

### Post-Deployment
1. Access application
2. Login (admin/admin123)
3. Change admin password
4. Setup SSL: `sudo bash ssl_setup.sh your-domain.com`
5. Configure cameras
6. Setup backups

## 📚 Documentation

### Main Guides
- **[QUICK_START.md](QUICK_START.md)** - Get running in 15 minutes
- **[AWS_DEPLOYMENT_GUIDE.md](AWS_DEPLOYMENT_GUIDE.md)** - Comprehensive guide
- **[README.md](README.md)** - Configuration reference

### Project Documentation
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** - System architecture
- **[../STREAMING_GUIDE.md](../STREAMING_GUIDE.md)** - RTSP/HLS streaming
- **[../SETUP_GUIDE.md](../SETUP_GUIDE.md)** - Local development

## 🐛 Troubleshooting

### Service Issues
```bash
# Check status
sudo systemctl status videomonitoring-backend

# View logs
sudo journalctl -u videomonitoring-backend -n 100

# Restart
sudo systemctl restart videomonitoring-backend
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Reload
sudo systemctl reload nginx

# View errors
sudo tail -f /var/log/nginx/error.log
```

### FFmpeg Issues
```bash
# Check installation
ffmpeg -version

# Reinstall
sudo bash install_ffmpeg.sh

# Check processes
ps aux | grep ffmpeg
```

### Database Issues
```bash
# Check permissions (SQLite)
sudo chown www-data:www-data /var/www/videomonitoring/backend/*.db

# Test connection (PostgreSQL)
psql -U videomonitor -d videomonitoring -h localhost

# Check DATABASE_URL
sudo systemctl show videomonitoring-backend | grep DATABASE
```

## ✅ Production Checklist

Before going live:

- [ ] Deploy application successfully
- [ ] Change default admin password
- [ ] Setup SSL certificate
- [ ] Configure environment variables
- [ ] Update CORS allowed origins
- [ ] Setup database backups
- [ ] Configure firewall rules
- [ ] Test camera SMTP
- [ ] Test live streaming
- [ ] Setup monitoring
- [ ] Configure alerts
- [ ] Document camera configurations
- [ ] Create additional admin users
- [ ] Test backup restoration
- [ ] Setup log rotation
- [ ] Configure S3 backup sync

## 🎉 Success!

Your Video Monitoring Dashboard is now deployed on AWS with:

✅ Production-grade web server (Nginx + Gunicorn)  
✅ RTSP to HLS streaming with FFmpeg  
✅ SMTP server for camera alarms  
✅ Real-time WebSocket updates  
✅ Automated backups  
✅ System monitoring  
✅ SSL/HTTPS support  
✅ Systemd service management  
✅ Docker alternative  
✅ CloudFormation IaC  
✅ Comprehensive documentation  

---

**Need help?** Check the guides or open an issue on GitHub.

**Ready to scale?** Consider AWS Auto Scaling, RDS, CloudFront, and S3.

**Happy monitoring!** 🚀📹

