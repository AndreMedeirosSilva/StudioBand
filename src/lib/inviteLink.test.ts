import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'web' as 'web' | 'ios' | 'android' }));

vi.mock('react-native', () => ({
  Platform: platform,
}));

describe('inviteLink', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;
    platform.OS = 'web';
  });

  it('extrai token de URL, query string e texto simples', async () => {
    const { parseInviteToken } = await import('./inviteLink');
    expect(parseInviteToken('https://app.com/?join=inv_abc123')).toBe('inv_abc123');
    expect(parseInviteToken('join=inv_XYZ')).toBe('inv_XYZ');
    expect(parseInviteToken('código inv_foo_bar')).toBe('inv_foo_bar');
    expect(parseInviteToken('inv_raw')).toBe('inv_raw');
  });

  it('monta URL com origem configurada', async () => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://amstudioband.vercel.app/';
    const { buildInviteUrl } = await import('./inviteLink');
    expect(buildInviteUrl('inv_abc 123')).toBe('https://amstudioband.vercel.app/?join=inv_abc%20123');
  });

  it('usa fallback quando não está na web', async () => {
    platform.OS = 'ios';
    const { buildInviteUrl } = await import('./inviteLink');
    expect(buildInviteUrl('inv_abc')).toContain('https://estudiobanda.app/?join=inv_abc');
  });
});
