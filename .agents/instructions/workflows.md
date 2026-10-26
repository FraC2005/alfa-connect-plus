# Workflows

Four workflow patterns derived from the team schema. The parent agent selects one at task start and tracks state in the conversation.

## Legend

| Abbr | Role |
|------|------|
| U | User |
| P | Planner |
| C | Coder |
| R | Reviewer |
| D | Documentor |

## 1. Full (planner-led)

**When:** complex features, unclear scope, architectural decisions.

**Forward:** `U → P → (C ↔ R) → D`

**Feedback loops:**

| From | To | Trigger |
|------|----|---------|
| R | C | `changes_requested` (max 3 total C↔R iterations) |
| D | C | docs reveal missing implementation |
| D | P | docs reveal plan gaps |
| D | U | clarification needed |
| C | P | scope change or blocker |
| P | U | clarification needed before handoff |

**Constraint:** C ↔ R max **3** iterations. After the 3rd `changes_requested`, escalate to U.

## 2. Coder-led

**When:** simple fixes, straightforward implementation, user skips planning.

**Forward:** `U → (C ↔ R) → D`

**Feedback loops:**

| From | To | Trigger |
|------|----|---------|
| R | C | `changes_requested` (max 3) |
| D | C | docs reveal missing implementation |
| D | U | clarification needed |
| C | U | blocker or scope question |

**Constraint:** C ↔ R max **3** iterations.

## 3. Review-only

**When:** code review, PR review, audit — no new implementation unless reviewer requests fixes via C.

**Forward:** `U → R → D`

**Feedback loops:**

| From | To | Trigger |
|------|----|---------|
| D | R | docs inconsistent with reviewed code |
| D | U | clarification needed |
| R | U | questions or review complete |

If reviewer finds fixable issues and user agrees, spawn Coder-led sub-flow: `R → C ↔ R → D`.

## 4. Doc-only

**When:** documentation, README, changelog, AGENTS.md updates — no code changes expected.

**Forward:** `U → D`

**Feedback loops:**

| From | To | Trigger |
|------|----|---------|
| D | U | clarification needed or task complete |

If documentation work reveals code gaps, escalate to U and optionally switch to Coder-led or Full workflow.

## Iteration tracking

The parent agent maintains `iteration.coder_reviewer` in the handoff bundle:

- Start at `0` before the first review.
- Increment by `1` on each `changes_requested` from Reviewer.
- Stop delegating C↔R when `iteration >= max` (default `max: 3`); report status to User.

Example progression:

```
iteration 0: C implements → R reviews → changes_requested → iteration 1
iteration 1: C fixes     → R reviews → changes_requested → iteration 2
iteration 2: C fixes     → R reviews → changes_requested → iteration 3 → escalate to U
```

## Workflow values for handoff bundle

Use these `workflow` field values in delegation:

| Pattern | Value |
|---------|-------|
| Full | `full` |
| Coder-led | `coder_led` |
| Review-only | `review_only` |
| Doc-only | `doc_only` |
