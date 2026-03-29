import { Platform } from 'react-native';
import { getConfiguredWebOrigin } from '../config/webOrigin';

/**
 * Link de convite para a web: sempre na raiz `/?join=TOKEN` (SPA).
 * Prioridade: `EXPO_PUBLIC_WEB_ORIGIN` → origem atual no browser → placeholder.
 */
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
