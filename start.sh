#!/bin/bash

echo "========================================"
echo "Video Monitoring Dashboard"
echo "========================================"
echo ""

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Create admin user if needed
echo "Setting up database..."
cd backend
python create_admin.py
cd ..

# Start backend in background
echo "Starting backend server..."
cd backend
python main.py &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Start frontend
echo "Starting frontend..."
npm run dev

# Cleanup on exit
trap "kill $BACKEND_PID" EXIT
