# Delegation protocol

Subagent-only orchestration. Handoffs are structured prompts passed by the parent agent — not files on disk.

## Handoff bundle schema

```json
{
  "thread_id": "20260924-feature-x",
  "workflow": "full",
  "from": "planner",
  "to": "coder",
  "context": {
    "summary": "one-line task summary",
    "plan": ["optional step 1", "step 2"],
    "acceptance_criteria": ["criterion 1"],
    "constraints": ["optional constraints"],
    "artifacts": ["path/to/file"],
    "verdict": "optional: done | failed | approved | changes_requested",
    "notes": "optional free-text"
  },
  "iteration": {
    "coder_reviewer": 0,
    "max": 3
  }
}
```

### Required fields

| Field | Description |
|-------|-------------|
| `thread_id` | Stable ID for the task (`YYYYMMDD-slug`) |
| `workflow` | `full` \| `coder_led` \| `review_only` \| `doc_only` |
| `from` | Sending role: `user` \| `planner` \| `coder` \| `reviewer` \| `documentor` |
| `to` | Target role |
| `context.summary` | What the target role must do |

### Reply from subagent

Subagents return a reply bundle (same schema, updated fields):

```json
{
  "thread_id": "20260924-feature-x",
  "workflow": "full",
  "from": "coder",
  "to": "reviewer",
  "context": {
    "summary": "implemented sqrt script with negative number rejection",
    "artifacts": ["src/sqrt.py"],
    "verdict": "done"
  },
  "iteration": { "coder_reviewer": 0, "max": 3 }
}
```

## Delegation steps

1. Parent reads `.agents/team/{to}.md`. When `to` is `coder` or `reviewer`, also read [code-quality-bar.md](code-quality-bar.md).
2. Parent builds the handoff bundle with current `thread_id`, `workflow`, and `iteration`.
3. Parent invokes the target role (subagent or inline).
4. Subagent follows its role definition and returns a reply bundle.
5. Parent routes the reply to the next role per [workflows.md](workflows.md).

## Planner constraint

**Never delegate to `@planner` as a subagent.** Only the user activates planner as the primary agent in a conversation. Other roles may send feedback *to* planner only when planner is already the active primary agent.

## IDE adapters

### Cursor

Use the Task tool with the role definition and handoff bundle:

```
Task(
  subagent_type="generalPurpose",
  description="Coder handoff",
  prompt="""
Load and follow .agents/team/coder.md and .agents/instructions/code-quality-bar.md

Handoff bundle:
{ ... json ... }

Return a reply bundle when done.
"""
)
```

For review workflows, use `subagent_type="bugbot"` when the user explicitly requests Bugbot-style review.

### OpenAI Codex

Use native subagents with the same prompt structure: role file path + handoff bundle + instruction to return a reply bundle.

### Claude Code / generic

When subagent APIs are unavailable, the parent agent:

1. Reads `.agents/team/{role}.md`.
2. Applies that role's rules inline in the same conversation.
3. Produces the reply bundle before switching to the next role.

This inline mode is fully compatible with the same handoff schema.

## Escalation to user

Escalate when:

- `iteration.coder_reviewer >= iteration.max` and reviewer still returns `changes_requested`
- Any role hits a blocker (missing credentials, ambiguous requirements, destructive action needed)
- User input is required to choose between workflow branches

Report: `thread_id`, current workflow, roles involved, iteration count, and a concise summary of the blocker.
