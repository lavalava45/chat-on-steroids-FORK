import type { GoalCompletionEvidenceAdapter } from './goal-completion-evidence.js';

/**
 * First-party allowlist of completion evidence interpreters.
 * Intentionally empty upstream: a plugin cannot self-register and thereby
 * veto the user's Goal. Applications may supply explicitly audited adapters.
 */
export const trustedGoalCompletionAdapters: readonly GoalCompletionEvidenceAdapter[] = [];
