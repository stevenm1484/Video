@echo off
echo ========================================
echo Video Monitoring Dashboard
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install Python dependencies
echo Installing Python dependencies...
pip install -r requirements.txt

REM Create admin user if needed
echo Setting up database...
cd backend
python create_admin.py
cd ..

REM Start backend in a new window
echo Starting backend server...
start "Backend Server" cmd /k "cd backend && ..\venv\Scripts\python.exe main.py"

REM Wait a bit for backend to start
timeout /t 3 /nobreak > nul

REM Install frontend dependencies and start
echo Installing frontend dependencies...
cd frontend
if not exist "node_modules\" (
    call npm install
)

echo Starting frontend...
call npm run dev

pause
