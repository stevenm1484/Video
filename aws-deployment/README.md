# AWS Deployment Configuration

Complete AWS deployment setup for the Video Monitoring Dashboard.

## 📁 Directory Structure

```
aws-deployment/
├── README.md                          # This file
├── AWS_DEPLOYMENT_GUIDE.md           # Comprehensive deployment guide
├── deploy.sh                          # Automated deployment script
├── install_ffmpeg.sh                  # FFmpeg installation for AWS Linux
├── ssl_setup.sh                       # SSL/HTTPS setup with Let's Encrypt
├── monitoring.sh                      # System monitoring script
├── nginx.conf                         # Nginx reverse proxy configuration
├── gunicorn.conf.py                  # Gunicorn WSGI server configuration
├── requirements-production.txt        # Production Python dependencies
├── systemd/
│   ├── videomonitoring-backend.service   # Backend systemd service
│   └── videomonitoring-smtp.service      # SMTP server systemd service
├── docker/
│   ├── Dockerfile                     # Docker container image
│   └── docker-compose.yml             # Docker Compose orchestration
└── cloudformation/
    └── videomonitoring-stack.yaml     # AWS CloudFormation IaC template
```

## 🚀 Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Clone repository
cd /tmp
git clone https://github.com/yourusername/videomonitoring.git
cd videomonitoring/aws-deployment

# Make scripts executable
chmod +x *.sh

# Run deployment
sudo bash deploy.sh
```

### Option 2: Manual Deployment

Follow the step-by-step instructions in [AWS_DEPLOYMENT_GUIDE.md](AWS_DEPLOYMENT_GUIDE.md)

### Option 3: Docker Deployment

```bash
cd docker
docker-compose up -d
```

### Option 4: CloudFormation Deployment

```bash
aws cloudformation create-stack \
  --stack-name videomonitoring \
  --template-body file://cloudformation/videomonitoring-stack.yaml \
  --parameters ParameterKey=KeyName,ParameterValue=your-key-name \
               ParameterKey=DatabasePassword,ParameterValue=secure-password \
  --capabilities CAPABILITY_IAM
```

## 📋 Prerequisites

### AWS Resources
- **EC2 Instance**: t3.medium or larger (2 vCPU, 4 GB RAM)
- **OS**: Amazon Linux 2023, Ubuntu 22.04, or Debian 11
- **Storage**: 30 GB+ EBS volume
- **Elastic IP**: For static IP address
- **Security Group**: Ports 22, 80, 443, 2525

### Required Ports
| Port | Protocol | Purpose |
|------|----------|---------|
| 22   | TCP      | SSH |
| 80   | TCP      | HTTP |
| 443  | TCP      | HTTPS |
| 2525 | TCP      | SMTP |
| 8000 | TCP      | Backend API (internal) |

## 🔧 Configuration Files

### 1. Nginx (`nginx.conf`)
- Reverse proxy for frontend and backend
- WebSocket support
- Static file serving
- HLS streaming configuration
- SSL/TLS termination

**Key Settings:**
```nginx
client_max_body_size 100M;  # Max upload size
proxy_read_timeout 300s;     # API timeout
```

### 2. Gunicorn (`gunicorn.conf.py`)
- WSGI server for FastAPI
- Worker process configuration
- Logging setup
- Process management

**Key Settings:**
```python
workers = (2 * cpu_count) + 1
worker_class = "uvicorn.workers.UvicornWorker"
timeout = 300
```

### 3. Systemd Services
- **videomonitoring-backend.service**: Main application
- **videomonitoring-smtp.service**: SMTP server (optional)

**Management Commands:**
```bash
sudo systemctl start videomonitoring-backend
sudo systemctl stop videomonitoring-backend
sudo systemctl restart videomonitoring-backend
sudo systemctl status videomonitoring-backend
```

## 🛠️ Installation Scripts

### FFmpeg Installation (`install_ffmpeg.sh`)

Installs FFmpeg with H.264/H.265 support for RTSP to HLS streaming.

**Usage:**
```bash
chmod +x install_ffmpeg.sh
sudo bash install_ffmpeg.sh
```

**Supported OS:**
- Amazon Linux 2
- Amazon Linux 2023
- Ubuntu 20.04+
- Debian 11+
- CentOS 7+

### SSL Setup (`ssl_setup.sh`)

Configures HTTPS using Let's Encrypt certificates.

**Usage:**
```bash
chmod +x ssl_setup.sh
sudo bash ssl_setup.sh your-domain.com
```

**Features:**
- Automatic certificate generation
- Nginx HTTPS configuration
- Auto-renewal setup
- HTTP to HTTPS redirect

### Monitoring (`monitoring.sh`)

Real-time system monitoring dashboard.

**Usage:**
```bash
bash monitoring.sh
```

**Monitors:**
- Service status
- Port availability
- CPU/Memory/Disk usage
- Active FFmpeg processes
- Recent errors
- Storage usage

## 🔒 Security Configuration

### Environment Variables

Edit systemd service file:
```bash
sudo nano /etc/systemd/system/videomonitoring-backend.service
```

Add:
```ini
Environment="SECRET_KEY=your-strong-secret-key"
Environment="DATABASE_URL=postgresql://user:pass@localhost/db"
Environment="ALLOWED_ORIGINS=https://your-domain.com"
```

### Firewall Rules

**UFW (Ubuntu/Debian):**
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 2525/tcp
sudo ufw enable
```

**firewalld (Amazon Linux/CentOS):**
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=2525/tcp
sudo firewall-cmd --reload
```

### AWS Security Group

```bash
# Allow HTTP/HTTPS from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow SMTP only from camera IPs
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 2525 \
  --cidr 192.168.1.0/24
