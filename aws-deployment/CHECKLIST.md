# AWS Deployment Checklist

Use this checklist to ensure a successful deployment.

## 🔧 Pre-Deployment

### AWS Account Setup
- [ ] AWS account created and configured
- [ ] IAM user with appropriate permissions
- [ ] SSH key pair created and downloaded
- [ ] AWS CLI installed and configured (optional)

### EC2 Instance Setup
- [ ] EC2 instance launched (t3.medium or larger)
- [ ] Operating system selected:
  - [ ] Amazon Linux 2023 (recommended)
  - [ ] Ubuntu 22.04 LTS
  - [ ] Debian 11
- [ ] Storage: 30GB+ EBS volume attached
- [ ] Elastic IP associated (recommended)

### Security Group Configuration
- [ ] Port 22 (SSH) - from your IP
- [ ] Port 80 (HTTP) - from 0.0.0.0/0
- [ ] Port 443 (HTTPS) - from 0.0.0.0/0
- [ ] Port 2525 (SMTP) - from camera IPs or 0.0.0.0/0

### Domain & DNS (Optional)
- [ ] Domain name purchased
- [ ] DNS A record pointing to Elastic IP
- [ ] DNS propagated (check with `dig your-domain.com`)

---

## 🚀 Deployment

### Method 1: Automated Script (Recommended)

```bash
# Connect to instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Clone repository
cd /tmp
git clone https://github.com/yourusername/videomonitoring.git
cd videomonitoring/aws-deployment

# Deploy
chmod +x deploy.sh
sudo bash deploy.sh
```

- [ ] SSH connection successful
- [ ] Repository cloned
- [ ] deploy.sh executed successfully
- [ ] All services started
- [ ] Application accessible via HTTP

### Method 2: Docker (Alternative)

```bash
cd aws-deployment/docker
docker-compose up -d
```

- [ ] Docker and Docker Compose installed
- [ ] All containers running
- [ ] Application accessible

### Method 3: CloudFormation (Infrastructure as Code)

```bash
aws cloudformation create-stack \
  --stack-name videomonitoring \
  --template-body file://cloudformation/videomonitoring-stack.yaml \
  --parameters ParameterKey=KeyName,ParameterValue=your-key \
  --capabilities CAPABILITY_IAM
```

- [ ] Stack created successfully
- [ ] All resources provisioned
- [ ] Outputs retrieved

---

## 🔒 Post-Deployment Security

### Application Security
- [ ] Access application at http://your-ip
- [ ] Login with default credentials (admin/admin123)
- [ ] **IMMEDIATELY change admin password**
- [ ] Create additional admin users if needed
- [ ] Test logout/login

### SSL/HTTPS Setup
```bash
cd /var/www/videomonitoring/aws-deployment
sudo bash ssl_setup.sh your-domain.com
```

- [ ] SSL certificate obtained
- [ ] HTTPS working
- [ ] HTTP redirects to HTTPS
- [ ] Auto-renewal configured
- [ ] Test certificate with: https://www.ssllabs.com/ssltest/

### Environment Variables
```bash
sudo nano /etc/systemd/system/videomonitoring-backend.service
```

- [ ] SECRET_KEY set to strong random value
- [ ] ALLOWED_ORIGINS updated to your domain
- [ ] DATABASE_URL configured
- [ ] Service restarted after changes

### Firewall Configuration

**Ubuntu/Debian:**
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 2525/tcp
sudo ufw enable
```

**Amazon Linux/CentOS:**
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=2525/tcp
sudo firewall-cmd --reload
```

- [ ] Firewall enabled
- [ ] Required ports open
- [ ] Unnecessary ports closed

---

## 🗄️ Database Configuration

### SQLite (Default)
- [ ] Database file exists: `/var/www/videomonitoring/backend/video_monitoring.db`
- [ ] Permissions correct: `www-data:www-data`
- [ ] Admin user created

### PostgreSQL (Production)
- [ ] PostgreSQL installed
- [ ] Database created
- [ ] User created with password
- [ ] Permissions granted
- [ ] DATABASE_URL updated in service file
- [ ] Connection tested

### Amazon RDS (Optional)
- [ ] RDS instance created
- [ ] Security group allows EC2 connection
- [ ] DATABASE_URL updated with RDS endpoint
- [ ] Connection tested

---

## 📹 Camera Configuration

### In Dashboard
- [ ] Create video account
- [ ] Add camera to account
- [ ] Copy generated SMTP email (camera-xxxxx@monitor.local)
- [ ] Configure RTSP URL (if available)

### In Camera/NVR
- [ ] Set SMTP server: `your-server-ip:2525`
- [ ] Set recipient email: `camera-xxxxx@monitor.local`
- [ ] Enable motion detection
- [ ] Enable email notifications
- [ ] Configure attachments (images/video)
- [ ] Send test email
- [ ] Verify event appears in dashboard

### Live Streaming
- [ ] RTSP URL configured in camera settings
- [ ] Start stream from dashboard
- [ ] Verify video playback
- [ ] Test stream restart
- [ ] Test stream stop

---

## 🔄 Backup Configuration

### Automated Backups
```bash
sudo cp /var/www/videomonitoring/aws-deployment/backup.sh /usr/local/bin/backup-videomonitoring.sh
sudo chmod +x /usr/local/bin/backup-videomonitoring.sh
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-videomonitoring.sh
```

- [ ] Backup script copied
- [ ] Script executable
- [ ] Cron job configured
- [ ] Backup directory created: `/var/backups/videomonitoring`
- [ ] Test backup manually
- [ ] Verify backup files created

