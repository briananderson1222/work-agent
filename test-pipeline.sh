#!/bin/bash

echo "Starting server..."
npm run dev:server > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..30}; do
  if curl -s http://localhost:3141/health > /dev/null 2>&1; then
    echo "Server ready!"
    break
  fi
  sleep 1
done

# Test 1: Simple text response
echo ""
echo "=== Test 1: Tool call (calendar view) ==="
curl -N -X POST http://localhost:3141/agents/test-nova-limited-tools/chat \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is on my schedule for today?",
    "options": {
      "userId": "test-user",
      "conversationId": "test-conv-1"
    }
  }' 2>/dev/null

echo ""
echo ""
echo "=== Server logs (last 20 lines) ==="
tail -20 /tmp/server.log

# Cleanup
echo ""
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo "Test complete!"
