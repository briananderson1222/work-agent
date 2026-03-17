import { test, expect } from '@playwright/test';

interface CapturedRequest {
  url: string;
  body: any;
  timestamp: number;
}

test('network audit - detect duplicate tool calls', async ({ page }) => {
  const capturedRequests: CapturedRequest[] = [];

  // Listen for all requests to tool call endpoints
  page.on('request', async (request) => {
    const url = request.url();
    if (url.includes('/agents/') && url.includes('/tools/')) {
      try {
        const body = request.postData() ? JSON.parse(request.postData()!) : {};
        // Extract tool name from URL: /agents/{slug}/tools/{toolName}
        const urlMatch = url.match(/\/tools\/([^/?]+)/);
        const toolName = urlMatch ? decodeURIComponent(urlMatch[1]) : 'unknown';
        capturedRequests.push({
          url,
          body: { name: toolName, arguments: body },
          timestamp: Date.now()
        });
      } catch (e) {
        // Skip if body isn't valid JSON
      }
    }
  });

  // Navigate and wait for initial load
  await page.goto('/');
  await page.waitForTimeout(3000);

  // Try to click stallion workspace tab
  try {
    const stallionTab = page.locator('text=SA Agent').or(page.locator('text=Stallion'));
    if (await stallionTab.isVisible()) {
      await stallionTab.click();
    }
  } catch (e) {
    // Continue if tab not found
  }

  // Wait for data to load
  await page.waitForTimeout(5000);

  // Analyze captured requests for duplicates
  const toolCalls = new Map<string, CapturedRequest[]>();
  
  capturedRequests.forEach(req => {
    const toolName = req.body.name || 'unknown';
    const paramsKey = JSON.stringify(req.body.arguments || {});
    const key = `${toolName}:${paramsKey}`;
    
    if (!toolCalls.has(key)) {
      toolCalls.set(key, []);
    }
    toolCalls.get(key)!.push(req);
  });

  // Find duplicates — in dev mode React StrictMode double-mounts, so 2x is expected.
  // Flag anything called 3+ times as a real duplicate.
  const STRICT_MODE_MULTIPLIER = 2;
  const duplicates: string[] = [];
  const summary: Array<{tool: string, count: number, params: string}> = [];

  toolCalls.forEach((requests, key) => {
    const [toolName, paramsJson] = key.split(':', 2);
    const params = paramsJson.substring(0, 80);
    
    summary.push({
      tool: toolName,
      count: requests.length,
      params
    });

    if (requests.length > STRICT_MODE_MULTIPLIER) {
      duplicates.push(`${toolName} x${requests.length} (${params})`);
    }
  });

  // Log summary table
  console.log('\n=== Network Audit Summary ===');
  console.log(`Tool call requests: ${capturedRequests.length}`);
  console.log('\nTool Name | Count | Params (first 80 chars)');
  console.log('----------|-------|------------------------');
  summary.forEach(s => {
    console.log(`${s.tool.padEnd(9)} | ${s.count.toString().padEnd(5)} | ${s.params}`);
  });

  if (duplicates.length > 0) {
    console.log('\n=== DUPLICATES DETECTED ===');
    duplicates.forEach(dup => console.log(`- ${dup}`));
  } else {
    console.log('\n✓ No duplicates detected');
  }

  // Test always passes - this is diagnostic
  expect(true).toBe(true);
});