```

## 📊 Database Options

### SQLite (Default)
- Good for small deployments
- No additional setup required
- Single file database

### PostgreSQL (Recommended)
- Better for production
- Concurrent access
- Advanced features

**Setup:**
```bash
# Install PostgreSQL
sudo dnf install -y postgresql15-server
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create database
sudo -u postgres psql
CREATE DATABASE videomonitoring;
CREATE USER videomonitor WITH PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE videomonitoring TO videomonitor;
```

**Update environment:**
```ini
Environment="DATABASE_URL=postgresql://videomonitor:password@localhost/videomonitoring"
```

### Amazon RDS
- Fully managed
- Automated backups
- High availability

**CloudFormation template included** for automated RDS setup.

## 🐳 Docker Deployment

### Using Docker Compose

```bash
cd docker
docker-compose up -d
```

**Services:**
- `backend`: FastAPI application
- `db`: PostgreSQL database
- `redis`: Cache (optional)
- `nginx`: Reverse proxy

**Management:**
```bash
docker-compose ps                    # Status
docker-compose logs -f backend      # Logs
docker-compose restart backend      # Restart
docker-compose down                 # Stop all
```

### Building Custom Image

```bash
docker build -t videomonitoring:latest -f docker/Dockerfile .
```

## ☁️ CloudFormation Deployment

Full infrastructure as code template included.

**Resources Created:**
- VPC with public subnet
- Internet Gateway
- EC2 instance with Auto Scaling (optional)
- Security Groups
- Elastic IP
- S3 bucket for backups
- IAM roles and policies

**Deploy:**
```bash
aws cloudformation create-stack \
  --stack-name videomonitoring \
  --template-body file://cloudformation/videomonitoring-stack.yaml \
  --parameters \
    ParameterKey=InstanceType,ParameterValue=t3.medium \
    ParameterKey=KeyName,ParameterValue=my-key \
    ParameterKey=DomainName,ParameterValue=monitor.example.com \
    ParameterKey=DatabasePassword,ParameterValue=SecurePass123! \
  --capabilities CAPABILITY_IAM
```

**Check Status:**
```bash
aws cloudformation describe-stacks --stack-name videomonitoring
```

## 📝 Log Management

### Log Locations
- **Application**: `/var/log/videomonitoring/error.log`
- **Access**: `/var/log/videomonitoring/access.log`
- **Nginx**: `/var/log/nginx/`
- **System**: `journalctl -u videomonitoring-backend`

### View Logs
```bash
# Real-time application logs
sudo journalctl -u videomonitoring-backend -f

# Recent errors
sudo journalctl -u videomonitoring-backend -p err -n 50

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Log Rotation
Configured automatically with systemd.

Manual configuration:
```bash
sudo nano /etc/logrotate.d/videomonitoring
```

```
/var/log/videomonitoring/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload videomonitoring-backend
    endscript
}
```

## 🔄 Updates and Maintenance

### Update Application
```bash
cd /var/www/videomonitoring
sudo systemctl stop videomonitoring-backend
git pull
source venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
sudo systemctl start videomonitoring-backend
```

### Backup Database
```bash
# SQLite
cp /var/www/videomonitoring/backend/video_monitoring.db \
   /var/backups/db-$(date +%Y%m%d).db

# PostgreSQL
pg_dump videomonitoring > backup-$(date +%Y%m%d).sql
```

### Clean Old Files
```bash
# Remove old HLS segments
find /var/www/videomonitoring/streams -name "*.ts" -mtime +1 -delete

# Remove old uploads (30+ days)
find /var/www/videomonitoring/uploads -mtime +30 -delete
```

## 🐛 Troubleshooting

### Check Service Status
```bash
sudo systemctl status videomonitoring-backend
sudo systemctl status nginx
```

### View Recent Errors
```bash
sudo journalctl -u videomonitoring-backend -p err -n 50
```

### Test Configuration
```bash
# Nginx
sudo nginx -t

# Python dependencies
source /var/www/videomonitoring/venv/bin/activate
python -c "import main"
```

### Common Issues

**Service won't start:**
```bash
sudo journalctl -u videomonitoring-backend -n 50
sudo chown -R www-data:www-data /var/www/videomonitoring
```

**FFmpeg not found:**
```bash
which ffmpeg
sudo bash install_ffmpeg.sh
```

**Database connection failed:**
```bash
# Check permissions (SQLite)
sudo chown www-data:www-data /var/www/videomonitoring/backend/*.db

# Test connection (PostgreSQL)
psql -U videomonitor -d videomonitoring -h localhost
```

## 📚 Additional Resources

- [AWS_DEPLOYMENT_GUIDE.md](AWS_DEPLOYMENT_GUIDE.md) - Complete deployment guide
- [../ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [../STREAMING_GUIDE.md](../STREAMING_GUIDE.md) - RTSP streaming setup
- [../SETUP_GUIDE.md](../SETUP_GUIDE.md) - General setup guide

## 🤝 Support

For issues and questions:
1. Check the logs: `sudo journalctl -u videomonitoring-backend -f`
2. Run monitoring script: `bash monitoring.sh`
3. Review AWS_DEPLOYMENT_GUIDE.md troubleshooting section
4. Check GitHub issues

## 📄 License

Same as parent project.

---

**Note**: Remember to:
- Change default passwords
- Update `your-domain.com` to your actual domain
- Configure proper firewall rules
- Setup SSL certificates
- Enable backups
- Monitor resource usage

