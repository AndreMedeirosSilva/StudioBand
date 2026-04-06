import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => (storage.has(key) ? (storage.get(key) as string) : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  },
}));

describe('loginRateLimiter', () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it('inicia desbloqueado', async () => {
    const { getLoginLockStatus } = await import('./loginRateLimiter');
    const status = await getLoginLockStatus('user@mail.com');
    expect(status.locked).toBe(false);
  });

  it('bloqueia após múltiplas tentativas falhas', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { getLoginLockStatus, registerFailedLoginAttempt } = await import('./loginRateLimiter');

    let message: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      message = await registerFailedLoginAttempt('user@mail.com');
    }
    expect(message).toMatch(/Muitas tentativas/);

    const status = await getLoginLockStatus('user@mail.com');
    expect(status.locked).toBe(true);
    expect(status.message).toBeTruthy();
    nowSpy.mockRestore();
  });

  it('limpa o bloqueio manualmente', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
    const { clearLoginRateLimit, getLoginLockStatus, registerFailedLoginAttempt } = await import('./loginRateLimiter');
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await registerFailedLoginAttempt('user@mail.com');
    }
    await clearLoginRateLimit('user@mail.com');
    const status = await getLoginLockStatus('user@mail.com');
    expect(status.locked).toBe(false);
    nowSpy.mockRestore();
  });
});
