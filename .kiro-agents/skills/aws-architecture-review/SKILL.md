---
name: "aws-architecture-review"
description: "Assess an architecture against the AWS Well-Architected Framework (all six pillars). For researching a specific service, use aws-research."
---

# AWS Architecture Review

Evaluate an architecture against the AWS Well-Architected Framework.

## Data Sources (delegate to tool agents)

1. **Well-Architected (tool-aws-information)** — Pillar best practices, design principles
2. **Documentation (tool-aws-information)** — Service-specific guidance and limits
3. **Pricing (tool-aws-information)** — Cost implications of architectural choices
5. **Account (tool-aws-operations)** — Current resource configuration (if access available)

## Workflow

1. **Understand the architecture** — What services? What's the workload? Gather or review architecture diagrams/descriptions
2. **Scope the review** — All six pillars or focused on specific concerns?
3. **[P] Evaluate per pillar:**
   - **Security** — IAM, encryption, network controls, data protection
   - **Reliability** — Multi-AZ, backups, failure recovery, scaling
   - **Performance** — Right-sizing, caching, CDN, database optimization
   - **Cost Optimization** — Pricing models, unused resources, right-sizing
   - **Operational Excellence** — Monitoring, alerting, IaC, runbooks
   - **Sustainability** — Resource efficiency, managed services, scaling patterns
4. **Prioritize findings** — Rank by risk and effort
5. **Recommend** — Actionable improvements with references

## Output Structure

For each pillar reviewed:
- Current state assessment
- Gaps identified (with severity: critical / high / medium / low)
- Recommended actions with effort estimate
- Relevant Well-Architected best practice references

Summary:
- Overall risk assessment
- Top 3-5 priority actions
- Quick wins vs strategic improvements

## Key Principles

- Never assume compliance — verify against actual configuration when possible
- Reference specific Well-Architected best practices by name
- Consider the workload context (not every best practice applies to every workload)
- Flag trade-offs between pillars (e.g., higher reliability may increase cost)
