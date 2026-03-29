import { View, Text, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

type Props = {
  onLogin: () => void;
  onRegister: () => void;
  onBookDemo: () => void;
};

export function WelcomeScreen({ onLogin, onRegister, onBookDemo }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = Math.min(28, Math.max(16, width * 0.06));
  const isWide = width >= 640;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + pad, paddingHorizontal: pad }]}>
      <View style={[styles.hero, isWide && styles.heroWide]}>
        <Text style={styles.badge}>bandas · estúdios · ensaios</Text>
        <Text style={styles.title}>Estudio Banda</Text>
        <Text style={styles.lead}>
          {Platform.OS === 'web'
            ? 'Pensado primeiro para o navegador: marque ensaios, cadastre sua banda ou estúdio e compartilhe o link com os membros — tudo a partir do site.'
            : 'Um lugar para bandas marcarem ensaio na agenda dos estúdios. Você pode ser músico, dono de estúdio — ou os dois.'}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onBookDemo}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Ver estúdios e marcar ensaio"
        >
          <Text style={styles.primaryText}>Marcar um ensaio</Text>
          <Text style={styles.primaryHint}>
            {Platform.OS === 'web' ? 'fluxo completo no site, sem instalar nada' : 'escolha estúdio, dia e horário em poucos toques'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onRegister}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Criar perfil de banda ou estúdio"
        >
          <Text style={styles.secondaryText}>Cadastrar banda ou estúdio</Text>
        </Pressable>

        <Pressable onPress={onLogin} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.ghostText}>Já tenho conta — entrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'space-between',
    ...Platform.select({
      web: {
        minHeight: '100vh' as never,
        maxWidth: 560,
        alignSelf: 'center',
        width: '100%',
      },
      default: {},
    }),
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
  heroWide: {
    maxWidth: 640,
  },
  badge: {
    alignSelf: 'flex-start',
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -1,
  },
  lead: {
    marginTop: 16,
    fontSize: 17,
    lineHeight: 26,
    color: COLORS.muted,
  },
  actions: {
    gap: 12,
    maxWidth: 440,
    width: '100%',
    alignItems: 'stretch',
    alignSelf: 'center',
  },
  primary: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  primaryText: {
    color: COLORS.accentText,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryHint: {
    marginTop: 4,
    color: COLORS.accentText,
    fontSize: 13,
    opacity: 0.85,
    textAlign: 'center',
  },
  secondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  secondaryText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  ghost: {
    paddingVertical: 12,
  },
  ghostText: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
