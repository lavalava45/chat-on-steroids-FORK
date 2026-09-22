import path from 'node:path';

/**
 * The fork must never share mutable Electron/profile state with the author's installation.
 * A/B-specific directories are layered on by the runtime-release patch; this base patch keeps
 * an ordinary fork build on its own stable profile.
 */
export const FORK_USER_DATA_DIRECTORY = 'chat-on-steroids-FORK';

export function forkUserDataPath(appDataDir: string): string {
  const directory = typeof __COS_FORK_PROFILE_DIRECTORY__ === 'undefined'
    ? FORK_USER_DATA_DIRECTORY
    : __COS_FORK_PROFILE_DIRECTORY__;
  return path.join(appDataDir, directory);
}

/**
 * A normal Electron profile lives below appData and may move when application branding changes.
 * Explicit test/portable profiles commonly live elsewhere and must keep their caller-selected path.
 */
export function shouldUseForkUserData(appDataDir: string, currentUserDataDir: string): boolean {
  const relative = path.relative(path.resolve(appDataDir), path.resolve(currentUserDataDir));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
