import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { COS_USER_DATA_DIRECTORY, cosUserDataPath, shouldUseCosUserData } from '../src/main/user-data.js';

describe('COS user-data profile', () => {
  it('keeps fork branding on the original Chat On Steroids profile directory', () => {
    const appData = path.join('C:', 'Users', 'example', 'AppData', 'Roaming');
    expect(COS_USER_DATA_DIRECTORY).toBe('chat-on-steroids');
    expect(cosUserDataPath(appData)).toBe(path.join(appData, 'chat-on-steroids'));
    expect(shouldUseCosUserData(appData, path.join(appData, 'renamed-cos-fork'))).toBe(true);
  });

  it('does not replace an explicitly external test or portable profile', () => {
    const appData = path.join('C:', 'Users', 'example', 'AppData', 'Roaming');
    const explicit = path.join('D:', 'cos-test', 'runtime');
    expect(shouldUseCosUserData(appData, explicit)).toBe(false);
  });
});
