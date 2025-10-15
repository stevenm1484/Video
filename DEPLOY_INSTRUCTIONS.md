# Quick Deployment Instructions

You're almost there! Just need to make the scripts executable.

## Run these commands:

```bash
# Make scripts executable
chmod +x aws-deployment/*.sh

# Run the deployment
sudo bash aws-deployment/deploy.sh
```

## Or run step-by-step:

```bash
# Make just the deploy script executable
chmod +x aws-deployment/deploy.sh

# Run it with sudo
sudo ./aws-deployment/deploy.sh
```

## Alternative (if you get permission issues):

```bash
# Run with bash directly (doesn't require execute permission)
sudo bash aws-deployment/deploy.sh
```

This should work! The script will:
1. Install system dependencies
2. Install FFmpeg
3. Setup Python environment
4. Build frontend
5. Configure Nginx
6. Start all services

Takes about 10-15 minutes depending on your instance.

