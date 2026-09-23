import { describe, expect, it } from 'vitest';
import { forkRestartRequested } from '../src/main/fork-restart.js';
import { handoffLaunchPlan } from '../scripts/local-release-handoff.mjs';

describe('forkRestartRequested', () => {
  it('recognizes only the explicit local fork restart flag', () => {
    expect(forkRestartRequested(['Chat On Steroids.exe', '--fork-restart'])).toBe(true);
    expect(forkRestartRequested(['Chat On Steroids.exe', '--background'])).toBe(false);
    expect(forkRestartRequested(['Chat On Steroids.exe', '--fork-restart-now'])).toBe(false);
  });

  it('signals the running source slot before launching the isolated target slot', () => {
    const plan = handoffLaunchPlan('C:\\slot-b\\Chat On Steroids.exe', 'C:\\slot-a\\Chat On Steroids.exe');
    expect(plan).toEqual({
      restart: { exe: 'C:\\slot-b\\Chat On Steroids.exe', args: ['--fork-restart'] },
      target: { exe: 'C:\\slot-a\\Chat On Steroids.exe', args: [] }
    });
  });
});
