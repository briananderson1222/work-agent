---
name: "aws-research"
description: "Structured research on AWS services — documentation, pricing, Well-Architected guidance. For reviewing existing architectures, use aws-architecture-review."
---

# AWS Service Research

Build comprehensive understanding of an AWS service or solution by gathering data from multiple sources.

## Data Sources (delegate to tool agents)

1. **AWS Documentation (tool-aws-information)** — Service docs, feature details, limits, quotas
2. **Pricing (tool-aws-information)** — Pricing models, free tier, cost dimensions
3. **Well-Architected (tool-aws-information)** — Security best practices, design principles
5. **Web (web search)** — Blog posts, re:Invent talks, community patterns

## Workflow

1. **Clarify scope** — What service/topic? What's the use case? (customer conversation, architecture decision, deep-dive)
2. **[P] Gather from multiple sources:**
   - Documentation lookup for service capabilities and limits
   - Pricing research for cost model and dimensions
   - Well-Architected review for security and design guidance
   - Internal search for roadmap context or service team wikis (if available)
3. **Synthesize** — Combine findings into a coherent picture
4. **Identify gaps** — What's missing? What needs deeper investigation?

## Output Structure

- Service overview (what it does, key features, common use cases)
- Pricing summary (model, key dimensions, free tier, cost estimate range)
- Architecture guidance (Well-Architected alignment, security considerations)
- Limits and quotas (relevant defaults, adjustable vs hard limits)
- Alternatives and comparisons (other AWS services or approaches for the same problem)
- Sources with links

## Key Principles

- NEVER answer from training data — AWS services change constantly
- Run data gathering in parallel where possible
- Always include dates and source links for auditability
- Flag when information might be outdated
- Clearly label what was found vs what's missing
