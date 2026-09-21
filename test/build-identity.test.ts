import { describe, expect, it } from 'vitest';
import { buildWindowTitle } from '../src/main/build-identity.js';

describe('buildWindowTitle', () => {
  it('shows fork, branch and exact build commit in the native window title', () => {
    expect(buildWindowTitle('our-release', '408b1f2')).toBe(
      '[lavalava45 Fork] Chat On Steroids — our-release @ 408b1f2'
    );
  });
});
