#!/bin/bash

echo "Testing streaming pipeline with test-nova-limited-tools agent..."
echo ""

# Test simple text response
echo "=== Test 1: Simple text response ==="
curl -N -X POST http://localhost:3141/agents/test-nova-limited-tools/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Say hello in one sentence"}],
    "userId": "test-user",
    "conversationId": "test-conv-1"
  }' 2>/dev/null | head -30

echo ""
echo ""
echo "=== Test 2: Tool call (calendar view) ==="
curl -N -X POST http://localhost:3141/agents/test-nova-limited-tools/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What meetings do I have today?"}],
    "userId": "test-user",
    "conversationId": "test-conv-2"
  }' 2>/dev/null | head -50

echo ""
echo "Tests complete!"
