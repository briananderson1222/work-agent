// telemetry-utils.js — Read telemetry JSONL and extract events for the current eval run
const fs = require('fs');
const path = require('path');

const TELEMETRY_FILE = (() => {
  const agent = process.env.KIRO_EVAL_AGENT || 'dev';
  const agentsDir = path.join(process.env.HOME, '.kiro/agents');
  try {
    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith(`-${agent}.json`));
    for (const f of files) {
      const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
      const match = content.match(new RegExp(`${process.env.HOME}/.kiro-agents/[^"]+`));
      if (match) {
        const pkgPath = match[0].replace(/\/context\/.*/, '');
        const telPath = path.join(pkgPath, '.telemetry/full.jsonl');
        if (fs.existsSync(telPath)) return telPath;
      }
    }
  } catch {}
  return path.join(process.env.HOME, '.kiro-agents/.telemetry/full.jsonl');
})();
const SNAPSHOT_FILE = '/tmp/promptfoo-eval-telemetry-snapshot.txt';

function getNewEvents() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return [];
  if (!fs.existsSync(TELEMETRY_FILE)) return [];

  const snapshotLine = parseInt(fs.readFileSync(SNAPSHOT_FILE, 'utf8').trim(), 10);
  if (isNaN(snapshotLine) || snapshotLine <= 0) return [];

  const lines = fs.readFileSync(TELEMETRY_FILE, 'utf8').trim().split('\n');
  return lines.slice(snapshotLine).reduce((acc, line) => {
    try { acc.push(JSON.parse(line)); } catch {}
    return acc;
  }, []);
}

function filterByType(events, type) {
  return events.filter(e => e.event_type === type);
}

function getToolInvocations(events) {
  const agent = process.env.KIRO_EVAL_AGENT;
  return filterByType(events, 'tool.invoke').filter(
    e => !agent || (e.agent && e.agent.name === agent)
  );
}

function getSubagentCalls(events) {
  const agent = process.env.KIRO_EVAL_AGENT;
  return getToolInvocations(events).filter(
    e => e.tool && e.tool.name === 'use_subagent' && e.tool.input && e.tool.input.command === 'InvokeSubagents'
      && (!agent || (e.agent && e.agent.name === agent))
  );
}

function getDelegationTargets(events) {
  return getSubagentCalls(events).flatMap(e => {
    const subs = e.tool.input.content && e.tool.input.content.subagents;
    return subs ? subs.map(s => s.agent_name).filter(Boolean) : [];
  });
}

module.exports = { getNewEvents, filterByType, getToolInvocations, getSubagentCalls, getDelegationTargets };
