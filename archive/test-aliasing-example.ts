#!/usr/bin/env node
/**
 * Example demonstrating transparent tool name aliasing
 */

// Simulated tool name mapping (what the runtime maintains)
const toolNameMapping = new Map([
  ['satOutlook_calendarView', { original: 'sat-outlook_calendar_view', normalized: 'satOutlook_calendarView' }],
  ['satOutlook_emailSearch', { original: 'sat-outlook_email_search', normalized: 'satOutlook_emailSearch' }],
  ['satSfdc_query', { original: 'sat-sfdc_query', normalized: 'satSfdc_query' }],
]);

// Helper functions
function getOriginalToolName(normalizedName: string): string {
  const mapping = toolNameMapping.get(normalizedName);
  return mapping?.original || normalizedName;
}

function getNormalizedToolName(originalName: string): string {
  for (const [normalized, { original }] of toolNameMapping.entries()) {
    if (original === originalName) {
      return normalized;
    }
  }
  return originalName;
}

console.log('🔄 Tool Name Aliasing - Transparent to Users\n');

// Scenario 1: User references original name in config
console.log('📝 Scenario 1: User Config with Original Names');
console.log('─────────────────────────────────────────────');

const userConfig = {
  tools: {
    available: ['sat-outlook_*', 'sat-sfdc_query'],
    autoApprove: ['sat-outlook_calendar_view']
  }
};

console.log('User writes in agent.json:');
console.log(JSON.stringify(userConfig, null, 2));

console.log('\n✨ System internally converts to:');
const normalizedConfig = {
  tools: {
    available: ['satOutlook_*', 'satSfdc_query'],
    autoApprove: ['satOutlook_calendarView']
  }
};
console.log(JSON.stringify(normalizedConfig, null, 2));

// Scenario 2: Nova invokes tool
console.log('\n\n🤖 Scenario 2: Nova Invokes Tool');
console.log('─────────────────────────────────────────────');

const novaToolCall = 'satOutlook_calendarView';
console.log(`Nova calls: ${novaToolCall}`);
console.log(`✅ Works perfectly (no hyphens)`);

// Scenario 3: Display to user
console.log('\n\n👤 Scenario 3: Display to User');
console.log('─────────────────────────────────────────────');

console.log(`System shows in logs: "${getOriginalToolName(novaToolCall)}"`);
console.log(`User sees familiar name, not normalized version`);

// Scenario 4: User asks about tool
console.log('\n\n💬 Scenario 4: User References Tool in Prompt');
console.log('─────────────────────────────────────────────');

const userPrompt = 'Use sat-outlook_calendar_view to check my schedule';
console.log(`User says: "${userPrompt}"`);

const toolInPrompt = 'sat-outlook_calendar_view';
const normalized = getNormalizedToolName(toolInPrompt);
console.log(`System maps: ${toolInPrompt} → ${normalized}`);
console.log(`✅ Tool found and executed`);

// Scenario 5: API request
console.log('\n\n🌐 Scenario 5: API Request');
console.log('─────────────────────────────────────────────');

console.log('GET /tools/mappings');
console.log('\nResponse:');
console.log(JSON.stringify({
  success: true,
  data: Array.from(toolNameMapping.entries()).map(([normalized, { original }]) => ({
    original,
    normalized
  }))
}, null, 2));

// Summary
console.log('\n\n📊 Summary');
console.log('─────────────────────────────────────────────');
console.log('✅ Users write original names (sat-outlook_calendar_view)');
console.log('✅ Nova sees normalized names (satOutlook_calendarView)');
console.log('✅ Logs show original names for clarity');
console.log('✅ No breaking changes to existing configs');
console.log('✅ Works with any 3rd-party MCP tool');
console.log('✅ Completely transparent to end users');
