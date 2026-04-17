---
name: "run-prompt"
description: "Discover and execute saved prompts from ~/.kiro/prompts/. Lists available prompts and runs them with optional context."
---

# Run Prompt

Dynamically discover, inspect, and execute saved prompts.

## Trigger Patterns

This skill activates when the user:

1. Uses explicit syntax: `Prompt(<name>)` optionally preceded OR followed by additional context
   - Example: `Prompt(kcommit)`
   - Example: `Prompt(test) with coverage at 80%`
   - Example: `Prompt(checkpoint) for the auth module`

2. Describes what they want using the word "prompt":
   - "run the kcommit prompt"
   - "execute the commit prompt with only staged files"
   - "is there a prompt for testing?"
   - "what prompts do I have?"
   - "show me available prompts"

Everything after the prompt name is treated as additional context to inject.

## Workflow

### Step 1: DISCOVER
Use the `introspect` tool to get the list of available prompts and their locations.
- Do NOT use glob, grep, ls, or filesystem exploration — introspect is the ONLY discovery method
- If introspect returns prompt locations, read the prompt file directly — do not search further
- If unable to discover where prompts live, ask the user if they want to load any markdown files in the current directory (ie. `./**/*.md`)
- If unable to discover any prompts, let the user know that no prompts could be found and in what locations you looked.

### Step 2: MATCH
If the user specified a prompt name (via `Prompt(<name>)` or by description):
- Match against discovered prompt names (fuzzy match is fine — `commit` matches `kcommit` )
- If ambiguous, show matching candidates and ask the user to pick or direct them to be more specific with their invocation
- Skip to Step 3

If the user just asked to see prompts:
- List all prompts with their description (from YAML frontmatter or first heading)
- Wait for the user to select one

### Step 3: LOAD
Read the full prompt file. Check for:
- `{parameter}` or `{parameter:default}` placeholders
- `{context?}` optional context injection points

### Step 4: INJECT CONTEXT
If the user provided additional context after the prompt name:
- Substitute `{context?}` placeholders inline if present
- Substitute `{parameter:default}` values if the user provided overrides
- Append remaining context as `## Additional Context` at the end

If required `{parameter}` placeholders have no defaults and no user-provided values:
- Ask the user for values (if interactive)
- Use sensible defaults if non-interactive

### Step 5: EXECUTE
Briefly confirm which prompt you're running and any injected context, then execute the prompt as your current task. The loaded prompt content becomes your primary instructions.

## Key Principles
- ALWAYS use `introspect` to find prompts — never hardcode paths
- ALWAYS read the prompt file fresh — never assume content from memory
- Treat the loaded prompt as your primary instructions for the remainder of the task
- If a prompt references tools or agents you don't have access to, say so rather than failing silently
