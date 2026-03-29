import Constants from 'expo-constants';

type SupabaseExtra = { supabaseUrl?: string; supabaseKey?: string };

function getExtra(): SupabaseExtra {
  return (Constants.expoConfig?.extra ?? {}) as SupabaseExtra;
}

function resolveUrl(): string | undefined {
  const fromExtra = getExtra().supabaseUrl?.trim();
  if (fromExtra) return fromExtra;
  return (
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  );
}

/** Chave anon (JWT) ou publishable (`sb_publishable_…`). */
function resolveKey(): string | undefined {
  const fromExtra = getExtra().supabaseKey?.trim();
  if (fromExtra) return fromExtra;
  return (
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(resolveUrl() && resolveKey());
}

export function getSupabaseUrl(): string {
  const url = resolveUrl();
  if (!url) {
    throw new Error(
      'Supabase URL em falta: defina NEXT_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_URL no .env.',
    );
  }
  return url;
}

export function getSupabaseApiKey(): string {
  const key = resolveKey();
  if (!key) {
    throw new Error(
      'Chave Supabase em falta: defina NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ou EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return key;
}
