// tool-called.js — Assert a specific tool was invoked
// config.tool: string — expected tool name
// Checks telemetry for tool invocations first, falls back to output text matching

const { getToolInvocations, getNewEvents } = require('./telemetry-utils');

const ALIASES = {
  'use_subagent': ['use_subagent', 'subagent', 'invokesubagents', 'invoke subagents', 'delegate', 'delegat'],
  'execute_bash': ['execute_bash', 'bash', 'shell', 'command', 'running'],
  'todo_list': ['todo_list', 'todo list', 'todo'],
  'fs_write': ['fs_write', 'create', 'write', 'creating file'],
  'fs_read': ['fs_read', 'read', 'reading'],
  'thinking': ['thinking', 'reasoning'],
};

module.exports = (output, { config }) => {
  const tool = (config.tool || '').toLowerCase();

  // Try telemetry first
  const events = getNewEvents();
  const invocations = getToolInvocations(events);
  if (invocations.some(e => e.tool && e.tool.name && e.tool.name.toLowerCase() === tool)) {
    return { pass: true, score: 1, reason: `Telemetry confirms tool '${config.tool}' was invoked` };
  }

  // Fall back to text matching
  const text = (output || '').toLowerCase();
  const variants = ALIASES[tool] || [tool, tool.replace(/_/g, ' ')];
  if (variants.some(v => text.includes(v))) {
    return { pass: true, score: 1, reason: `Tool '${config.tool}' evidence found in output` };
  }
  return { pass: false, score: 0, reason: `Tool '${config.tool}' not found in output or telemetry` };
};
