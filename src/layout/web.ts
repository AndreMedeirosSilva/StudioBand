import { Platform } from 'react-native';

/** Largura máxima do conteúdo no navegador (coluna central). */
export const WEB_APP_MAX_WIDTH = 1120;

/** A partir desta largura da janela, o login usa layout em duas colunas. */
export const WEB_AUTH_SPLIT_MIN_WIDTH = 900;

/** A partir desta largura, o fluxo de agenda pode usar mais colunas (futuro). */
export const WEB_WIDE_MIN_WIDTH = 960;

export function isWeb(): boolean {
  return Platform.OS === 'web';
}
