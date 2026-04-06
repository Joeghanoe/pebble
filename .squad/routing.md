# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture, scope, tech decisions | Morpheus | ADRs, system design, trade-off analysis, code review |
| React UI, Zustand state | Trinity | Components, scenes, animations, frontend auth (MSAL) |
| Azure Functions, Durable Functions, APIs | Tank | Orchestrators, activities, Cosmos DB, ingestion pipelines |
| Tests, quality, edge cases | Oracle | xUnit, Vitest, ReqNRoll, Cypress BDD, coverage |
| Bicep, CI/CD, Azure resources | Niobe | Infra changes, pipeline config, deployment, Key Vault |
| Code review | Morpheus | Review PRs, check quality, enforce conventions |
| Testing | Oracle | Write tests, find edge cases, verify fixes |
| Scope & priorities | Morpheus | What to build next, trade-offs, decisions |
| Session logging | Scribe | Automatic — never needs routing |
| Work queue monitoring | Ralph | Automatic — activated by user |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Morpheus |
| `squad:morpheus` | Pick up issue and complete the work | Morpheus |
| `squad:trinity` | Pick up issue and complete the work | Trinity |
| `squad:tank` | Pick up issue and complete the work | Tank |
| `squad:oracle` | Pick up issue and complete the work | Oracle |
| `squad:niobe` | Pick up issue and complete the work | Niobe |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **Morpheus** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn Oracle to write test cases simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member.
