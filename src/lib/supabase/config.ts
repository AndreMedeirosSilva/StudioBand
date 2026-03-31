import Constants from 'expo-constants';

type SupabaseExtra = { supabaseUrl?: string; supabaseKey?: string };

function getExtra(): SupabaseExtra {
  return (Constants.expoConfig?.extra ?? {}) as SupabaseExtra;
}

/** URL: inline EXPO_PUBLIC_* (bundle web), depois `extra` do app.config no build, por último NEXT_PUBLIC_* (Node). */
function resolveUrl(): string | undefined {
  const fromInline = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (fromInline) return fromInline;
  const fromExtra = getExtra().supabaseUrl?.trim();
  if (fromExtra) return fromExtra;
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
}

/** Chave anon (JWT) ou publishable (`sb_publishable_…`). */
function resolveKey(): string | undefined {
  const fromInline =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();
  if (fromInline) return fromInline;
  const fromExtra = getExtra().supabaseKey?.trim();
  if (fromExtra) return fromExtra;
  return (
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
