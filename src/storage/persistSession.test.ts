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

describe('persistSession', () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it('salva e carrega sessão v2', async () => {
    const { loadPersistedSession, savePersistedSession } = await import('./persistSession');
    await savePersistedSession({
      profile: {
        userId: 'u1',
        email: 'u1@mail.com',
        displayName: 'User',
        bandName: null,
        bandIds: [],
        ownedBandId: null,
        ownedBandName: null,
        ownedInviteToken: null,
        studioName: 'Studio',
        ownerStudioId: 's1',
      },
      ownerStudio: {
        pricePerHour: 90,
        addressLine: 'Rua 1',
        logoUri: null,
        rooms: [],
        blockedRangesByRoomDate: {},
        bookings: [],
      },
      screen: 'home',
    });
    const loaded = await loadPersistedSession();
    expect(loaded?.v).toBe(2);
    expect(loaded?.profile.userId).toBe('u1');
    expect(loaded?.screen).toBe('home');
  });

  it('retorna null para payload inválido', async () => {
    storage.set(
      '@estudiobanda/session/v2',
      JSON.stringify({ v: 2, profile: { bad: true }, ownerStudio: {}, screen: 123 }),
    );
    const { loadPersistedSession } = await import('./persistSession');
    const loaded = await loadPersistedSession();
    expect(loaded).toBeNull();
  });
});
