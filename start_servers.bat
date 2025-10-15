@echo off
echo ========================================
echo    Video Monitoring System Startup
echo ========================================
echo.

REM Check if we're in the correct directory
if not exist "backend\main.py" (
    echo ERROR: Please run this script from the project root directory
    echo Expected files: backend\main.py, frontend\package.json
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found!
    echo Please run: python -m venv venv
    echo Then install requirements: venv\Scripts\activate && pip install -r requirements.txt
    pause
    exit /b 1
)

REM Check if Node.js is available
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: Node.js not found in PATH
    echo Adding Node.js to PATH for this session...
    set "PATH=%PATH%;C:\Program Files\nodejs"
    
    REM Verify Node.js is now available
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo ERROR: Node.js not found at C:\Program Files\nodejs
        echo Please install Node.js or update the PATH in this script
        pause
        exit /b 1
    )
)

REM Check if FFmpeg is available
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: FFmpeg not found in PATH
    echo Checking for FFmpeg at C:\ffmpeg\ffmpeg.exe...
    if not exist "C:\ffmpeg\ffmpeg.exe" (
        echo ERROR: FFmpeg not found!
        echo Please install FFmpeg to C:\ffmpeg\ or add it to your PATH
        echo Download from: https://ffmpeg.org/download.html
        pause
        exit /b 1
    )
)

echo Starting Backend Server...
echo.

REM Start backend server in a new window
start "Video Monitoring Backend" cmd /k "venv\Scripts\activate && python backend\main.py"

REM Wait a moment for backend to start
echo Waiting for backend server to start...
timeout /t 3 /nobreak >nul

REM Check if backend is running
echo Checking if backend server is running...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8000/docs' -TimeoutSec 5; Write-Host 'Backend server is running!' } catch { Write-Host 'Backend server not responding yet...' }"

echo.
echo Starting Frontend Server...
echo.

REM Start frontend server in a new window
start "Video Monitoring Frontend" cmd /k "cd frontend && npm run dev"

REM Wait a moment for frontend to start
echo Waiting for frontend server to start...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo    Servers Started Successfully!
echo ========================================
echo.
echo Backend Server:  http://localhost:8000
echo Frontend Server: http://localhost:3000
echo.
echo Login Credentials:
echo   Username: admin
echo   Password: admin
echo.
echo Press any key to open the application in your browser...
pause >nul

REM Open the application in the default browser
start http://localhost:3000

echo.
echo ========================================
echo    Application Opened in Browser
echo ========================================
echo.
echo To stop the servers:
echo 1. Close the two command windows that opened
echo 2. Or press Ctrl+C in each window
echo.
echo Press any key to exit this startup script...
pause >nul
