import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { FORK_USER_DATA_DIRECTORY, forkUserDataPath, shouldUseForkUserData } from '../src/main/user-data.js';

describe('fork user-data profile', () => {
  it('keeps an ordinary fork build away from the author profile', () => {
    const appData = path.join('C:', 'Users', 'example', 'AppData', 'Roaming');
    expect(FORK_USER_DATA_DIRECTORY).toBe('chat-on-steroids-FORK');
    expect(forkUserDataPath(appData)).toBe(path.join(appData, 'chat-on-steroids-FORK'));
    expect(forkUserDataPath(appData)).not.toBe(path.join(appData, 'chat-on-steroids'));
    expect(shouldUseForkUserData(appData, path.join(appData, 'Chat On Steroids'))).toBe(true);
  });

  it('does not replace an explicitly external test or portable profile', () => {
    const appData = path.join('C:', 'Users', 'example', 'AppData', 'Roaming');
    const explicit = path.join('D:', 'cos-test', 'runtime');
    expect(shouldUseForkUserData(appData, explicit)).toBe(false);
  });
});
