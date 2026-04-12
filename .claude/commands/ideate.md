# Ideate

Pull inspiration from competitor repos and suggest improvements for Stallion AI.

## Instructions

1. **Read context first:**
   - Read `docs/strategy/differentiators.md` to understand current differentiators
   - Read `docs/strategy/competitive-landscape.md` to understand tracked competitors
   - Read `docs/strategy/roadmap.md` to understand the current active phase

2. **Research competitors** for the specific area the user asks about (or all areas if unspecified):
   - Search GitHub repos: openai/codex, nousresearch/hermes-agent, badlogic/pi-mono, pingdotgg/t3code, happier-dev/happier
   - Use `gh` CLI or web search to find recent changes, new features, and architectural patterns
   - Focus on features relevant to Stallion's differentiators and current roadmap phase

3. **Compare against Stallion's current state:**
   - For each relevant feature found, check if Stallion has an equivalent
   - Use Grep/Glob to verify claims (don't assume -- check the code)
   - Note gaps, opportunities, and features worth stealing

4. **Generate recommendations:**
   - Concrete suggestions with file-level implementation hints
   - Prioritized by alignment with current roadmap phase
   - Include effort estimate (small/medium/large)

5. **Append findings to `docs/strategy/ideation-log.md`:**
   - Date and source
   - Key insights
   - Recommendations
   - Outcome/next steps

If the user provides a specific topic (e.g., "ideate on plugin system" or "ideate on memory"), focus the research on that area. Otherwise, do a broad scan.
