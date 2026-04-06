import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  getPasswordPolicyError,
  isValidEmail,
  normalizeEmail,
} from './credentialsPolicy';

describe('credentialsPolicy', () => {
  it('normaliza e valida e-mail', () => {
    expect(normalizeEmail('  USER@Email.Com ')).toBe('user@email.com');
    expect(isValidEmail('foo@bar.com')).toBe(true);
    expect(isValidEmail('foo@bar')).toBe(false);
  });

  it('valida política de senha', () => {
    expect(getPasswordPolicyError('123')).toContain(String(MIN_PASSWORD_LENGTH));
    expect(getPasswordPolicyError('aaaaaaaaaa1')).toContain('maiúscula');
    expect(getPasswordPolicyError('AAAAAAAAAA1')).toContain('minúscula');
    expect(getPasswordPolicyError('Aaaaaaaaaa')).toContain('número');
    expect(getPasswordPolicyError('SenhaMuitoBoa1')).toBeNull();
  });
});
