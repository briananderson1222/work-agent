# Launch Project Stallion (SDK Refactoring Version)

## Quick Launch

```bash
./launch-stallion.sh
```

This will:
1. Check for port conflicts with main Work Agent
2. Use fallback ports if needed (3142 for backend, 5174 for UI)
3. Start backend server
4. Launch Tauri desktop app with "Project Stallion" title

## Manual Launch (Alternative)

If you prefer to run components separately:

### Terminal 1: Backend Server
```bash
# Default port 3141
npm run dev:server

# Or use custom port if 3141 is in use
PORT=3142 npm run dev:server
```

### Terminal 2: UI Development Server
```bash
npm run dev:ui
# Vite will auto-detect and use next available port if 5173 is taken
```

### Terminal 3: Tauri Desktop App
```bash
npm run dev:desktop
```

## Port Configuration

**Default Ports:**
- Backend: 3141
- UI: 5173

**Fallback Ports (if main Work Agent is running):**
- Backend: 3142
- UI: 5174 (auto-detected by Vite)

## Distinguishing from Main Work Agent

The SDK refactoring version is named **"Project Stallion"** in:
- Window title
- App name
- Tauri product name

This makes it easy to distinguish from the main "Work Agent" instance.

## Testing Checklist

Once launched, follow the testing checklist in `TESTING_REVIEW.md`:
- [ ] Application loads without errors
- [ ] SA Dashboard renders
- [ ] Calendar loads
- [ ] Meeting details work
- [ ] SFDC integration works
- [ ] Permission dialogs appear
- [ ] Chat integration works

## Troubleshooting

**Port already in use:**
- The launch script automatically handles this
- Backend will use port 3142
- UI will use next available port

**Backend won't start:**
```bash
# Check if port is in use
lsof -i :3141
lsof -i :3142

# Kill process if needed
kill -9 <PID>
```

**UI won't connect to backend:**
- Check backend is running: `curl http://localhost:3141/agents`
- Check console for API errors
- Verify SDK is using correct port

**Tauri build errors:**
```bash
# Clean and rebuild
npm run clean
npm install
npm run build:server
```

## Stopping

Press `Ctrl+C` in the terminal running the launch script.

The script will automatically:
1. Stop the Tauri app
2. Stop the backend server
3. Clean up processes
