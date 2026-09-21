const FORK_LABEL = '[lavalava45 Fork] Chat On Steroids';

export function buildWindowTitle(
  branch = __COS_BUILD_BRANCH__,
  commit = __COS_BUILD_COMMIT__
): string {
  return `${FORK_LABEL} — ${branch} @ ${commit}`;
}
