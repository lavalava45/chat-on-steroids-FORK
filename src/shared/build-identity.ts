const FORK_LABEL = '[lavalava45 Fork] Chat On Steroids';

export function buildWindowTitle(
  branch = __COS_BUILD_BRANCH__,
  commit = __COS_BUILD_COMMIT__,
  profile = typeof __COS_FORK_PROFILE__ === 'undefined' ? 'stable' : __COS_FORK_PROFILE__
): string {
  return `${FORK_LABEL} [${profile}] — ${branch} @ ${commit}`;
}

export function buildCompactIdentity(
  version = __COS_APP_VERSION__,
  branch = __COS_BUILD_BRANCH__,
  commit = __COS_BUILD_COMMIT__,
  profile = typeof __COS_FORK_PROFILE__ === 'undefined' ? 'stable' : __COS_FORK_PROFILE__
): string {
  return `Fork v${version} · ${profile} · ${branch} @ ${commit}`;
}
