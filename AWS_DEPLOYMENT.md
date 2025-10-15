# AWS Deployment - Video Monitoring Dashboard

Your video monitoring application is now ready for AWS deployment! All necessary configuration files and scripts have been created in the `aws-deployment/` directory.

## 📁 What's Been Created

### Core Configuration Files
- ✅ **nginx.conf** - Nginx reverse proxy configuration
- ✅ **gunicorn.conf.py** - Gunicorn WSGI server configuration  
- ✅ **systemd services** - Systemd service files for backend and SMTP

### Deployment Scripts
- ✅ **deploy.sh** - Automated deployment script (one-command setup)
- ✅ **install_ffmpeg.sh** - FFmpeg installation for Amazon Linux/Ubuntu
- ✅ **ssl_setup.sh** - SSL/HTTPS setup with Let's Encrypt
- ✅ **monitoring.sh** - Real-time system monitoring
- ✅ **backup.sh** - Automated backup script
- ✅ **health-check.sh** - Health check for load balancers

### Infrastructure as Code
- ✅ **Dockerfile** - Container image definition
- ✅ **docker-compose.yml** - Docker orchestration
- ✅ **CloudFormation template** - Full AWS infrastructure

### Documentation
- ✅ **AWS_DEPLOYMENT_GUIDE.md** - Comprehensive 400+ line deployment guide
- ✅ **QUICK_START.md** - 15-minute quick start guide
- ✅ **README.md** - AWS deployment documentation

## 🚀 Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
# 1. SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-instance-ip

# 2. Clone and deploy
cd /tmp
git clone https://github.com/yourusername/videomonitoring.git
cd videomonitoring/aws-deployment
chmod +x deploy.sh
sudo bash deploy.sh
```

**That's it!** The script handles everything:
- System dependencies installation
- FFmpeg compilation/installation
- Python virtual environment setup
- Frontend build
- Nginx configuration
- Service setup and startup

### Option 2: Docker Deployment

```bash
cd aws-deployment/docker
docker-compose up -d
```

### Option 3: CloudFormation (Full Infrastructure)

```bash
cd aws-deployment/cloudformation
aws cloudformation create-stack \
  --stack-name videomonitoring \
  --template-body file://videomonitoring-stack.yaml \
  --parameters ParameterKey=KeyName,ParameterValue=your-key \
  --capabilities CAPABILITY_IAM
```

## 📋 AWS Prerequisites

### EC2 Instance Requirements
- **Instance Type**: t3.medium or larger (2 vCPU, 4 GB RAM)
- **OS**: Amazon Linux 2023, Ubuntu 22.04, or Debian 11
- **Storage**: 30 GB+ EBS volume (gp3 recommended)
- **Elastic IP**: Recommended for static address

### Security Group Ports
| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22   | TCP      | Your IP | SSH access |
| 80   | TCP      | 0.0.0.0/0 | HTTP |
| 443  | TCP      | 0.0.0.0/0 | HTTPS |
| 2525 | TCP      | Camera IPs | SMTP for alarms |

## 🏗️ Architecture on AWS

```
                     ┌─────────────────┐
                     │   CloudFront    │ (Optional CDN)
                     │   + Route 53    │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │      Nginx      │ (Reverse Proxy)
                     │   Port 80/443   │
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │  FastAPI + Gunicorn │
                     │    Port 8000     │ (Backend)
                     │  + SMTP (2525)   │
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼────────┐  ┌──▼──────┐  ┌────▼─────┐
     │   RDS/SQLite    │  │   S3    │  │  FFmpeg  │
     │   (Database)    │  │(Storage)│  │(Streaming)│
     └─────────────────┘  └─────────┘  └──────────┘
```

## 🔧 Configuration Files Explained

### 1. Nginx Configuration (`nginx.conf`)

Handles:
- Reverse proxy for FastAPI backend
- WebSocket connections for real-time updates
- Static file serving (frontend, uploads, streams)
- HLS video streaming with proper CORS headers
- SSL/TLS termination

**Key Features:**
- 100MB max upload size
- 5-minute API timeout
- 7-day WebSocket timeout
- No caching for live streams
- Security headers

### 2. Gunicorn Configuration (`gunicorn.conf.py`)

Production WSGI server settings:
- Worker processes: `(2 × CPU cores) + 1`
- Worker class: `uvicorn.workers.UvicornWorker` (ASGI)
- Timeout: 5 minutes for long-running requests
- Logging to `/var/log/videomonitoring/`

### 3. Systemd Services

**videomonitoring-backend.service:**
- Runs backend with Gunicorn
- Auto-restart on failure
- Proper security restrictions
- Resource limits

### 4. FFmpeg Installation Script

Compiles FFmpeg from source with:
- H.264 encoding (libx264)
- H.265 encoding (libx265)
- AAC audio encoding (libfdk-aac)
- RTSP support
- HLS output

Supports: Amazon Linux 2/2023, Ubuntu, Debian, CentOS

## 📊 Database Options

### SQLite (Default)
- Good for: < 10 cameras, < 1000 events/day
- Pros: No setup, single file
- Cons: No concurrent writes

### PostgreSQL (Recommended)
- Good for: Production deployments
- Pros: Concurrent access, advanced features
- Setup included in deployment script

### Amazon RDS
- Good for: High availability, managed service
- CloudFormation template included
- Automated backups

## 🔒 Security Features

- **Authentication**: JWT tokens with bcrypt password hashing
- **HTTPS**: Let's Encrypt SSL certificates (auto-renewal)
- **CORS**: Configurable allowed origins
- **Rate Limiting**: Optional with SlowAPI
- **Firewall**: UFW/firewalld configuration
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.
- **Process Isolation**: Runs as www-data user
- **Read-only Mounts**: Static files served read-only

## 📈 Monitoring & Maintenance

### Real-time Monitoring
```bash
bash aws-deployment/monitoring.sh
```

Shows:
- Service status
- Port availability  
- CPU/Memory/Disk usage
- Active FFmpeg streams
- Recent errors
- Storage usage

### Log Management
```bash
# View logs
sudo journalctl -u videomonitoring-backend -f

