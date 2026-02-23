Start the stallion dev environment in detached tmux sessions on alternate ports (3142/5174):

1. Kill any existing `stallion-server` and `stallion-ui` tmux sessions (ignore errors if they don't exist)
2. Start the backend: `tmux new-session -d -s stallion-server "PORT=3142 npm run dev:server"`
3. Start the UI: `tmux new-session -d -s stallion-ui "VITE_API_BASE=http://localhost:3142 npm run dev:ui -- --port 5174"`
4. Wait ~10 seconds, then verify both are responding:
   - API: `curl -sf http://localhost:3142/api/agents`
   - UI: `curl -sf -o /dev/null -w "%{http_code}" http://localhost:5174`
5. Report the status of each
