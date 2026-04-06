import { beforeEach, describe, expect, it } from 'vitest';
import { getConfiguredWebOrigin } from './webOrigin';

describe('webOrigin', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;
  });

  it('retorna undefined quando não configurado', () => {
    expect(getConfiguredWebOrigin()).toBeUndefined();
  });

  it('remove barra final quando configurado', () => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://amstudioband.vercel.app/';
    expect(getConfiguredWebOrigin()).toBe('https://amstudioband.vercel.app');
  });
});