### S3 Sync (Optional)
```bash
# Edit backup.sh and set:
S3_BUCKET="s3://your-bucket-name/backups"
```

- [ ] S3 bucket created
- [ ] IAM permissions configured
- [ ] AWS CLI installed
- [ ] S3_BUCKET variable set
- [ ] Test S3 sync

### Backup Restoration Test
- [ ] Download backup file
- [ ] Test database restoration
- [ ] Verify data integrity

---

## 📊 Monitoring Setup

### Application Monitoring
```bash
bash /var/www/videomonitoring/aws-deployment/monitoring.sh
```

- [ ] Monitoring script works
- [ ] All services showing as running
- [ ] Ports showing as listening
- [ ] No critical errors in logs

### Log Monitoring
```bash
# View real-time logs
sudo journalctl -u videomonitoring-backend -f
```

- [ ] Application logs accessible
- [ ] Nginx logs accessible
- [ ] No recurring errors

### Health Checks
```bash
bash /var/www/videomonitoring/aws-deployment/health-check.sh
echo $?  # Should be 0
```

- [ ] Health check script works
- [ ] Returns 0 (healthy)

### AWS CloudWatch (Optional)
- [ ] CloudWatch agent installed
- [ ] Custom metrics configured
- [ ] Alarms created for:
  - [ ] High CPU usage (>80%)
  - [ ] High memory usage (>80%)
  - [ ] Disk space low (<10% free)
  - [ ] Service down

### External Monitoring (Optional)
- [ ] UptimeRobot configured
- [ ] Email alerts setup
- [ ] SMS alerts setup (optional)

---

## 🧪 Testing

### Basic Functionality
- [ ] Access dashboard at https://your-domain.com
- [ ] Login works
- [ ] Create video account
- [ ] Add camera
- [ ] Send test email from camera
- [ ] Event appears in dashboard
- [ ] View event details
- [ ] Dismiss event
- [ ] Generate alarm from event
- [ ] View alarm details
- [ ] Resolve alarm

### Streaming Tests
- [ ] Start camera stream
- [ ] Video plays in dashboard
- [ ] Stream stops cleanly
- [ ] Restart stream works
- [ ] Multiple cameras can stream simultaneously

### WebSocket Tests
- [ ] Real-time updates work
- [ ] Multiple browser tabs stay in sync
- [ ] Reconnects after network interruption

### Upload Tests
- [ ] Image uploads work
- [ ] Video uploads work
- [ ] Multiple image combination to video works
- [ ] Large files upload (up to 100MB)

### Performance Tests
- [ ] Dashboard loads in <3 seconds
- [ ] API responses in <1 second
- [ ] Video streaming has low latency (<5 seconds)
- [ ] Multiple concurrent users work

---

## 📱 Mobile Testing

- [ ] Dashboard works on mobile browser
- [ ] Video playback works on mobile
- [ ] Responsive layout looks good
- [ ] Touch interactions work

---

## 📝 Documentation

### Internal Documentation
- [ ] Camera IP addresses documented
- [ ] SMTP email addresses recorded
- [ ] Admin credentials securely stored
- [ ] Network diagram created
- [ ] Runbook created for common tasks

### User Training
- [ ] Admin users trained
- [ ] User accounts created
- [ ] Password policies communicated
- [ ] Support contact shared

---

## 🔄 Maintenance Schedule

### Daily
- [ ] Check monitoring dashboard
- [ ] Review error logs
- [ ] Verify backups ran

### Weekly
- [ ] Check disk space usage
- [ ] Review system resources
- [ ] Clean old stream segments
- [ ] Test backup restoration

### Monthly
- [ ] System updates: `sudo dnf update -y` or `sudo apt update && sudo apt upgrade -y`
- [ ] Review and clean old uploads
- [ ] Database vacuum/optimization
- [ ] Review user accounts
- [ ] Update documentation

### Quarterly
- [ ] Security audit
- [ ] Performance review
- [ ] Capacity planning
- [ ] Disaster recovery test

---

## 🚨 Disaster Recovery Plan

### Documented
- [ ] Backup locations documented
- [ ] Restoration procedure documented
- [ ] Alternative contact methods documented
- [ ] Escalation procedures defined

### Tested
- [ ] Database restoration tested
- [ ] Full system restoration tested
- [ ] Recovery time measured
- [ ] Issues documented and resolved

---

## ✅ Production Ready

### Final Checks
- [ ] All services running and stable for 24 hours
- [ ] No critical errors in logs
- [ ] Performance metrics acceptable
- [ ] Backups running successfully
- [ ] Monitoring and alerts working
- [ ] All stakeholders notified
- [ ] Go-live communication sent

### Sign-off
- [ ] Technical team approval
- [ ] Security team approval (if applicable)
- [ ] Management approval
- [ ] User acceptance testing complete

---

## 🎉 Deployment Complete!

Congratulations! Your Video Monitoring Dashboard is now live on AWS.

### Next Steps
1. Monitor system for first few days
2. Gather user feedback
3. Document any issues and resolutions
4. Plan for scaling if needed
5. Schedule regular maintenance

### Support Resources
- Documentation: `/aws-deployment/`
- Logs: `sudo journalctl -u videomonitoring-backend -f`
- Monitoring: `bash monitoring.sh`
- Health check: `bash health-check.sh`

---

**Date Deployed:** _______________  
**Deployed By:** _______________  
**Instance IP:** _______________  
**Domain:** _______________  

