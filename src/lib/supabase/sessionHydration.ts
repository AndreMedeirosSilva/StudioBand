import { Platform } from 'react-native';
import type { PersistedProfile } from '../../storage/persistSession';
import { isSupabaseConfigured } from './config';
import { getSupabase } from './client';
import { buildPersistedProfileForUser } from './remoteRegistry';

function webHasOAuthReturnInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hash;
  const s = window.location.search;
  return (
    h.includes('access_token') ||
    h.includes('refresh_token') ||
    h.includes('code=') ||
    s.includes('code=')
  );
}

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
    /**
     * Na web, após OAuth o Supabase pode demorar uns ms a ler tokens do hash/query.
     * Sem estes retries o arranque mostra login e depois salta para o painel — parece “segundo login”.
     */
    if (!profile && Platform.OS === 'web' && webHasOAuthReturnInUrl()) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 80));
        profile = await load();
        if (profile) break;
      }
    }
    return profile;
  } catch {
    return null;
  }
}
