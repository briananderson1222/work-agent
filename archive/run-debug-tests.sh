#!/bin/bash

echo "=== Nova Streaming Debug Test Suite ==="
echo ""

echo "1. Testing Nova WITHOUT tools (baseline)..."
npx tsx test-nova-no-tools.ts
echo ""
echo "Press Enter to continue..."
read

echo "2. Testing Nova WITH tools (raw AWS SDK)..."
npx tsx test-bedrock-raw.ts
echo ""
echo "Press Enter to continue..."
read

echo "3. Testing Claude WITH tools (comparison)..."
npx tsx test-claude-comparison.ts
echo ""
echo "Press Enter to continue..."
read

echo "4. Testing Nova with socket-level debugging..."
npx tsx test-socket-debug.ts
echo ""
echo "Press Enter to continue..."
read

echo "5. Testing Nova with parser safety checks..."
npx tsx test-parser-safety.ts
echo ""

echo "=== Tests Complete ==="
echo ""
echo "Generated files:"
ls -lh .bedrock-debug-* .claude-stream-* .nova-parser-* 2>/dev/null || echo "No debug files generated"
echo ""
echo "Next steps:"
echo "1. Review .bedrock-debug-*-response.json for raw stream data"
echo "2. Compare .claude-stream-capture.json vs Nova behavior"
echo "3. Check .nova-parser-safety.json for malformed chunks"
echo "4. Look for socket close events in test output"
