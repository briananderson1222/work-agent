const API_BASE = 'http://localhost:3141';

async function testInvoke() {
  console.log('Testing /invoke endpoint...\n');

  // Test 1: Simple text
  console.log('Test 1: Simple text (nova-micro)');
  const test1 = await fetch(`${API_BASE}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'What is 2+2?',
      maxSteps: 1,
      model: 'us.amazon.nova-micro-v1:0'
    })
  });
  const result1 = await test1.json();
  console.log('✓', result1.success ? 'PASS' : 'FAIL', '-', result1.response || result1.error);
  console.log('');

  // Test 2: With schema
  console.log('Test 2: With schema (nova-micro)');
  const test2 = await fetch(`${API_BASE}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'What is the capital of France?',
      schema: {
        type: 'object',
        properties: {
          capital: { type: 'string' },
          country: { type: 'string' }
        }
      },
      maxSteps: 1,
      model: 'us.amazon.nova-micro-v1:0'
    })
  });
  const result2 = await test2.json();
  console.log('✓', result2.success ? 'PASS' : 'FAIL');
  console.log('  Response:', JSON.stringify(result2.response || result2.error, null, 2));
}

testInvoke().catch(console.error);
