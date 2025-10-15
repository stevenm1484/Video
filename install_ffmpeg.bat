@echo off
echo Installing FFmpeg for Windows...
echo.

REM Check if FFmpeg is already installed
ffmpeg -version >nul 2>&1
if %errorlevel% == 0 (
    echo FFmpeg is already installed!
    ffmpeg -version
    goto :end
)

echo FFmpeg is not installed. Please install it manually:
echo.
echo Option 1 - Download from official site:
echo 1. Go to https://ffmpeg.org/download.html
echo 2. Download the Windows build
echo 3. Extract to C:\ffmpeg
echo 4. Add C:\ffmpeg\bin to your PATH environment variable
echo.
echo Option 2 - Use Chocolatey (if installed):
echo choco install ffmpeg
echo.
echo Option 3 - Use winget (Windows 10/11):
echo winget install ffmpeg
echo.
echo After installation, restart your terminal and run this script again.

:end
pause
