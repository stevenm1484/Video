# Video Monitoring System - Startup Guide

## Quick Start

### Option 1: Batch Script (Recommended for Windows)
```bash
# Double-click or run from command prompt:
start_servers.bat
```

### Option 2: PowerShell Script
```powershell
# Right-click and "Run with PowerShell" or run from PowerShell:
.\start_servers.ps1
```

## What the Startup Scripts Do

### ✅ **Pre-flight Checks**
- Verifies you're in the correct directory
- Checks if virtual environment exists
- Verifies Node.js is installed and accessible
- Confirms FFmpeg is available

### 🚀 **Server Startup**
- Starts backend server (Python/FastAPI) on port 8000
- Starts frontend server (React/Vite) on port 3000
- Opens each server in separate command windows
- Automatically opens the application in your browser

### 🔧 **Automatic Configuration**
- Adds Node.js to PATH if not found
- Handles FFmpeg path detection
- Provides clear error messages if dependencies are missing

## Stopping the Servers

### Option 1: Batch Script
```bash
stop_servers.bat
```

### Option 2: PowerShell Script
```powershell
.\stop_servers.ps1
```

### Option 3: Manual
- Close the two command windows that opened
- Or press `Ctrl+C` in each window

## Prerequisites

### Required Software
1. **Python 3.11+** with virtual environment
2. **Node.js 16+** installed
3. **FFmpeg** installed (preferably at `C:\ffmpeg\`)

### Installation Commands
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
cd frontend
npm install
cd ..
```

## Troubleshooting

### "Node.js not found"
- Install Node.js from https://nodejs.org/
- Or update the PATH in the startup script

### "FFmpeg not found"
- Download FFmpeg from https://ffmpeg.org/download.html
- Extract to `C:\ffmpeg\`
- Or add FFmpeg to your system PATH

### "Virtual environment not found"
- Run: `python -m venv venv`
- Then: `venv\Scripts\activate && pip install -r requirements.txt`

### "Port already in use"
- Run `stop_servers.bat` first
- Or manually kill processes using Task Manager

## Access Information

- **Frontend Application**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Login Credentials
- **Username**: `admin`
- **Password**: `admin`

## File Structure
```
videomonitoring/
├── start_servers.bat      # Windows batch startup script
├── start_servers.ps1      # PowerShell startup script
├── stop_servers.bat       # Windows batch stop script
├── stop_servers.ps1       # PowerShell stop script
├── backend/               # Python FastAPI backend
├── frontend/              # React frontend
├── venv/                  # Python virtual environment
└── requirements.txt       # Python dependencies
```

## Next Steps

1. **Run the startup script**
2. **Login with admin/admin**
3. **Go to Video Accounts**
4. **Click the eye icon** to view your camera stream
5. **Stream will start automatically** when viewing
6. **Stream will stop automatically** when you close the viewer

## Support

If you encounter issues:
1. Check the console output in the opened command windows
2. Verify all prerequisites are installed
3. Run the stop script and try again
4. Check the troubleshooting section above
