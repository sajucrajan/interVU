# Security Policy

InterVU handles candidate PII, so we take vulnerability reports seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Instead, use GitHub's
[private vulnerability reporting](https://github.com/sajucrajan/interVU/security/advisories/new)
or email **sajucrajan@gmail.com** with details and reproduction steps.

We aim to acknowledge reports within 72 hours. Please give us reasonable time
to release a fix before public disclosure.

## Scope of highest concern

- Cross-tenant data access (org↔org, vendor↔vendor, vendor→org internal data)
- Authentication/session flaws
- PII exposure in logs, exports, or webhooks
