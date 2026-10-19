# Goal Completion Evidence Gate (first-party extension point)

Goal may propose `stop` after a final assistant answer even when a tool has
**verified** that work remains or an earlier operation is uncertain. The gate
lets COS consider this evidence at the existing Goal decision boundary, without
a second scheduler, silent tool retries, or sending raw tool output to the
decision helper.

The default upstream registry, `src/main/goal-completion-adapters.ts`, is
**empty**. Thus the change has no effect until the application explicitly ships
a first-party audited adapter. MCP plugins cannot register one over the wire.

## Trusted adapter contract

A host-installed `GoalCompletionEvidenceAdapter` specifies exact MCP tool IDs
and interprets only bounded JSON-object receipts from their **results**, never
arguments, free text, or model summaries. An example build/test adapter:

```ts
import type { GoalCompletionEvidenceAdapter } from './goal-completion-evidence.js';
const buildCheck: GoalCompletionEvidenceAdapter = {
  tools: ['mcp__YourTrustedBuildService__verify'],
  interpret(receipt, outcome) {
    if (outcome === 'tool_rejected' && receipt.status === 'unsafe_to_rerun') return 'blocked';
    if (outcome !== 'ok') return null;
    if (receipt.status === 'tests_failed') return 'work_remaining';
    if (receipt.status === 'uncertain') return 'blocked';
    return null; // PASS is not proof that the entire user objective is done.
  }
};
```

The host must review the tool's result schema, provider identity, and trust
model **before** adding it to the static adapter allowlist. An adapter cannot
grant completion or start tools; it can only contradict automatic Goal STOP.

## Constraints

- Only exact conversation/turn/request-ID attribution from the recorder, source
  `mcp`, complete non-truncated results, and known tool IDs qualify.
- The parser accepts bounded JSON object results and limited MCP text wrappers.
  It does not recursively scan arbitrarily nested or multiple content blocks.
- `blocked` dominates `work_remaining`. Neutral/closed receipts never cancel
  previously proved whole-task debt in that source turn.
- The helper gets only a host-authored, bounded instruction, not the receipt.
  COS asks at most one reconsideration of an unsupported STOP.
- An unresolved contradiction pauses **automatic** continuation with an
  actionable error. It never overrides an explicit user Stop/Off.
- No cross-turn assumption is made: an adapter proving work remains in another
  turn requires an explicitly designed durable scoped ledger.
- The Finish path and normal Goal draft path use the same evidence gate.

See `test/goal-completion-evidence.test.ts` for a concrete, fake build-check
adapter and negative provenance, malformed-receipt, and blocked-work scenarios.
