import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import type { PersistedProfile } from '../../storage/persistSession';
import { getSupabase } from './client';
import { isSupabaseConfigured } from './config';
import { buildPersistedProfileForUser } from './remoteRegistry';

WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInResult =
  | { kind: 'ok'; profile: PersistedProfile }
  | { kind: 'redirect' }
  | { kind: 'error'; message: string };

function parseOAuthReturnUrl(url: string): {
  code: string | null;
  access_token: string | null;
  refresh_token: string | null;
} {
  let code: string | null = null;
  let access_token: string | null = null;
  let refresh_token: string | null = null;
  try {
    const hashIdx = url.indexOf('#');
    const queryEnd = hashIdx >= 0 ? hashIdx : url.length;
    const qIdx = url.indexOf('?');
    if (qIdx >= 0 && qIdx < queryEnd) {
      const qs = url.slice(qIdx + 1, queryEnd);
      const sp = new URLSearchParams(qs);
      code = sp.get('code');
    }
    if (hashIdx >= 0) {
      const hp = new URLSearchParams(url.slice(hashIdx + 1));
      access_token = hp.get('access_token');
      refresh_token = hp.get('refresh_token');
      if (!code) code = hp.get('code');
    }
  } catch {
    /* ignore */
  }
  return { code, access_token, refresh_token };
}

function getOAuthRedirectUrl(): string {
  return AuthSession.makeRedirectUri({
    scheme: 'estudiobanda',
    path: 'auth/callback',
  });
}

/**
 * Login com Google via Supabase. Na web redireciona a página inteira (`kind: 'redirect'`).
 * Em iOS/Android abre o browser e conclui com PKCE ou tokens no URL de retorno.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!isSupabaseConfigured()) {
    return { kind: 'error', message: 'Defina Supabase no .env para usar o Google.' };
  }

  const sb = getSupabase();
  const redirectTo =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname || '/'}`
      : getOAuthRedirectUrl();

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return { kind: 'error', message: error.message || 'Falha ao iniciar o Google.' };
  }
  if (!data.url) {
    return { kind: 'error', message: 'URL de autorização indisponível.' };
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(data.url);
    return { kind: 'redirect' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { showInRecents: false });

  if (result.type === 'dismiss' || result.type === 'cancel') {
    return { kind: 'error', message: 'Login cancelado.' };
  }
  if (result.type !== 'success' || !result.url) {
    return { kind: 'error', message: 'Não foi possível concluir o login com o Google.' };
  }

  const parsed = parseOAuthReturnUrl(result.url);

  if (parsed.code) {
    const { error: ex } = await sb.auth.exchangeCodeForSession(parsed.code);
    if (ex) {
      return { kind: 'error', message: ex.message };
    }
  } else if (parsed.access_token && parsed.refresh_token) {
    const { error: se } = await sb.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (se) {
      return { kind: 'error', message: se.message };
    }
  } else {
    return {
      kind: 'error',
      message:
        'Resposta do login sem código/tokens. No Supabase: Authentication → URL Configuration → adicione o redirect (ex.: estudiobanda://auth/callback).',
    };
  }

  const {
    data: { session },
    error: sessErr,
  } = await sb.auth.getSession();
  if (sessErr || !session?.user) {
    return { kind: 'error', message: sessErr?.message ?? 'Sessão não criada após o Google.' };
  }

  const profile = await buildPersistedProfileForUser(session.user);
  if (!profile) {
    return {
      kind: 'error',
      message: 'Conta Google ok, mas o perfil não foi lido (tabela profiles / RLS).',
    };
  }

  return { kind: 'ok', profile };
}
