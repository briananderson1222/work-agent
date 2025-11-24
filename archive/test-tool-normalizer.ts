#!/usr/bin/env node
import { normalizeToolName, createToolNameMap } from './src-server/utils/tool-name-normalizer.js';

console.log('🧪 Testing tool name normalization\n');

const testCases = [
  { input: 'sat-outlook_calendar_view', expected: 'satOutlook_calendarView' },
  { input: 'sat-outlook_email_search', expected: 'satOutlook_emailSearch' },
  { input: 'sat-sfdc_query', expected: 'satSfdc_query' },
  { input: 'sat-sfdc_get_account', expected: 'satSfdc_getAccount' },
  { input: 'my-tool', expected: 'myTool' },
  { input: 'simple_tool', expected: 'simple_tool' },
  { input: 'alreadyCamelCase', expected: 'alreadyCamelCase' },
];

let passed = 0;
let failed = 0;

for (const { input, expected } of testCases) {
  const result = normalizeToolName(input);
  const status = result === expected ? '✅' : '❌';
  
  console.log(`${status} ${input} → ${result}`);
  
  if (result === expected) {
    passed++;
  } else {
    failed++;
    console.log(`   Expected: ${expected}`);
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

// Test map creation
console.log('\n🗺️  Testing tool name map creation\n');

const toolNames = [
  'sat-outlook_calendar_view',
  'sat-sfdc_query',
  'simple_tool',
];

const map = createToolNameMap(toolNames);

console.log('Original → Normalized:');
for (const [original, normalized] of map.entries()) {
  console.log(`  ${original} → ${normalized}`);
}

console.log(`\nMap size: ${map.size} (only changed names)`);

process.exit(failed > 0 ? 1 : 0);
