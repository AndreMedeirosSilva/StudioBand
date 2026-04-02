const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export const MIN_PASSWORD_LENGTH = 10;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function getPasswordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/[a-z]/.test(password)) {
    return 'A senha precisa de pelo menos 1 letra minúscula.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'A senha precisa de pelo menos 1 letra maiúscula.';
  }
  if (!/\d/.test(password)) {
    return 'A senha precisa de pelo menos 1 número.';
  }
  return null;
}
