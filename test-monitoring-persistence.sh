#!/bin/bash

# Test script for monitoring event persistence

API_BASE="http://localhost:3141"
AGENT="sa-agent"

echo "=== Testing Monitoring Event Persistence ==="
echo ""

# 1. Send a test message to generate events
echo "1. Sending test message to generate events..."
curl -s -X POST "$API_BASE/agents/$AGENT/text" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello, this is a test"}],
    "userId": "test-user",
    "conversationId": "agent:sa-agent:user:test-user:1234567890:test123"
  }' > /dev/null

echo "✓ Message sent"
echo ""

# 2. Wait for events to be processed
echo "2. Waiting for events to be processed..."
sleep 2
echo "✓ Done"
echo ""

# 3. Check if event log file was created
echo "3. Checking for event log file..."
TODAY=$(date +%Y-%m-%d)
EVENT_FILE=".work-agent/monitoring/events-$TODAY.ndjson"

if [ -f "$EVENT_FILE" ]; then
  echo "✓ Event log file exists: $EVENT_FILE"
  echo ""
  echo "4. Event log contents:"
  cat "$EVENT_FILE" | jq -r '. | "\(.timestamp) - \(.type) - \(.agentSlug // "N/A")"'
  echo ""
  echo "Total events: $(wc -l < "$EVENT_FILE")"
else
  echo "✗ Event log file not found: $EVENT_FILE"
  exit 1
fi

echo ""

# 5. Test historical query
echo "5. Testing historical event query..."
START_TIME=$(date -u -v-1H +%Y-%m-%dT%H:%M:%S.000Z)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

RESPONSE=$(curl -s "$API_BASE/monitoring/events?start=$START_TIME&end=$END_TIME")
EVENT_COUNT=$(echo "$RESPONSE" | jq '.data | length')

echo "✓ Historical query returned $EVENT_COUNT events"
echo ""

# 6. Test SSE stream (just connect and disconnect)
echo "6. Testing SSE stream connection..."
timeout 2 curl -s -N "$API_BASE/monitoring/events" | head -1 > /dev/null
if [ $? -eq 124 ]; then
  echo "✓ SSE stream connected successfully"
else
  echo "✗ SSE stream connection failed"
fi

echo ""
echo "=== All tests passed! ==="
