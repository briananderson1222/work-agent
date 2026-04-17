---
name: "aws-cost-analysis"
description: "Investigate AWS billing and usage — spend drivers, optimization opportunities, savings plans, RI recommendations, cost anomalies."
---

# AWS Cost Analysis

Investigate AWS spending by combining billing data with pricing context.

## Data Sources (delegate to tool agents)

1. **Billing (tool-aws-operations)** — Cost Explorer, budgets, anomalies, usage reports
2. **Pricing (tool-aws-information)** — Service pricing models, reserved/spot options
3. **Well-Architected (tool-aws-information)** — Cost optimization pillar guidance
4. **Account resources (tool-aws-operations)** — Running resources, utilization metrics

## Workflow

1. **Clarify scope** — Which account/region/service? What time period? What triggered the investigation?
2. **[P] Gather cost data:**
   - Pull billing summary for the period (Cost Explorer)
   - Check for budget alerts or anomalies
   - Look up pricing models for top-spend services
3. **Analyze** — Identify top cost drivers, trends, and anomalies
4. **[P] Research optimization:**
   - Check for right-sizing opportunities
   - Evaluate reserved capacity or savings plans
   - Review Well-Architected cost optimization guidance
5. **Recommend** — Prioritized list of actions with estimated savings

## Output Structure

- Cost summary (total spend, period, top services)
- Trend analysis (month-over-month, anomalies)
- Top cost drivers (service breakdown with percentages)
- Optimization opportunities (action, estimated savings, effort)
- Pricing model recommendations (reserved, spot, savings plans)
- Sources and methodology

## Key Principles

- Always specify the time period being analyzed
- Compare against previous periods for trend context
- Distinguish between one-time costs and recurring spend
- Flag any assumptions made in savings estimates
