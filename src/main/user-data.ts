import path from 'node:path';

/**
 * Keep fork builds on the original Chat On Steroids profile.
 *
 * Electron derives its default userData folder from the application name. A fork may legitimately
 * change its visible/product name, but doing that must not strand an existing user's config,
 * secrets, sessions, plugin installations, or durable recovery state in the old profile.
 */
export const COS_USER_DATA_DIRECTORY = 'chat-on-steroids';

export function cosUserDataPath(appDataDir: string): string {
  return path.join(appDataDir, COS_USER_DATA_DIRECTORY);
}

/**
 * A normal Electron profile lives below appData and may move when application branding changes.
 * Explicit test/portable profiles commonly live elsewhere and must keep their caller-selected path.
 */
export function shouldUseCosUserData(appDataDir: string, currentUserDataDir: string): boolean {
  const relative = path.relative(path.resolve(appDataDir), path.resolve(currentUserDataDir));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
