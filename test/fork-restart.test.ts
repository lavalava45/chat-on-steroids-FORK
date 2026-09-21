import { describe, expect, it } from 'vitest';
import { forkRestartRequested } from '../src/main/fork-restart.js';

describe('forkRestartRequested', () => {
  it('recognizes only the explicit local fork restart flag', () => {
    expect(forkRestartRequested(['Chat On Steroids.exe', '--fork-restart'])).toBe(true);
    expect(forkRestartRequested(['Chat On Steroids.exe', '--background'])).toBe(false);
    expect(forkRestartRequested(['Chat On Steroids.exe', '--fork-restart-now'])).toBe(false);
  });
});
