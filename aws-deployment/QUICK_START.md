# AWS Deployment - Quick Start Guide

Get your Video Monitoring Dashboard running on AWS in under 15 minutes!

## 🎯 Prerequisites

- AWS EC2 instance (t3.medium or larger)
- SSH access to instance
- Domain name (optional, for SSL)

## ⚡ 3-Step Deployment

### Step 1: Connect to EC2

```bash
ssh -i your-key.pem ec2-user@your-instance-ip
# or for Ubuntu: ssh -i your-key.pem ubuntu@your-instance-ip
```

### Step 2: Run Deployment Script

```bash
# Clone repository
cd /tmp
git clone https://github.com/yourusername/videomonitoring.git
cd videomonitoring/aws-deployment

# Make executable and run
chmod +x deploy.sh
sudo bash deploy.sh
```

The script will automatically:
- ✅ Install all dependencies
- ✅ Setup Python environment  
- ✅ Install FFmpeg
- ✅ Build frontend
- ✅ Configure Nginx
- ✅ Start all services

### Step 3: Access Application

```bash
# Get your public IP
curl ifconfig.me

# Open in browser
http://your-ip-address
```

**Default Login:**
- Username: `admin`
- Password: `admin123` (change immediately!)

## 🔒 Enable SSL (Optional but Recommended)

```bash
cd /var/www/videomonitoring/aws-deployment
chmod +x ssl_setup.sh
sudo bash ssl_setup.sh your-domain.com
```

Access via: `https://your-domain.com`

## 📋 Post-Deployment Checklist

- [ ] Access application successfully
- [ ] Login with admin credentials
- [ ] Change admin password
- [ ] Create first video account
- [ ] Add first camera
- [ ] Test SMTP email (camera sends to generated address)
- [ ] Test live streaming (if RTSP URL configured)
- [ ] Setup SSL certificate
- [ ] Configure backups

## 🎥 Configure Camera

1. **In Dashboard**: Create camera, copy SMTP email (camera-xxxxx@monitor.local)
2. **In Camera Settings**: 
   - Set email server: `your-server-ip:2525`
   - Set recipient: `camera-xxxxx@monitor.local`
   - Enable motion detection emails
3. **Test**: Trigger motion, check dashboard for new event

## 🔧 Useful Commands

```bash
# Check service status
sudo systemctl status videomonitoring-backend

# View logs
sudo journalctl -u videomonitoring-backend -f

# Restart service
sudo systemctl restart videomonitoring-backend

# Monitor system
bash /var/www/videomonitoring/aws-deployment/monitoring.sh
```

## 🐛 Troubleshooting

### Service Not Starting
```bash
sudo journalctl -u videomonitoring-backend -n 50
sudo systemctl restart videomonitoring-backend
```

### Can't Access Website
```bash
# Check nginx
sudo systemctl status nginx
sudo nginx -t

# Check firewall
sudo ufw status  # Ubuntu
sudo firewall-cmd --list-all  # Amazon Linux
```

### FFmpeg Issues
```bash
ffmpeg -version
sudo bash /var/www/videomonitoring/aws-deployment/install_ffmpeg.sh
```

## 📚 Next Steps

- Read [AWS_DEPLOYMENT_GUIDE.md](AWS_DEPLOYMENT_GUIDE.md) for advanced configuration
- Setup database backups
- Configure monitoring alerts
- Review security settings
- Scale based on usage

## 🆘 Getting Help

1. Check logs: `sudo journalctl -u videomonitoring-backend -f`
2. Run monitoring: `bash monitoring.sh`
3. Review [troubleshooting guide](AWS_DEPLOYMENT_GUIDE.md#troubleshooting)
4. Check GitHub issues

---

**That's it!** Your video monitoring system is now live on AWS. 🎉

