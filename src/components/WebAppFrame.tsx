import { Platform, View, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { COLORS } from '../theme';
import { WEB_APP_MAX_WIDTH } from '../layout/web';

type Props = { children: ReactNode };

/**
 * Na web: preenche a altura da viewport, centraliza uma coluna com largura máxima
 * e fundo full-bleed nas laterais (evita linhas largas demais em desktop).
 */
export function WebAppFrame({ children }: Props) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={[styles.shell, webShellViewport]}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

/** Garante altura mínima da janela no browser (RN Web aceita vh neste uso). */
const webShellViewport =
  Platform.OS === 'web' ? ({ minHeight: '100vh' } as Record<string, string>) : undefined;

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_APP_MAX_WIDTH,
    alignSelf: 'center',
  },
});
