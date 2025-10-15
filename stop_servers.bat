@echo off
echo ========================================
echo    Video Monitoring System Shutdown
echo ========================================
echo.

echo Stopping all Python processes (Backend Server)...
taskkill /f /im python.exe 2>nul
if %errorlevel% equ 0 (
    echo Backend server stopped.
) else (
    echo No Python processes found.
)

echo.
echo Stopping all Node.js processes (Frontend Server)...
taskkill /f /im node.exe 2>nul
if %errorlevel% equ 0 (
    echo Frontend server stopped.
) else (
    echo No Node.js processes found.
)

echo.
echo Stopping any FFmpeg processes (Streams)...
taskkill /f /im ffmpeg.exe 2>nul
if %errorlevel% equ 0 (
    echo FFmpeg processes stopped.
) else (
    echo No FFmpeg processes found.
)

echo.
echo ========================================
echo    All Servers Stopped
echo ========================================
echo.
pause
