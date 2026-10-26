# Code quality bar (Coder ↔ Reviewer)

Single source of truth for implementation and review. **`@coder`** satisfies this bar before handoff; **`@reviewer`** verifies the same bar on `artifacts`. Criteria must stay aligned — if this file and the code diverge, the code wins until docs are updated.

## Operational criteria

| Area | Coder obligation | Reviewer verification |
|------|------------------|------------------------|
| **Stability** | Correct, predictable behavior; edge cases and failure paths that matter for the feature; no fragile assumptions or obvious regression risks | Behavior correct and predictable; edge cases and failure paths handled where they matter; no obvious regressions, race conditions, or fragile assumptions |
| **Documentation in code** | Document public APIs, modules, and non-obvious behavior; update README touchpoints when user-facing | Public APIs, modules, and non-obvious behavior documented appropriately (docblocks, module headers, README when user-facing) |
| **Complex logic** | On non-trivial branches, persistence, auth, or domain rules, comment **which business logic applies** and **what outcome** the block must achieve | Same: brief comments on non-trivial logic explaining business rules and intended outcome |
| **Style consistency** | Match surrounding naming, formatting, structure, and patterns | Naming, formatting, structure, and patterns match the codebase — not a preference rewrite |
| **No waste / no over-engineering** | Minimum code for the handoff; no unused helpers, speculative abstractions, or scope beyond acceptance criteria | No unused code, speculative abstractions, single-use frameworks, or scope creep; flag YAGNI and dead paths introduced by `@coder` |

**Approve gate (reviewer):** change set is **stable**, **understandable**, **consistent**, and **right-sized** for the request.

## Pre-handoff self-check (`@coder`)

Before handoff to `@reviewer`:

1. Handoff acceptance criteria are met.
2. Every row in the operational criteria table is satisfied for all `artifacts`.
3. Diff is surgical: every changed line traces to the request.

If a criterion cannot be met without scope change, escalate to `@planner` or user — do not guess.

## Review feedback (`@reviewer`)

- Return `changes_requested` with **actionable** notes: file, issue, suggested fix.
- **Cite the area** that failed: `stability` | `docs` | `complex logic` | `style` | `over-engineering`.
- Do not implement fixes unless scope is explicitly review+fix; route to `@coder`.

## Mapping to `@coder` behavioral guidelines

Use together with the Guidelines section in [coder.md](../team/coder.md):

| Quality bar area | Supporting guideline (coder.md) |
|------------------|----------------------------------|
| Stability | Goal-driven execution — verifiable checks before handoff |
| Documentation in code | (explicit in quality bar — not optional) |
| Complex logic | Think before coding — state assumptions and domain rules |
| Style consistency | Surgical changes — match existing style |
| No waste / over-engineering | Simplicity first — minimum code, no speculation |
