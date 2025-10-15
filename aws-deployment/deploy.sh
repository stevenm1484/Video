#!/bin/bash
# Deployment script for Video Monitoring Dashboard on AWS
# Run with: sudo bash deploy.sh

set -e

echo "=================================================="
echo "Video Monitoring Dashboard - AWS Deployment"
echo "=================================================="

# Configuration
APP_DIR="/var/www/videomonitoring"
APP_USER="www-data"
REPO_URL="https://github.com/yourusername/videomonitoring.git"  # Update this
DOMAIN="your-domain.com"  # Update this

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}==>${NC} $1"
}

print_error() {
    echo -e "${RED}Error:${NC} $1"
    exit 1
}

print_warning() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo)"
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    print_error "Cannot detect OS"
fi

print_step "Detected OS: $OS"

# Install system dependencies
print_step "Installing system dependencies..."

case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y \
            python3 \
            python3-pip \
            python3-venv \
            nginx \
            git \
            postgresql \
            postgresql-contrib \
            libpq-dev \
            build-essential \
            curl \
            nodejs \
            npm
        ;;
    amzn|centos|rhel)
        if [[ $VERSION_ID == "2023" ]]; then
            # Amazon Linux 2023
            dnf update -y
            dnf install -y \
                python3 \
                python3-pip \
                python3-devel \
                nginx \
                git \
                postgresql15 \
                postgresql15-server \
                postgresql15-contrib \
                libpq-devel \
                gcc \
                gcc-c++ \
                make \
                nodejs \
                npm
        else
            # Amazon Linux 2 or CentOS/RHEL
            yum update -y
            yum install -y \
                python3 \
                python3-pip \
                python3-devel \
                nginx \
                git \
                postgresql \
                postgresql-server \
                postgresql-contrib \
                postgresql-devel \
                gcc \
                gcc-c++ \
                make
            
            # Install Node.js
            curl -sL https://rpm.nodesource.com/setup_18.x | bash -
            yum install -y nodejs
        fi
        ;;
    *)
        print_error "Unsupported OS: $OS"
        ;;
esac

# Install FFmpeg
print_step "Installing FFmpeg..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
bash "$SCRIPT_DIR/install_ffmpeg.sh"

# Create application directory
print_step "Setting up application directory..."
mkdir -p $APP_DIR
mkdir -p /var/log/videomonitoring
mkdir -p /var/run/videomonitoring

# Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
    print_step "Updating existing repository..."
    cd $APP_DIR
    git pull
else
    print_step "Cloning repository..."
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# Setup Python virtual environment
print_step "Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
print_step "Installing Python dependencies..."
pip install --upgrade pip
pip install wheel
pip install gunicorn
pip install -r requirements.txt

# Additional packages for production
pip install psycopg2-binary  # PostgreSQL adapter
pip install psutil  # Process management

# Setup database (SQLite for now, can be changed to PostgreSQL)
print_step "Setting up database..."
cd backend

# Create admin user
print_step "Creating admin user..."
python3 create_admin.py

cd ..

# Build frontend
print_step "Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Setup directories and permissions
print_step "Setting up directories and permissions..."
mkdir -p uploads
mkdir -p streams
mkdir -p backend/streams

# Set ownership
chown -R $APP_USER:$APP_USER $APP_DIR
chown -R $APP_USER:$APP_USER /var/log/videomonitoring
chown -R $APP_USER:$APP_USER /var/run/videomonitoring

# Setup Nginx
print_step "Configuring Nginx..."
cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/videomonitoring

# Update domain in nginx config
sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/sites-available/videomonitoring

# Enable site
ln -sf /etc/nginx/sites-available/videomonitoring /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t || print_error "Nginx configuration is invalid"

# Setup systemd services
print_step "Setting up systemd services..."
cp "$SCRIPT_DIR/systemd/videomonitoring-backend.service" /etc/systemd/system/
cp "$SCRIPT_DIR/gunicorn.conf.py" $APP_DIR/

# Update paths in service files
sed -i "s|/var/www/videomonitoring|$APP_DIR|g" /etc/systemd/system/videomonitoring-backend.service

# Reload systemd
systemctl daemon-reload

# Enable and start services
print_step "Starting services..."
systemctl enable videomonitoring-backend
systemctl start videomonitoring-backend
systemctl enable nginx
systemctl restart nginx

# Setup firewall (if applicable)
if command -v ufw &> /dev/null; then
    print_step "Configuring firewall..."
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 2525/tcp  # SMTP
    ufw --force enable
fi

# Print status
print_step "Checking service status..."
systemctl status videomonitoring-backend --no-pager
systemctl status nginx --no-pager

echo ""
echo "=================================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "=================================================="
echo ""
echo "Application URL: http://$DOMAIN"
echo "Backend API: http://$DOMAIN/api"
echo ""
echo "Next steps:"
echo "1. Update DNS to point to this server"
echo "2. Setup SSL certificate (see ssl_setup.sh)"
echo "3. Configure camera SMTP settings"
echo "4. Monitor logs: journalctl -u videomonitoring-backend -f"
echo ""
echo "Default admin credentials:"
echo "  Username: admin"
echo "  Password: admin123 (CHANGE THIS!)"
echo ""

