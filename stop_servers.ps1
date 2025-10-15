# Video Monitoring System Shutdown Script
# PowerShell Version

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Video Monitoring System Shutdown" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop Python processes (Backend Server)
Write-Host "Stopping all Python processes (Backend Server)..." -ForegroundColor Yellow
$pythonProcesses = Get-Process -Name "python" -ErrorAction SilentlyContinue
if ($pythonProcesses) {
    $pythonProcesses | Stop-Process -Force
    Write-Host "Backend server stopped." -ForegroundColor Green
} else {
    Write-Host "No Python processes found." -ForegroundColor Yellow
}

Write-Host ""

# Stop Node.js processes (Frontend Server)
Write-Host "Stopping all Node.js processes (Frontend Server)..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $nodeProcesses | Stop-Process -Force
    Write-Host "Frontend server stopped." -ForegroundColor Green
} else {
    Write-Host "No Node.js processes found." -ForegroundColor Yellow
}

Write-Host ""

# Stop FFmpeg processes (Streams)
Write-Host "Stopping any FFmpeg processes (Streams)..." -ForegroundColor Yellow
$ffmpegProcesses = Get-Process -Name "ffmpeg" -ErrorAction SilentlyContinue
if ($ffmpegProcesses) {
    $ffmpegProcesses | Stop-Process -Force
    Write-Host "FFmpeg processes stopped." -ForegroundColor Green
} else {
    Write-Host "No FFmpeg processes found." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   All Servers Stopped" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
