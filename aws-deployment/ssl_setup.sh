#!/bin/bash
# SSL/HTTPS setup using Let's Encrypt
# Run with: sudo bash ssl_setup.sh your-domain.com

set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "Usage: sudo bash ssl_setup.sh your-domain.com"
    exit 1
fi

echo "=================================================="
echo "Setting up SSL/HTTPS with Let's Encrypt"
echo "Domain: $DOMAIN"
echo "=================================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS"
    exit 1
fi

# Install Certbot
echo "Installing Certbot..."

case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
        ;;
    amzn|centos|rhel)
        yum install -y certbot python3-certbot-nginx
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Stop nginx temporarily
systemctl stop nginx

# Obtain certificate
echo "Obtaining SSL certificate..."
certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Update Nginx configuration
echo "Updating Nginx configuration..."

cat > /etc/nginx/sites-available/videomonitoring-ssl << EOF
upstream backend {
    server 127.0.0.1:8000;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    client_max_body_size 100M;
    
    # Frontend - Serve built React app
    location / {
        root /var/www/videomonitoring/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # WebSocket endpoint
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
    
    # Uploaded media files
    location /uploads {
        alias /var/www/videomonitoring/uploads;
        autoindex off;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS';
        
        # Cache
        expires 1h;
        add_header Cache-Control "public";
    }
    
    # HLS streams
    location /streams {
        alias /var/www/videomonitoring/streams;
        autoindex off;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS';
        add_header Access-Control-Allow-Headers 'Range,Content-Type';
        add_header Access-Control-Expose-Headers 'Content-Length,Content-Range';
        
        # HLS types
        types {
            application/vnd.apple.mpegurl m3u8;
            video/mp2t ts;
        }
        
        # No caching for live streams
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }
}
EOF

# Enable SSL configuration
ln -sf /etc/nginx/sites-available/videomonitoring-ssl /etc/nginx/sites-enabled/videomonitoring

# Test configuration
nginx -t

# Start nginx
systemctl start nginx

# Setup auto-renewal
echo "Setting up automatic certificate renewal..."
systemctl enable certbot-renew.timer 2>/dev/null || true

# Add renewal hook to reload nginx
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo ""
echo "=================================================="
echo "SSL Setup Complete!"
echo "=================================================="
echo ""
echo "Your site is now available at: https://$DOMAIN"
echo ""
echo "Certificate auto-renewal is configured."
echo "Test renewal with: certbot renew --dry-run"
echo ""

