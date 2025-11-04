#!/bin/bash

# Launch script for Project Stallion (SDK Refactoring Version)
# Handles port conflicts with main Work Agent instance

echo "🐎 Launching Project Stallion (SDK Refactoring Version)..."
echo ""

# Check if port 3141 is in use
if lsof -Pi :3141 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 3141 is in use (main Work Agent running)"
    echo "   Using fallback port 3142 for Project Stallion backend"
    export PORT=3142
    BACKEND_PORT=3142
else
    echo "✓ Port 3141 available"
    BACKEND_PORT=3141
fi

# Check if port 5173 is in use
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 5173 is in use"
    echo "   Vite will automatically use next available port (likely 5174)"
    UI_PORT="auto"
else
    echo "✓ Port 5173 available"
    UI_PORT=5173
fi

echo ""
echo "Starting Project Stallion..."
echo "  Backend: http://localhost:$BACKEND_PORT"
echo "  UI: http://localhost:$UI_PORT"
echo ""

# Update Tauri config if using fallback port
if [ "$BACKEND_PORT" = "3142" ]; then
    echo "Updating Tauri config for port 3142..."
    # Tauri will use the UI port, backend is accessed via fetch
fi

# Start backend server in background
echo "Starting backend server..."
PORT=$BACKEND_PORT npm run dev:server &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend to start..."
sleep 3

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ Backend failed to start"
    exit 1
fi

echo "✓ Backend started (PID: $BACKEND_PID)"
echo ""

# Start Tauri desktop app (which will start Vite)
echo "Starting Tauri desktop app..."
echo ""
npm run dev:desktop

# Cleanup on exit
echo ""
echo "Shutting down Project Stallion..."
kill $BACKEND_PID 2>/dev/null
echo "✓ Stopped"
