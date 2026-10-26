# Available models and team assignments

## Scope and confidence

This inventory reflects the model IDs exposed in the current session's agent-tool metadata. It does not guarantee that every model is selectable in every Copilot surface or enabled for this account. Cost and efficiency tiers are qualitative estimates based on model-family naming and specialization; this environment exposes no verified price sheet, latency data, or benchmark results.

## Indicative efficiency and cost-benefit groups

| Group | Models | Typical fit |
|---|---|---|
| Efficient candidates | Claude Haiku 4.5, Claude Haiku 5.5, Gemini 3.7 Flash, Gemini 3.8 Flash, GPT-5 mini, GPT-5.4 mini, MAI Code 1.1 Flash | Routine questions, summaries, simple edits, and narrow coding tasks where latency and cost matter. |
| Balanced candidates | Claude Sonnet 5, Claude Sonnet 5.5, Gemini 4 Argon, GPT-5.4, GPT-5.5, GPT-5.3 Codex, Grok 4.5, Grok 4.6 | General development, analysis, and review. GPT-5.3 Codex is the coding-specialized option in this group. |
| Higher-capability candidates; likely higher cost | Claude Opus 4.8, Claude Opus 5, Claude Opus 5.5, GPT-5.6 Luna, GPT-5.6 Sol, GPT-5.6 Terra, GPT-6 Astra, GPT-6 Luna, GPT-6 Sol, GPT-6.1 Sol, Grok 4.7, HydraFusion, HydraFusion Max | Difficult reasoning or high-stakes work where additional capability may justify extra cost or latency. The relative ranking of these less familiar IDs is unverified. |

These groups are not a precise ranking. Check actual account pricing, quotas, and task-specific evaluation before making cost-sensitive production choices.

## Recommended role defaults

These are preferred candidates, not guaranteed runtime selections. Use the runtime's default when a preferred model is unavailable, and favor a cheaper candidate when the task is routine.

| Team role | Preferred model | Reason |
|---|---|---|
| Planner (primary only) | Claude Sonnet 5.5 | Balanced planning and coordination; reserve Opus for unusually complex planning. |
| Coder | GPT-5.3 Codex | Coding-specialized candidate; use a mini/Flash model for simple, bounded edits when suitable. |
| Reviewer | Claude Sonnet 5.5 | Strong general reasoning for correctness and risk review without defaulting to the highest-cost tier. |
| Documentor | Claude Haiku 5.5 | Efficient for focused documentation; use a balanced model if the docs require substantial technical synthesis. |

The available tool interface may not allow enforcing these assignments for every agent invocation. Do not claim a model was used unless the runtime reports it.

## Model IDs exposed in this session

- Claude: `claude-haiku-4.5`, `claude-haiku-5.5`, `claude-opus-4.8`, `claude-opus-5`, `claude-opus-5.5`, `claude-sonnet-5`, `claude-sonnet-5.5`
- Gemini: `gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-4-argon`
- GPT: `gpt-5-mini`, `gpt-5.3-codex`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol`
- Grok: `grok-4.5`, `grok-4.6`, `grok-4.7`
- Other: `hydrafusion`, `hydrafusion-max`, `mai-code-1.1-flash`