# Application logs
sudo tail -f /var/log/videomonitoring/error.log

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Automated Backups
```bash
# Setup backup cron job
sudo cp aws-deployment/backup.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup.sh
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/backup.sh
```

Backs up:
- Database (SQLite/PostgreSQL)
- Recent uploads (last 7 days)
- Configuration files
- Optional S3 sync

## 🔄 Updating Your Application

```bash
cd /var/www/videomonitoring
sudo systemctl stop videomonitoring-backend

# Backup first
cp backend/video_monitoring.db backend/video_monitoring.db.backup

# Update code
git pull
source venv/bin/activate
pip install -r requirements.txt

# Rebuild frontend
cd frontend
npm install
npm run build

# Restart
sudo systemctl start videomonitoring-backend
```

## 🐳 Docker Alternative

Complete Docker setup included:

```yaml
services:
  - backend (FastAPI + Gunicorn)
  - db (PostgreSQL)
  - redis (Caching)
  - nginx (Reverse proxy)
```

**Advantages:**
- Isolated environment
- Easy deployment
- Consistent across environments
- Simple scaling

## ☁️ CloudFormation Template

Creates complete infrastructure:
- ✅ VPC with public subnet
- ✅ Internet Gateway
- ✅ EC2 instance with auto-config
- ✅ Security Groups
- ✅ Elastic IP
- ✅ S3 bucket for backups
- ✅ IAM roles and policies

## 🚦 Next Steps

1. **Deploy to AWS**
   - Launch EC2 instance
   - Run deployment script
   - Access application

2. **Configure SSL**
   - Run ssl_setup.sh
   - Update domain DNS

3. **Setup Cameras**
   - Create video accounts
   - Add cameras
   - Configure SMTP settings

4. **Enable Backups**
   - Setup backup cron job
   - Configure S3 sync

5. **Monitor System**
   - Use monitoring script
   - Setup CloudWatch alarms
   - Review logs regularly

## 📚 Documentation

All documentation is in `aws-deployment/`:

- **[QUICK_START.md](aws-deployment/QUICK_START.md)** - Get running in 15 minutes
- **[AWS_DEPLOYMENT_GUIDE.md](aws-deployment/AWS_DEPLOYMENT_GUIDE.md)** - Complete deployment guide
- **[README.md](aws-deployment/README.md)** - Configuration details

## 🆘 Support & Troubleshooting

### Common Issues

**Service won't start:**
```bash
sudo journalctl -u videomonitoring-backend -n 50
sudo systemctl restart videomonitoring-backend
```

**FFmpeg not found:**
```bash
sudo bash aws-deployment/install_ffmpeg.sh
```

**Database connection failed:**
```bash
sudo chown www-data:www-data /var/www/videomonitoring/backend/*.db
```

**WebSocket connection failed:**
```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 💰 Cost Estimate (AWS)

**Typical monthly costs:**
- EC2 t3.medium: ~$30/month
- EBS 50GB gp3: ~$4/month
- Elastic IP: Free (if attached)
- Data transfer: ~$0.09/GB

**Total: ~$35-50/month** (depending on traffic)

**Cost optimization:**
- Use Reserved Instances (save 30-40%)
- Lifecycle policies for S3 storage
- CloudFront for reduced bandwidth
- Auto-scaling for variable load

## 🎉 Ready to Deploy!

Everything is set up and ready. Choose your deployment method:

1. **Quick & Easy**: Run `deploy.sh` script
2. **Containerized**: Use Docker Compose
3. **Infrastructure as Code**: Deploy CloudFormation stack

All paths lead to a fully functional, production-ready video monitoring system on AWS!

---

**Questions?** Check the comprehensive guides in `aws-deployment/` or open an issue on GitHub.

**Good luck with your deployment!** 🚀

