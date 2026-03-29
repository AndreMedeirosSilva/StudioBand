import type { PersistedProfile } from '../../storage/persistSession';
import { isSupabaseConfigured } from './config';
import { getSupabase } from './client';
import { buildPersistedProfileForUser } from './remoteRegistry';

/** Restaura o perfil a partir da sessão JWT do Supabase (se existir). */
export async function hydrateProfileFromSupabase(): Promise<PersistedProfile | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session?.user) return null;
    return await buildPersistedProfileForUser(session.user);
  } catch {
    return null;
  }
}
