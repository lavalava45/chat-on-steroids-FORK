/**
 * Trusted completion evidence at a Goal decision boundary.
 *
 * Only FIRST-PARTY, explicitly registered adapters may interpret exact MCP
 * results. Tool text, arguments, assistant prose and nested summaries never
 * register an adapter or become helper instructions. A tool's success is not
 * itself proof that the user's WHOLE task is complete.
 */
import type { SessionEvent } from '../shared/session.js';

export type GoalCompletionState = 'work_remaining' | 'blocked' | null;
type ToolEvent = Extract<SessionEvent, { kind: 'tool_call' }>;
type ReceiptOutcome = 'ok' | 'tool_rejected';

export interface GoalCompletionEvidenceAdapter {
  /** Exact, first-party configured MCP tool IDs, including any transport prefix. */
  readonly tools: readonly string[];
  /** Interpret one complete, JSON-object receipt; null means no authoritative claim. */
  interpret(receipt: Readonly<Record<string, unknown>>, outcome: ReceiptOutcome): Exclude<GoalCompletionState, null> | null;
}

/** Bounded JSON envelope decoding; never recursively search arbitrary tool output. */
function receiptObject(raw: string): Readonly<Record<string, unknown>> | null {
  if (!raw.trim() || raw.length > 65_536) return null;
  let value: unknown = raw;
  for (let depth = 0; depth < 3; depth++) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return null; }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (Array.isArray(row.content) && row.content.length === 1) {
      const item = row.content[0];
      if (!item || typeof item !== 'object' || item.type !== 'text' || typeof item.text !== 'string') return null;
      value = item.text;
    } else if (typeof row.text === 'string' && Object.keys(row).length === 1) value = row.text;
    else return row;
  }
  return null;
}

/** No state is inferred when ownership or the receipt cannot be verified. */
export function goalCompletionEvidence(
  events: readonly ToolEvent[], conversationId: string, turnId: string,
  adapters: readonly GoalCompletionEvidenceAdapter[]
): GoalCompletionState {
  if (!conversationId || !turnId || !adapters.length) return null;
  let state: GoalCompletionState = null;
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const call = event.call;
    if (event.source !== 'mcp' || event.turnId !== turnId || call.conversationId !== conversationId ||
        call.attribution !== 'request_id' || call.attributionMethod !== 'request_id' ||
        typeof call.requestId !== 'string' || !call.requestId ||
        (call.outcome !== 'ok' && call.outcome !== 'tool_rejected') ||
        call.result.truncated || typeof call.result.text !== 'string') continue;
    const matching = adapters.filter(adapter => adapter.tools.includes(call.tool));
    if (!matching.length) continue;
    const receipt = receiptObject(call.result.text);
    if (!receipt) continue;
    for (const adapter of matching) {
      let interpreted: GoalCompletionState;
      try { interpreted = adapter.interpret(receipt, call.outcome); } catch { continue; }
      if (interpreted === 'blocked') state = 'blocked';
      else if (interpreted === 'work_remaining' && state === null) state = 'work_remaining';
    }
  }
  // A successful tool call, saved checkpoint or neutral receipt cannot clear an
  // earlier whole-task debt. Only the Goal's separate trusted completion contract can.
  return state;
}

/** Data-only, host-authored instructions. Raw receipts are never sent to the helper. */
export function goalCompletionConstraint(state: GoalCompletionState): string | null {
  if (state === 'work_remaining') return 'Verified evidence from a trusted tool in this exact turn shows unfinished work. A successful tool call or an assistant statement is not proof that the entire user objective is complete. Request one specific, safe next step within the existing objective. If none is safe, report the blocker instead of repeating work. Do not call tools in this decision helper.';
  if (state === 'blocked') return 'Verified evidence from a trusted tool in this exact turn reports a blocked or uncertain operation. Do not replay mutations or claim the task is complete. Request only safe reconciliation or a concrete actionable blocker, preserving the user Stop and operation ownership. Do not call tools in this decision helper.';
  return null;
}

export function goalCompletionContradictsStop(state: GoalCompletionState, action: string): boolean {
  return state !== null && action === 'stop';
}
