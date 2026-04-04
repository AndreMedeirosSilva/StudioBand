import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import type { PersistedProfile } from '../../storage/persistSession';
import { getSupabase } from './client';
import { isAppleAuthEnabled, isSupabaseConfigured } from './config';
import { buildPersistedProfileForUser } from './remoteRegistry';

WebBrowser.maybeCompleteAuthSession();

export type AppleSignInResult =
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

function getWebOAuthRedirectUrl(): string | null {
  const envRedirect =
    process.env.EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL?.trim() ||
    '';
  if (envRedirect) return envRedirect.replace(/\/$/, '');
  if (typeof window === 'undefined') return null;
  return `${window.location.origin}/`;
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!isSupabaseConfigured()) {
    return { kind: 'error', message: 'Entre com e-mail e senha para continuar.' };
  }
  if (!isAppleAuthEnabled()) {
    return { kind: 'error', message: 'Login com Apple ainda não está habilitado neste ambiente.' };
  }

  const sb = getSupabase();
  const redirectTo =
    Platform.OS === 'web' ? getWebOAuthRedirectUrl() ?? getOAuthRedirectUrl() : getOAuthRedirectUrl();

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    const m = (error.message ?? '').toLowerCase();
    if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
      return { kind: 'error', message: 'Ative o provedor Apple no Supabase para usar este login.' };
    }
    if (m.includes('redirect') || m.includes('callback') || m.includes('invalid')) {
      return { kind: 'error', message: 'Ajuste a URL de redirecionamento do Apple no Supabase e tente novamente.' };
    }
    return { kind: 'error', message: error.message || 'Falha ao iniciar com Apple.' };
  }
  if (!data.url) {
    return { kind: 'error', message: 'Não foi possível iniciar o acesso com Apple.' };
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(data.url);
    return { kind: 'redirect' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { showInRecents: false });

  if (result.type === 'dismiss' || result.type === 'cancel') {
    return { kind: 'error', message: 'Ação cancelada.' };
  }
  if (result.type !== 'success' || !result.url) {
    return { kind: 'error', message: 'Não foi possível concluir com Apple.' };
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
      message: 'Não consegui concluir o acesso com Apple. Tente novamente.',
    };
  }

  const {
    data: { session },
    error: sessErr,
  } = await sb.auth.getSession();
  if (sessErr || !session?.user) {
    return { kind: 'error', message: sessErr?.message ?? 'Sessão não criada com Apple.' };
  }

  const profile = await buildPersistedProfileForUser(session.user);
  if (!profile) {
    return {
      kind: 'error',
      message: 'Conta criada, mas não consegui carregar seu perfil agora.',
    };
  }

  return { kind: 'ok', profile };
}

