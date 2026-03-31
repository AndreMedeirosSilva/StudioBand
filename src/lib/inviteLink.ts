import { Platform } from 'react-native';
import { getConfiguredWebOrigin } from '../config/webOrigin';

/**
 * Link de convite para a web: sempre na raiz `/?join=TOKEN` (SPA).
 * Prioridade: `EXPO_PUBLIC_WEB_ORIGIN` → origem atual no browser → placeholder.
 */
/**
 * Aceita o token `inv_…`, um URL com `?join=…`, ou texto que contenha `join=…` / `inv_…`.
 */
export function parseInviteToken(input: string): string {
  const s = input.trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const j = u.searchParams.get('join');
      if (j?.trim()) return j.trim();
    }
  } catch {
    /* ignore */
  }
  const joinEq = s.match(/(?:^|[?&#])join=([^&\s#]+)/i);
  if (joinEq?.[1]) {
    try {
      return decodeURIComponent(joinEq[1].trim());
    } catch {
      return joinEq[1].trim();
    }
  }
  const inv = s.match(/\b(inv_[a-z0-9_]+)\b/i);
  if (inv) return inv[1];
  return s;
}

export function buildInviteUrl(inviteToken: string): string {
  const t = encodeURIComponent(inviteToken.trim());
  const configured = getConfiguredWebOrigin();
  if (configured) {
    return `${configured}/?join=${t}`;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    return `${origin}/?join=${t}`;
  }
  return `https://estudiobanda.app/?join=${t}`;
}
