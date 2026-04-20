# Adoption Blockers

Walk through the first-run experience as a new user and identify friction points. This skill simulates what a developer encounters when they first try Stallion.

## Instructions

1. **Read the README.md** from a new user's perspective:
   - Are prerequisites clear and achievable?
   - Is the install process straightforward?
   - Can a non-AWS user figure out what to do?

2. **Check the setup flow:**
   - Read `./stallion` CLI entry point -- what happens on first run?
   - Run `./stallion doctor` -- what does it check? What's missing?
   - Check if auto-install of dependencies works
   - Look for hardcoded assumptions (AWS credentials, specific Node version, OS-specific paths)

3. **Trace the first-chat experience:**
   - After server starts, what does the UI show?
   - Is there a getting-started guide or wizard?
   - What agent is available by default?
   - What happens if no model provider is configured?
   - What error messages does the user see?

4. **Check provider setup friction:**
   - How does a user configure Ollama? OpenAI? Anthropic? Bedrock?
   - Is it documented? Is it in the UI settings?
   - Are error messages helpful when credentials are missing?

5. **Check plugin discovery:**
   - Can a new user find and install plugins?
   - Is the registry accessible?
   - What's the experience of `stallion plugin install`?

6. **Report friction points:**
   ```
   ## Adoption Blockers — [date]

   ### Critical (blocks usage)
   - [Issue]: [where it happens] — [suggested fix]

   ### High (causes confusion)
   - [Issue]: [where it happens] — [suggested fix]

   ### Medium (suboptimal experience)
   - [Issue]: [where it happens] — [suggested fix]

   ### Low (polish)
   - [Issue]: [where it happens] — [suggested fix]
   ```

7. **Cross-reference with roadmap:**
   - Which blockers are already tracked in `docs/strategy/roadmap.md`?
   - Which are new and should be added?

Run this before and after onboarding improvements (Phase 1) to measure progress.
