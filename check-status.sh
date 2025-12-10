#!/bin/bash

echo "🐎 Project Stallion Status"
echo "=========================="
echo ""

# Check backend
if lsof -Pi :3142 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ Backend: Running on port 3142"
else
    echo "❌ Backend: Not running"
fi

# Check UI
if lsof -Pi :5174 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ UI: Running on port 5174"
else
    echo "❌ UI: Not running"
fi

# Check Tauri process
if pgrep -f "tauri dev" >/dev/null 2>&1 ; then
    echo "✅ Tauri: Running"
else
    echo "⏳ Tauri: Starting (check logs)"
fi

echo ""
echo "Logs:"
echo "  Backend: tail -f /tmp/stallion-backend.log"
echo "  UI:      tail -f /tmp/stallion-ui.log"
echo "  Tauri:   tail -f /tmp/stallion-tauri.log"
echo ""
echo "URLs:"
echo "  Backend: http://localhost:3142"
echo "  UI:      http://localhost:5174"
echo ""
echo "PIDs:"
echo "  Backend: $(lsof -ti :3142)"
echo "  UI:      $(lsof -ti :5174)"
echo "  Tauri:   $(pgrep -f 'tauri dev')"
