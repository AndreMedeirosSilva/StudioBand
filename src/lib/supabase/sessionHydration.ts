import { Platform } from 'react-native';
import type { PersistedProfile } from '../../storage/persistSession';
import { isSupabaseConfigured } from './config';
import { getSupabase } from './client';
import { buildPersistedProfileForUser } from './remoteRegistry';

/** Restaura o perfil a partir da sessão JWT do Supabase (se existir). */
export async function hydrateProfileFromSupabase(): Promise<PersistedProfile | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const load = async (): Promise<PersistedProfile | null> => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session?.user) return null;
      return buildPersistedProfileForUser(session.user);
    };
    let profile = await load();
    if (
      !profile &&
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      (window.location.hash.includes('access_token') ||
        window.location.hash.includes('code=') ||
        window.location.search.includes('code='))
    ) {
      await new Promise((r) => setTimeout(r, 80));
      profile = await load();
    }
    return profile;
  } catch {
    return null;
  }
}
