import { describe, expect, it } from 'vitest';
import { buildCompactIdentity, buildWindowTitle } from '../src/shared/build-identity.js';

describe('buildWindowTitle', () => {
  it('shows fork, branch and exact build commit in the native window title', () => {
    expect(buildWindowTitle('our-release', '408b1f2', 'slot-a')).toBe(
      '[lavalava45 Fork] Chat On Steroids [slot-a] — our-release @ 408b1f2'
    );
  });

  it('shows version, branch and commit in a compact in-app identity', () => {
    expect(buildCompactIdentity('2.1.14', 'our-release', '4372fee', 'slot-b')).toBe(
      'Fork v2.1.14 · slot-b · our-release @ 4372fee'
    );
  });
});
