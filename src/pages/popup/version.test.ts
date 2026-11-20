import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './version';

describe('release version notification', () => {
  it('only advertises a numerically newer release', () => {
    expect(isNewerVersion('1.6.1', '1.6.2')).toBe(false);
    expect(isNewerVersion('1.6.2', '1.6.2')).toBe(false);
    expect(isNewerVersion('1.6.10', '1.6.2')).toBe(true);
    expect(isNewerVersion('1.6.2.1', '1.6.2')).toBe(true);
    expect(isNewerVersion('1.6.2', '1.6.2.0')).toBe(false);
    expect(isNewerVersion(undefined, '1.6.2')).toBe(false);
    expect(isNewerVersion('1.7.invalid', '1.6.2')).toBe(false);
  });
});
