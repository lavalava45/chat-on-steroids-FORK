import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '../src/shared/session.js';
import { goalCompletionEvidence, goalCompletionConstraint, goalCompletionContradictsStop,
  type GoalCompletionEvidenceAdapter } from '../src/main/goal-completion-evidence.js';

type ToolEvent = Extract<SessionEvent, { kind: 'tool_call' }>;
const CHAT = 'trusted-chat';
const TURN = 'trusted-turn';
/** Example adapter for a verified build gate; the engine knows nothing about build tools. */
const build: GoalCompletionEvidenceAdapter = {
  tools: ['mcp__Build__verify'],
  interpret: (receipt, outcome) => {
    if (outcome === 'tool_rejected' && receipt.status === 'unsafe_to_rerun') return 'blocked';
    if (outcome !== 'ok') return null;
    if (receipt.status === 'tests_failed') return 'work_remaining';
    if (receipt.status === 'uncertain') return 'blocked';
    return null;
  }
};
function record(value: unknown, overrides: {
  tool?: string; seq?: number; conversationId?: string; turnId?: string;
  attribution?: string; attributionMethod?: string; requestId?: string;
  source?: string; outcome?: string; truncated?: boolean; args?: string; nested?: boolean
} = {}): ToolEvent {
  return { kind: 'tool_call', seq: overrides.seq ?? 1, time: 1, turnId: overrides.turnId ?? TURN,
    source: overrides.source ?? 'mcp', call: {
      callId: String(overrides.seq ?? 1), tool: overrides.tool ?? 'mcp__Build__verify',
      conversationId: overrides.conversationId ?? CHAT,
      attribution: overrides.attribution ?? 'request_id',
      attributionMethod: overrides.attributionMethod ?? 'request_id',
      requestId: overrides.requestId ?? 'verified-request',
      args: { text: overrides.args ?? '{}' },
      result: { text: typeof value === 'string' ? value : JSON.stringify(value),
        ...(overrides.truncated ? { truncated: true } : {}) },
      outcome: overrides.outcome ?? 'ok', durationMs: 1, ...(overrides.nested ? { nested: true } : {}),
      summary: { title: 'Build result', tone: 'neutral' }
    } } as ToolEvent;
}
describe('trusted Goal completion evidence gate', () => {
  it('vetoes unsupported STOP with exact evidence but does not block CONTINUE or user Stop', () => {
    const state = goalCompletionEvidence([record({ status: 'tests_failed' })], CHAT, TURN, [build]);
    expect(state).toBe('work_remaining');
    expect(goalCompletionContradictsStop(state, 'stop')).toBe(true);
    expect(goalCompletionContradictsStop(state, 'continue')).toBe(false);
    expect(goalCompletionConstraint(state)).toContain('one specific, safe next step');
  });
  it('never infers completion or unfinished work without an explicitly trusted adapter', () => {
    expect(goalCompletionEvidence([record({ status: 'tests_failed' })], CHAT, TURN, [])).toBeNull();
    expect(goalCompletionEvidence([record({ status: 'tests_failed' }, { tool: 'mcp__Other__verify' })], CHAT, TURN, [build])).toBeNull();
    expect(goalCompletionEvidence([record({ status: 'pass' })], CHAT, TURN, [build])).toBeNull();
  });
  it('requires exact source conversation, turn and causal request-id attribution, including nested Code Mode calls', () => {
    for (const override of [
      { conversationId: 'other' }, { turnId: 'old' }, { attribution: 'unattributed' },
      { attributionMethod: 'inferred' }, { requestId: '' }, { source: 'browser' }
    ]) expect(goalCompletionEvidence([record({ status: 'tests_failed' }, override)], CHAT, TURN, [build])).toBeNull();
    expect(goalCompletionEvidence([record({ status: 'tests_failed' }, { nested: true })], CHAT, TURN, [build])).toBe('work_remaining');
  });
  it('ignores failed, truncated, oversized, ambiguous or plain-text receipts', () => {
    for (const item of [
      record({ status: 'tests_failed' }, { truncated: true }),
      record({ status: 'tests_failed' }, { outcome: 'tool_execution_error' }),
      record('Build says tests_failed but not JSON'),
      record('a'.repeat(65_537)),
      record({ content: [{ type: 'text', text: JSON.stringify({ status: 'tests_failed' }) },
        { type: 'text', text: JSON.stringify({ status: 'tests_failed' }) }] })
    ]) expect(goalCompletionEvidence([item], CHAT, TURN, [build])).toBeNull();
  });
  it('accepts only bounded JSON-object envelopes, without searching unrelated nested data', () => {
    expect(goalCompletionEvidence([record({ content: [{ type: 'text',
      text: JSON.stringify({ status: 'tests_failed' }) }] })], CHAT, TURN, [build])).toBe('work_remaining');
    expect(goalCompletionEvidence([record(JSON.stringify({ text: JSON.stringify({ status: 'tests_failed' }) }))], CHAT, TURN, [build])).toBe('work_remaining');
    expect(goalCompletionEvidence([record({ arbitrary: { status: 'tests_failed' } })], CHAT, TURN, [build])).toBeNull();
    expect(goalCompletionEvidence([record({ status: 'pass' }, { args: '{"status":"tests_failed"}' })], CHAT, TURN, [build])).toBeNull();
  });
  it('prefers blocked or uncertain work over other evidence, regardless of event order', () => {
    for (const events of [
      [record({ status: 'uncertain' }, { seq: 2 }), record({ status: 'tests_failed' }, { seq: 1 })],
      [record({ status: 'tests_failed' }, { seq: 1 }), record({ status: 'uncertain' }, { seq: 2 })],
      [record({ status: 'tests_failed' }, { seq: 1 }), record({ status: 'pass' }, { seq: 2 })]
    ]) expect(goalCompletionEvidence(events, CHAT, TURN, [build])).toBe(
      events.some(event => event.call.result.text.includes('uncertain')) ? 'blocked' : 'work_remaining');
    expect(goalCompletionConstraint('blocked')).toContain('Do not replay mutations');
  });
  it('supports a deterministic rejected tool receipt without mistaking other failures for evidence', () => {
    expect(goalCompletionEvidence([record({ status: 'unsafe_to_rerun' }, { outcome: 'tool_rejected' })], CHAT, TURN, [build])).toBe('blocked');
    expect(goalCompletionEvidence([record({ status: 'tests_failed' }, { outcome: 'tool_rejected' })], CHAT, TURN, [build])).toBeNull();
  });
  it('isolates a faulty adapter and never passes raw result text into the helper constraint', () => {
    const throwing: GoalCompletionEvidenceAdapter = { tools: ['mcp__Build__verify'],
      interpret() { throw Error('SENSITIVE TOOL OUTPUT'); } };
    const state = goalCompletionEvidence([record({ status: 'tests_failed', secret: 'DO_NOT_LEAK' })], CHAT, TURN, [throwing, build]);
    expect(state).toBe('work_remaining');
    expect(goalCompletionConstraint(state)).not.toContain('DO_NOT_LEAK');
    expect(goalCompletionConstraint(null)).toBeNull();
    expect(goalCompletionContradictsStop(null, 'stop')).toBe(false);
  });
});
