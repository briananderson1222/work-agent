---
name: "crowdsource"
description: "Spawn parallel subagents on the same problem, compare outputs, synthesize the best answer. For ambiguous questions or architecture trade-offs."
---

# Parallel Reasoning

Solve problems by spawning multiple independent subagents and selecting the best result.

## Workflow

### Step 1: RECEIVE
- Understand the problem and all relevant context
- If context is insufficient, ask the user before proceeding

### Step 2: SPAWN
- Delegate the SAME query to 3 subagents in parallel (use any available `tool-*` agent appropriate for the domain)
- Give each the EXACT same query and context — do not vary the prompt
- Include all relevant context the subagents need to produce a complete answer

### Step 3: COMPARE
- Review all responses
- Evaluate each on: correctness, completeness, clarity, and practical value
- Note where responses agree (high confidence) and where they diverge (needs scrutiny)

### Step 4: SELECT
- Pick the best response, or synthesize the strongest parts from multiple responses
- Explain briefly why you chose it (e.g., "Response 2 was most thorough but Response 1 caught an edge case the others missed")
- Present the final answer to the user

## When to Use
- Uncertain about a plan or approach
- User has asked for repeated follow-ups on the same problem
- Complex decisions with multiple valid paths
- Need to validate a solution from independent angles
