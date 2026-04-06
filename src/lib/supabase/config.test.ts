import { beforeEach, describe, expect, it, vi } from 'vitest';

const extra = vi.hoisted(() => ({ supabaseUrl: undefined as string | undefined, supabaseKey: undefined as string | undefined }));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra,
    },
  },
}));

describe('supabase/config', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    delete process.env.EXPO_PUBLIC_ENABLE_APPLE_AUTH;
    delete process.env.EXPO_PUBLIC_ALLOW_INSECURE_LOCAL_AUTH;
    extra.supabaseUrl = undefined;
    extra.supabaseKey = undefined;
  });

  it('reconhece configuração e flags', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.EXPO_PUBLIC_ENABLE_APPLE_AUTH = 'true';
    process.env.EXPO_PUBLIC_ALLOW_INSECURE_LOCAL_AUTH = 'yes';
    const cfg = await import('./config');

    expect(cfg.isSupabaseConfigured()).toBe(true);
    expect(cfg.isGoogleAuthEnabled()).toBe(true);
    expect(cfg.isAppleAuthEnabled()).toBe(true);
    expect(cfg.isInsecureLocalAuthAllowed()).toBe(true);
    expect(cfg.getSupabaseUrl()).toContain('supabase.co');
  });

  it('lança erro quando falta configuração', async () => {
    const cfg = await import('./config');
    expect(cfg.isSupabaseConfigured()).toBe(false);
    expect(() => cfg.getSupabaseUrl()).toThrowError(/Supabase URL em falta/);
    expect(() => cfg.getSupabaseApiKey()).toThrowError(/Chave Supabase em falta/);
  });
});
