# Video Monitoring System Startup Script
# PowerShell Version

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Video Monitoring System Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the correct directory
if (-not (Test-Path "backend\main.py")) {
    Write-Host "ERROR: Please run this script from the project root directory" -ForegroundColor Red
    Write-Host "Expected files: backend\main.py, frontend\package.json" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if virtual environment exists
if (-not (Test-Path "venv\Scripts\activate.bat")) {
    Write-Host "ERROR: Virtual environment not found!" -ForegroundColor Red
    Write-Host "Please run: python -m venv venv" -ForegroundColor Yellow
    Write-Host "Then install requirements: venv\Scripts\activate && pip install -r requirements.txt" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Node.js is available
try {
    $nodeVersion = node --version 2>$null
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Node.js not found in PATH" -ForegroundColor Yellow
    Write-Host "Adding Node.js to PATH for this session..." -ForegroundColor Yellow
    $env:PATH += ";C:\Program Files\nodejs"
    
    try {
        $nodeVersion = node --version 2>$null
        Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Node.js not found at C:\Program Files\nodejs" -ForegroundColor Red
        Write-Host "Please install Node.js or update the PATH in this script" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check if FFmpeg is available
try {
    $ffmpegVersion = ffmpeg -version 2>$null | Select-Object -First 1
    Write-Host "FFmpeg found: $ffmpegVersion" -ForegroundColor Green
} catch {
    Write-Host "WARNING: FFmpeg not found in PATH" -ForegroundColor Yellow
    Write-Host "Checking for FFmpeg at C:\ffmpeg\ffmpeg.exe..." -ForegroundColor Yellow
    
    if (-not (Test-Path "C:\ffmpeg\ffmpeg.exe")) {
        Write-Host "ERROR: FFmpeg not found!" -ForegroundColor Red
        Write-Host "Please install FFmpeg to C:\ffmpeg\ or add it to your PATH" -ForegroundColor Red
        Write-Host "Download from: https://ffmpeg.org/download.html" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    } else {
        Write-Host "FFmpeg found at C:\ffmpeg\ffmpeg.exe" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Starting Backend Server..." -ForegroundColor Yellow
Write-Host ""

# Start backend server in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\venv\Scripts\Activate.ps1; python backend\main.py" -WindowStyle Normal

# Wait for backend to start
Write-Host "Waiting for backend server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Check if backend is running
Write-Host "Checking if backend server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/docs" -TimeoutSec 5
    Write-Host "Backend server is running!" -ForegroundColor Green
} catch {
    Write-Host "Backend server not responding yet..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting Frontend Server..." -ForegroundColor Yellow
Write-Host ""

# Start frontend server in a new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev" -WindowStyle Normal

# Wait for frontend to start
Write-Host "Waiting for frontend server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Servers Started Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend Server:  http://localhost:8000" -ForegroundColor White
Write-Host "Frontend Server: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Login Credentials:" -ForegroundColor White
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: admin" -ForegroundColor White
Write-Host ""

# Ask if user wants to open browser
$openBrowser = Read-Host "Open the application in your browser? (y/n)"
if ($openBrowser -eq "y" -or $openBrowser -eq "Y" -or $openBrowser -eq "yes") {
    Start-Process "http://localhost:3000"
    Write-Host "Application opened in browser!" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Startup Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop the servers:" -ForegroundColor White
Write-Host "1. Close the two PowerShell windows that opened" -ForegroundColor White
Write-Host "2. Or press Ctrl+C in each window" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit this startup script"
