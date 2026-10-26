# Agent Team

Universal entry point for the multi-agent workflow. Compatible with Cursor, Codex, Claude Code, and any tool that reads [AGENTS.md](https://agents.md).

Orchestration is **subagent-only**: no mailbox, no bus daemon, no filesystem message queue. Flow state lives in the parent conversation (`thread_id`, iteration counters, verdicts).

## Team roster

| Role       | Mention       | Definition                                                 | Invocation                                    |
| ---------- | ------------- | ---------------------------------------------------------- | --------------------------------------------- |
| Planner    | `@planner`    | [`.agents/team/planner.md`](.agents/team/planner.md)       | **Primary only** — never delegate as subagent |
| Coder      | `@coder`      | [`.agents/team/coder.md`](.agents/team/coder.md)           | Primary or subagent                           |
| Reviewer   | `@reviewer`   | [`.agents/team/reviewer.md`](.agents/team/reviewer.md)     | Primary or subagent                           |
| Documentor | `@documentor` | [`.agents/team/documentor.md`](.agents/team/documentor.md) | Primary or subagent                           |

# Team Models

If the file [`.agents/models.md`](.agents/models.md) is missing, generate it with the following specifications:

1. **Model Discovery & Classification**: Inspect currently available environment models, classify them by efficiency and cost-benefit ratio, and save the classification to [`.agents/models.md`](.agents/models.md).
2. **Role-Based Assignment**: Assign the most appropriate models to each team agent based on their role, skills, and tasks. Prioritize real capabilities and cost-efficiency without compromising quality. Models can be selected autonomously by the caller or the agent itself, adhering strictly to these criteria.
3. **Declaration of Assignments**: Document the model assignments for each agent—following the criteria in step 2—directly within [`.agents/models.md`](.agents/models.md).
4. **Usage Tracking & Cost Optimization**: Always consult the usage history in [`.agents/usage.md`](.agents/usage.md) _before choosing the appropriate model_ to ensure cost-efficiency. Every time an agent or sub-agent uses a specific model, log/update the event in [`.agents/usage.md`](.agents/usage.md) using a table with the following columns:
      - Agent
      - Usage Count (number of times used)
      - Model
      - Input & Output Tokens

   *Purpose*: Monitor and verify costs to optimize spending via this tracking table.

## Workflow selection

Choose the workflow from user intent before starting:

| Intent                                       | Workflow        | Forward path                                                        |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------- |
| Complex feature, unclear scope, architecture | **Full**        | `User → Planner → (Coder :left_right_arrow: Reviewer) → Documentor` |
| Simple fix or straightforward implementation | **Coder-led**   | `User → (Coder :left_right_arrow: Reviewer) → Documentor`           |
| Code review, PR review, audit                | **Review-only** | `User → Reviewer → Documentor`                                      |
| Docs, README, changelog, AGENTS.md updates   | **Doc-only**    | `User → Documentor`                                                 |

Details and feedback loops: [`.agents/instructions/workflows.md`](.agents/instructions/workflows.md)

## Global rules

1. **Planner is primary-only.** Never invoke `@planner` via Task, subagent, or nested delegation. The user (or the active primary agent acting as planner) loads `planner.md` directly.
2. **Coder :left_right_arrow: Reviewer loop: max 3 iterations.** Track `coder_reviewer_iteration` in the handoff bundle. On the 3rd `changes_requested`, escalate to the user instead of looping again.
3. **Narrate operational steps** in chat at each handoff and completion.
4. **Generate `thread_id`** on new tasks: `YYYYMMDD-slug` (e.g. `20260924-sqrt-script`).
5. **Load role definitions on demand.** Read the matching `.agents/team/{role}.md` when activating or delegating a role.
6. **Follow the handoff protocol** in [`.agents/instructions/delegation.md`](.agents/instructions/delegation.md) for every delegation.

## Activation

When the user mentions `@planner`, `@coder`, `@reviewer`, or `@documentor`:

1. Read this file and the role definition from `.agents/team/`.
2. Select the workflow (see table above).
3. Operate as that role until the next handoff or completion.
4. Delegate downstream roles via subagent/inline delegation — except `@planner`, which only the user activates as primary.

## Subagent delegation protocol

Pass a handoff bundle in the subagent prompt (not as a file on disk):

```json
{
  "thread_id": "20260924-feature-x",
  "workflow": "full",
  "from": "planner",
  "to": "coder",
  "context": {
    "summary": "what to do",
    "plan": ["step 1"],
    "acceptance_criteria": ["criterion 1"],
    "artifacts": []
  },
  "iteration": { "coder_reviewer": 0, "max": 3 }
}
```

Full schema and IDE adapters: [`.agents/instructions/delegation.md`](.agents/instructions/delegation.md)

## Progressive disclosure index

Load these files only when needed:

| Path                                       | When to load                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `.agents/team/planner.md`                  | User invokes `@planner` or replanning is required                                 |
| `.agents/team/coder.md`                    | Implementation or fix work                                                        |
| `.agents/team/reviewer.md`                 | Code review or post-implementation validation                                     |
| `.agents/team/documentor.md`               | Documentation updates                                                             |
| `.agents/instructions/workflows.md`        | Routing, feedback loops, workflow constraints                                     |
| `.agents/instructions/delegation.md`       | Subagent handoff format and IDE-specific invocation                               |
| `.agents/instructions/code-quality-bar.md` | Shared Coder :left_right_arrow: Reviewer criteria (stability, docs, style, scope) |
