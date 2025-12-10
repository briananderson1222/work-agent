#!/bin/bash

# Test adding a system event message
curl -X POST http://localhost:3141/api/agents/work-agent/conversations/test-conv-123/context \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add-system-message",
    "content": "User cancelled the previous request."
  }'

echo ""
echo "System event added. Check the conversation messages:"
echo ""

# Fetch messages to verify
curl http://localhost:3141/api/agents/work-agent/conversations/test-conv-123/messages
