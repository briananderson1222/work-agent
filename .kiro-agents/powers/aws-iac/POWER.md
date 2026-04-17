---
name: "aws-iac"
displayName: "AWS Infrastructure as Code"
description: "CDK, Terraform, CloudFormation - write, validate, and troubleshoot infrastructure code with cfn-lint, cfn-guard, and Cloud Control API"
keywords: ["cdk", "terraform", "cloudformation", "cfn", "infrastructure", "iac", "stack", "template", "construct", "hcl", "cloud control"]
---

# AWS Infrastructure as Code

Write, validate, and troubleshoot IaC with CDK, Terraform, and CloudFormation.

## Available Tools
- `awslabs.cdk-mcp-server` — CDK documentation and construct guidance
- `awslabs.terraform-mcp-server` — Terraform registry, modules, provider docs
- `awslabs.ccapi-mcp-server` — AWS Cloud Control API resource schemas
- `awslabs.aws-iac-mcp-server` — cfn-lint validation, cfn-guard compliance, CloudFormation troubleshooting

## Best Practices
- Never expose resources to 0.0.0.0/0
- Use least-privilege IAM
- Enable encryption at rest and in transit
- Tag resources for cost allocation
- Validate templates before deployment