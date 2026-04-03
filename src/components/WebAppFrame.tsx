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
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />
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
    overflow: 'hidden',
  },
  glowTop: {
    position: 'absolute',
    top: -220,
    width: 640,
    height: 640,
    borderRadius: 320,
    backgroundColor: 'rgba(134, 120, 255, 0.16)',
    ...Platform.select({
      web: {
        filter: 'blur(48px)',
      },
      default: {},
    }),
  },
  glowBottom: {
    position: 'absolute',
    bottom: -260,
    right: -120,
    width: 620,
    height: 620,
    borderRadius: 310,
    backgroundColor: 'rgba(255, 190, 152, 0.16)',
    ...Platform.select({
      web: {
        filter: 'blur(56px)',
      },
      default: {},
    }),
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_APP_MAX_WIDTH,
    alignSelf: 'center',
    ...Platform.select({
      web: {
        marginVertical: 14,
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 28px 64px rgba(0,0,0,0.38)',
        backgroundColor: 'rgba(10, 11, 20, 0.82)',
      },
      default: {},
    }),
  },
});
