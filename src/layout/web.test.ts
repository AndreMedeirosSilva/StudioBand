import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'web' as 'web' | 'ios' | 'android' }));

vi.mock('react-native', () => ({
  Platform: platform,
}));

describe('layout/web', () => {
  it('detecta web corretamente', async () => {
    const { WEB_APP_MAX_WIDTH, isWeb } = await import('./web');
    expect(WEB_APP_MAX_WIDTH).toBeGreaterThan(900);
    platform.OS = 'web';
    expect(isWeb()).toBe(true);
    platform.OS = 'ios';
    expect(isWeb()).toBe(false);
  });
});
