export const FORK_RESTART_ARG = '--fork-restart';

export function forkRestartRequested(argv: readonly string[]): boolean {
  return argv.includes(FORK_RESTART_ARG);
}
