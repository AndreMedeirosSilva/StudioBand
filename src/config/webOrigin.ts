/**
 * URL pública do site em produção (sem barra no fim).
 * Defina no `.env` ou no painel do host: `EXPO_PUBLIC_WEB_ORIGIN=https://seu-dominio.com`
 * Assim os links de convite apontam para o domínio certo mesmo ao gerar o link no localhost.
 */
export function getConfiguredWebOrigin(): string | undefined {
  if (typeof process === 'undefined' || !process.env?.EXPO_PUBLIC_WEB_ORIGIN) return undefined;
  const v = process.env.EXPO_PUBLIC_WEB_ORIGIN.trim();
  return v ? v.replace(/\/$/, '') : undefined;
}
