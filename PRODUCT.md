# Product

## Register

product

## Users

This console is for the operator managing YYB scan-login accounts and exchanging WeChat mini-program codes through `yyb-auth-service`. The operator works with a small set of accounts, repeatedly scans, checks account TDI state, submits target `appid` values, and needs unambiguous success or failure feedback.

## Product Purpose

Provide a separate frontend for the Go backend that makes the real workflow visible:

- Create and poll scan-login sessions
- Store and review accounts by `unionid`
- Keep per-account TDI state in the backend database
- Exchange mini-program `jscode` values by selecting an account and entering an `appid`
- Review recent local frontend run results without inventing analytics

## Brand Personality

Calm, precise, operational.

## Anti-references

- No marketing page
- No API documentation page
- No top KPI cards or fake metrics
- No old script, JSON-file, or local fixed-TDI workflow
- No decorative gradients, glass effects, huge hero sections, or generic SaaS metric panels

## Design Principles

- Start with the task, not statistics.
- Show real backend state only.
- Keep account identity separate from target `appid`.
- Treat tokens and TDI fields as sensitive.
- Use familiar admin controls and restrained styling.

## Accessibility & Inclusion

Target WCAG AA. Status must include text, not color alone. Controls need visible labels, keyboard focus, touch-safe hit areas, and short state-driven motion with reduced-motion support.
